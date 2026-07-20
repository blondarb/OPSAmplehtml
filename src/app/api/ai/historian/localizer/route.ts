/**
 * POST /api/ai/historian/localizer
 *
 * Background Localizer — Phase 2 of the Integrated Neuro Intake Engine.
 *
 * Fires every 3 completed user turns during an active historian session.
 * Runs a 3-step pipeline:
 *   1. Symptom extraction  — Bedrock Claude extracts structured symptoms from transcript
 *   2. Plan evidence       — neuro_plans DB match returns relevant guideline context
 *   3. Question generation — Bedrock Claude generates 2-3 follow-up questions + differential
 *
 * This route is designed to be:
 *   - Non-blocking: errors never crash the historian session
 *   - Latency-bounded: 2-second AbortController timeout with graceful degradation
 *   - Partially degradable: returns whatever steps completed if one fails
 */

import { NextRequest, NextResponse } from 'next/server'
import { invokeBedrockJSON } from '@/lib/bedrock'
import { from } from '@/lib/db-query'
import { getNeuroPlansPool } from '@/lib/db'
import { retrievePlanEvidence } from '@/lib/consult/planEvidence'
import type {
  LocalizerRequest,
  LocalizerResponse,
  ExtractedSymptoms,
  GeneratedQuestions,
  DifferentialEntry,
  SuggestedAction,
} from '@/lib/consult/localizer-types'

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCALIZER_TIMEOUT_MS = 15000
const MAX_SUGGESTED_ACTIONS = 4
const SUGGESTED_ACTION_FIELD_MAX_LEN = 200

// ── Prompts ───────────────────────────────────────────────────────────────────

const SYMPTOM_EXTRACTOR_PROMPT = `You are a clinical neurologist reviewing a patient intake transcript.
Extract a structured list of symptoms and clinical features from the conversation.

Return JSON matching this exact shape:
{
  "primarySymptoms": ["string"],
  "location": ["string"],
  "temporalPattern": ["string"],
  "severity": ["string"],
  "associatedFeatures": ["string"],
  "redFlags": ["string"],
  "clinicalSummary": "string"
}

Rules:
- Extract only what the patient has explicitly stated — do not infer or assume.
- redFlags: include only features that suggest serious pathology (thunderclap onset, fever, focal deficits, papilledema, progressive, meningismus, etc.).
- clinicalSummary: 1–2 sentences maximum describing the current clinical picture.
- If a field has no data, use an empty array [].
- Do not include assistant questions — only patient-reported content.`

const QUESTION_GENERATOR_PROMPT = `You are a clinical neurologist reviewing an in-progress patient intake.
You have been given:
  1. Structured symptoms extracted from the transcript so far
  2. Relevant excerpts from clinical neurology guidelines (AAN, IHS, AHA/ASA)
  3. The session type (new patient vs. follow-up)

Generate clinically targeted follow-up questions and a ranked differential diagnosis.

Return JSON matching this exact shape:
{
  "followUpQuestions": ["string", "string"],
  "differential": [
    {
      "diagnosis": "string",
      "icd10": "string or null",
      "rationale": "string",
      "likelihood": "high | medium | low"
    }
  ],
  "localizationHypothesis": "string",
  "contextHint": "string",
  "confidence": "high | medium | low",
  "suggested_actions": [
    {
      "action": "string",
      "rationale": "string",
      "source": "string"
    }
  ]
}

Rules for followUpQuestions:
- Generate exactly 2–3 questions.
- Each question should target a specific diagnostic gap not yet covered in the transcript.
- Questions should be phrased as if spoken naturally to a patient (plain language).
- Prioritize questions that would distinguish between the top 2 differential diagnoses.
- For follow-up sessions: focus on treatment response, interval change, functional impact.

Rules for differential:
- List 2–4 candidate diagnoses, most likely first.
- Base likelihood on what the patient has reported — not on general prevalence.
- If insufficient data to rank, default to medium for all.

Rules for localizationHypothesis:
- Use neuroanatomical language (e.g. "trigeminal pathway", "cortical spreading depression", "basal ganglia").
- One sentence. Empty string if insufficient data.

Rules for contextHint:
- Complete this sentence: "Based on what the patient has shared so far, clinical guidelines suggest..."
- One sentence maximum. This will be injected into the AI historian's system prompt.

Rules for confidence:
- high: ≥3 turns of detailed patient history, clear symptom pattern
- medium: 2–3 turns, some gaps in history
- low: <2 turns or very sparse information

Rules for suggested_actions:
- Produce up to 4 next-step actions for the care team (studies, labs, referrals, monitoring).
- When guideline context is provided, draw actions from it and set each action's source to the source plan's title; without guideline context, include only high-confidence actions and set source to "clinical judgment".
- Each action needs a one-sentence rationale specific to this patient.
- Never include drug dosages.
- These are suggestions for clinician review, not orders. Empty array if nothing warrants a suggestion.`

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTranscriptText(
  transcript: LocalizerRequest['transcript']
): string {
  return transcript
    .map((t) => `${t.role === 'user' ? 'Patient' : 'Historian'}: ${t.text}`)
    .join('\n')
}

/**
 * Citation shape kept compatible with the old Bedrock KB retrieval result
 * (text/sourceUri/documentTitle) so extractKBSources() and the
 * evidenceSnippets derivation in the response builder keep working
 * unchanged. Plan-evidence citations only ever populate `documentTitle`
 * (the matched plan's title) — `text` stays '' since a plan title isn't a
 * verbatim excerpt the way a KB chunk was.
 */
type LocalizerCitation = {
  text: string
  sourceUri?: string
  documentTitle?: string
}

function extractKBSources(citations: { sourceUri?: string; documentTitle?: string }[]): string[] {
  const sources = citations
    .map((c) => {
      if (c.documentTitle) return c.documentTitle
      if (c.sourceUri) {
        // Extract filename from S3 URI: s3://bucket/guidelines/aan_migraine_2019.pdf → aan_migraine_2019.pdf
        return c.sourceUri.split('/').pop() ?? c.sourceUri
      }
      return null
    })
    .filter((s): s is string => s !== null)

  // Deduplicate
  return [...new Set(sources)]
}

/**
 * Defensively parse the LLM's suggested_actions output into safe,
 * bounded SuggestedAction entries. Malformed entries (missing/non-string
 * fields) are dropped rather than surfaced — a suggestion the care team
 * can't read is worse than a shorter list.
 */
function sanitizeSuggestedActions(actions: unknown): SuggestedAction[] {
  if (!Array.isArray(actions)) return []

  const clean: SuggestedAction[] = []
  for (const entry of actions) {
    if (clean.length >= MAX_SUGGESTED_ACTIONS) break
    if (!entry || typeof entry !== 'object') continue

    const { action, rationale, source } = entry as Record<string, unknown>
    if (typeof action !== 'string' || !action.trim()) continue
    if (typeof rationale !== 'string' || !rationale.trim()) continue
    if (typeof source !== 'string' || !source.trim()) continue

    clean.push({
      action: action.trim().slice(0, SUGGESTED_ACTION_FIELD_MAX_LEN),
      rationale: rationale.trim().slice(0, SUGGESTED_ACTION_FIELD_MAX_LEN),
      source: source.trim().slice(0, SUGGESTED_ACTION_FIELD_MAX_LEN),
    })
  }
  return clean
}

/**
 * Persist the latest localizer results to the neurology_consults table.
 * Non-fatal — if the consult record doesn't exist or the write fails, we log and move on.
 */
async function persistLocalizerResults(
  sessionId: string,
  differential: DifferentialEntry[],
  followUpQuestions: string[],
  localizationHypothesis: string,
  kbSources: string[]
): Promise<void> {
  try {
    // Find the consult linked to this historian session
    const { data: consult } = await from('neurology_consults')
      .select('id, localizer_run_count')
      .eq('historian_session_id', sessionId)
      .maybeSingle()

    if (!consult) {
      // No linked consult — standalone historian session, nothing to update
      return
    }

    await from('neurology_consults')
      .update({
        localizer_differential: JSON.stringify(differential),
        localizer_questions: JSON.stringify(followUpQuestions),
        localizer_hypothesis: localizationHypothesis,
        localizer_kb_sources: JSON.stringify(kbSources),
        localizer_last_run_at: new Date().toISOString(),
        localizer_run_count: (consult.localizer_run_count ?? 0) + 1,
      })
      .eq('id', consult.id)
  } catch (err) {
    console.error('[localizer] Failed to persist results to neurology_consults:', err)
  }
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startMs = Date.now()

  // ── Parse and validate request ───────────────────────────────────────────
  let body: LocalizerRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { sessionId, sessionType, transcript, chiefComplaint, referralReason } = body

  if (!sessionId || !transcript || !Array.isArray(transcript)) {
    return NextResponse.json(
      { error: 'sessionId and transcript array are required' },
      { status: 400 }
    )
  }

  // Minimum data check — don't waste Bedrock calls on empty sessions
  const userTurns = transcript.filter((t) => t.role === 'user')
  if (userTurns.length === 0) {
    return NextResponse.json<LocalizerResponse>({
      differential: [],
      evidenceSnippets: [],
      followUpQuestions: [],
      contextHint: '',
      confidence: 'low',
      localizationHypothesis: '',
      kbSources: [],
      processingMs: Date.now() - startMs,
      partial: true,
      degradedReason: 'No user turns in transcript — skipping localizer.',
    })
  }

  // ── Abort controller (2-second hard timeout) ─────────────────────────────
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), LOCALIZER_TIMEOUT_MS)

  const signal = controller.signal

  // Accumulated results — populated progressively so partial responses are possible
  let symptoms: ExtractedSymptoms | null = null
  let kbGeneratedText = ''
  let kbCitations: LocalizerCitation[] = []
  let questions: GeneratedQuestions | null = null
  let degradedReason: string | undefined

  const transcriptText = buildTranscriptText(transcript)

  try {
    // ── Step 1: Symptom Extraction ─────────────────────────────────────────
    try {
      const userContext = [
        chiefComplaint ? `Chief complaint: ${chiefComplaint}` : '',
        referralReason ? `Referral reason: ${referralReason}` : '',
        `Session type: ${sessionType}`,
        '',
        'Transcript:',
        transcriptText,
      ]
        .filter(Boolean)
        .join('\n')

      const { parsed } = await invokeBedrockJSON<ExtractedSymptoms>({
        system: SYMPTOM_EXTRACTOR_PROMPT,
        messages: [{ role: 'user', content: userContext }],
        maxTokens: 500,
        temperature: 0,
        signal,
      })
      symptoms = parsed
    } catch (err) {
      if (signal.aborted) throw err // Let the outer catch handle timeout
      console.error('[localizer] Step 1 (symptom extraction) failed:', err)
      degradedReason = 'Symptom extraction failed'
    }

    // ── Step 2: Plan Evidence Retrieval (neuro_plans DB) ─────────────────────
    // Grounds the differential/questions/suggested-actions in vetted clinical
    // plans instead of the (deleted-in-prod, policy-blocked-from-recreation)
    // Bedrock Knowledge Base. No env-var gate — this always runs when we have
    // extracted symptoms to search on.
    if (symptoms) {
      try {
        const planPool = await getNeuroPlansPool()
        const planResult = await retrievePlanEvidence(planPool, {
          symptomTerms: [...symptoms.primarySymptoms, ...symptoms.redFlags],
          chiefComplaint,
          maxPlans: 3,
        })
        kbGeneratedText = planResult.guidelineText
        kbCitations = planResult.citations.map((title) => ({ documentTitle: title, text: '' }))
        if (!planResult.guidelineText) {
          degradedReason = degradedReason ?? 'Plan evidence retrieval unavailable'
        }
      } catch (err) {
        if (signal.aborted) throw err
        console.error('[localizer] Step 2 (plan evidence retrieval) failed:', err)
        degradedReason = degradedReason ?? 'Plan evidence retrieval unavailable'
      }
    }

    // ── Step 3: Question + Differential Generation ─────────────────────────
    if (symptoms) {
      try {
        const generatorInput = JSON.stringify({
          sessionType,
          chiefComplaint: chiefComplaint ?? null,
          extractedSymptoms: symptoms,
          guidelineContext: kbGeneratedText || '(No guideline context available — use clinical judgment)',
          transcriptSummary: symptoms.clinicalSummary,
        })

        const { parsed } = await invokeBedrockJSON<GeneratedQuestions>({
          system: QUESTION_GENERATOR_PROMPT,
          messages: [{ role: 'user', content: generatorInput }],
          maxTokens: 600,
          temperature: 0.3,
          signal,
        })
        questions = parsed
      } catch (err) {
        if (signal.aborted) throw err
        console.error('[localizer] Step 3 (question generation) failed:', err)
        degradedReason = degradedReason ?? 'Question generation failed'
      }
    }
  } catch (err) {
    // Timeout or unrecoverable error — return whatever we have
    const isTimeout = signal.aborted
    console.warn(
      isTimeout
        ? `[localizer] Timeout after ${LOCALIZER_TIMEOUT_MS}ms for session ${sessionId}`
        : `[localizer] Unrecoverable error for session ${sessionId}:`,
      isTimeout ? '' : err
    )
    degradedReason = isTimeout ? `Timeout after ${LOCALIZER_TIMEOUT_MS}ms` : 'Localizer pipeline error'
  } finally {
    clearTimeout(timeoutId)
  }

  // ── Persist to DB (fire-and-forget, non-fatal) ───────────────────────────
  if (questions && questions.differential.length > 0) {
    persistLocalizerResults(
      sessionId,
      questions.differential,
      questions.followUpQuestions,
      questions.localizationHypothesis,
      extractKBSources(kbCitations)
    ).catch((err) => {
      console.error('[localizer] DB persist error (non-fatal):', err)
    })
  }

  // ── Build response ───────────────────────────────────────────────────────
  const kbSources = extractKBSources(kbCitations)
  const evidenceSnippets = kbCitations.map((c) => c.text).filter(Boolean)

  const response: LocalizerResponse = {
    differential: questions?.differential ?? [],
    evidenceSnippets,
    followUpQuestions: questions?.followUpQuestions ?? [],
    contextHint: questions?.contextHint ?? '',
    confidence: questions?.confidence ?? 'low',
    localizationHypothesis: questions?.localizationHypothesis ?? '',
    kbSources,
    suggestedActions: sanitizeSuggestedActions(questions?.suggested_actions),
    processingMs: Date.now() - startMs,
    partial: Boolean(degradedReason),
    degradedReason,
  }

  // ── push_payload: Phase 5 of 2026-05-27 historian upgrade ─────────────────
  // Lightweight summary the client re-serializes into session.update
  // instructions every 3 turns. Additive field — older clients ignore it.
  const pushPayload = {
    top_differentials: (questions?.differential ?? [])
      .slice(0, 3)
      .map((d: any) => `${d.diagnosis ?? d.name ?? 'unknown'} (${d.confidence ?? 'medium'})`),
    suggested_next_question: questions?.followUpQuestions?.[0] ?? null,
    suggested_scale_id: null as string | null,
  }

  return NextResponse.json({
    ...response,
    push_payload: pushPayload,
  })
}

// ── GET /api/ai/historian/localizer — health check ────────────────────────────

export async function GET(): Promise<NextResponse> {
  // Grounding is sourced from the neuro_plans database (see Step 2), not a
  // Bedrock KB — so the localizer is "ready" as long as the pipeline is
  // deployed. BEDROCK_KB_ID is no longer consulted.
  return NextResponse.json({
    configured: true,
    grounding: 'neuro_plans_db',
    timeout: LOCALIZER_TIMEOUT_MS,
    status: 'ready',
  })
}
