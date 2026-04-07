/**
 * POST /api/ai/historian/localizer
 *
 * Background Localizer — Phase 2 of the Integrated Neuro Intake Engine.
 *
 * Fires every 3 completed user turns during an active historian session.
 * Runs a 3-step pipeline:
 *   1. Symptom extraction  — Bedrock Claude extracts structured symptoms from transcript
 *   2. KB retrieval        — Evidence Engine (Bedrock KB) returns relevant guideline context
 *   3. Question generation — Bedrock Claude generates 2-3 follow-up questions + differential
 *
 * This route is designed to be:
 *   - Non-blocking: errors never crash the historian session
 *   - Latency-bounded: 2-second AbortController timeout with graceful degradation
 *   - Partially degradable: returns whatever steps completed if one fails
 */

import { NextRequest, NextResponse } from 'next/server'
import { invokeBedrockJSON, retrieveFromKB } from '@/lib/bedrock'
import { from } from '@/lib/db-query'
import type {
  LocalizerRequest,
  LocalizerResponse,
  ExtractedSymptoms,
  GeneratedQuestions,
  DifferentialEntry,
} from '@/lib/consult/localizer-types'

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCALIZER_TIMEOUT_MS = 15000
const KB_RESULTS = 5

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
  "confidence": "high | medium | low"
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
- low: <2 turns or very sparse information`

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTranscriptText(
  transcript: LocalizerRequest['transcript']
): string {
  return transcript
    .map((t) => `${t.role === 'user' ? 'Patient' : 'Historian'}: ${t.text}`)
    .join('\n')
}

function buildKBQuery(
  symptoms: ExtractedSymptoms,
  chiefComplaint?: string
): string {
  const parts: string[] = []
  if (chiefComplaint) parts.push(chiefComplaint)
  if (symptoms.primarySymptoms.length > 0) {
    parts.push(symptoms.primarySymptoms.join(', '))
  }
  if (symptoms.redFlags.length > 0) {
    parts.push(`red flags: ${symptoms.redFlags.join(', ')}`)
  }
  if (symptoms.clinicalSummary) parts.push(symptoms.clinicalSummary)
  return (
    parts.join('. ') ||
    'neurology outpatient clinical evaluation diagnostic approach'
  )
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
  let kbCitations: Awaited<ReturnType<typeof retrieveFromKB>>['citations'] = []
  let questions: GeneratedQuestions | null = null
  let degradedReason: string | undefined

  const transcriptText = buildTranscriptText(transcript)
  const kbId = process.env.BEDROCK_KB_ID

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

    // ── Step 2: KB Retrieval ───────────────────────────────────────────────
    if (kbId && symptoms) {
      try {
        const kbQuery = buildKBQuery(symptoms, chiefComplaint)
        const kbResult = await retrieveFromKB({
          knowledgeBaseId: kbId,
          query: kbQuery,
          numberOfResults: KB_RESULTS,
          signal,
        })
        kbGeneratedText = kbResult.generatedText
        kbCitations = kbResult.citations
      } catch (err) {
        if (signal.aborted) throw err
        console.error('[localizer] Step 2 (KB retrieval) failed:', err)
        degradedReason = degradedReason ?? 'KB retrieval failed or BEDROCK_KB_ID not configured'
      }
    } else if (!kbId) {
      console.warn('[localizer] BEDROCK_KB_ID not set — skipping KB retrieval (Step 2)')
      degradedReason = degradedReason ?? 'BEDROCK_KB_ID not configured'
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
    processingMs: Date.now() - startMs,
    partial: Boolean(degradedReason),
    degradedReason,
  }

  return NextResponse.json<LocalizerResponse>(response)
}

// ── GET /api/ai/historian/localizer — health check ────────────────────────────

export async function GET(): Promise<NextResponse> {
  const kbId = process.env.BEDROCK_KB_ID ?? null
  return NextResponse.json({
    configured: Boolean(kbId),
    kbId: kbId ? `${kbId.slice(0, 8)}...` : null,
    timeout: LOCALIZER_TIMEOUT_MS,
    status: kbId ? 'ready' : 'unconfigured (BEDROCK_KB_ID not set)',
  })
}
