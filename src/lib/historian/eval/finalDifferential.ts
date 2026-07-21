/**
 * Final full-transcript differential diagnosis pass.
 *
 * Historian Validation Suite, Task 2. Runs AFTER a historian interview
 * completes (fire-and-forget from POST /save — see runFinalDifferential
 * below), never during the live interview, and is a completely separate
 * code path from the historian's own realtime prompts — the historian
 * agent itself never diagnoses (prompt-hardened, by design). This module
 * produces a scoreable, citation-grounded differential for retrospective
 * QA/audit review (consumed by later sprint tasks: independent scorer,
 * batch harness) and for physician/QA-facing surfaces (DifferentialCard) —
 * never a patient-facing surface.
 *
 * Pipeline (mirrors the live Background Localizer's Step 1 + Step 2, then
 * one schema-forced final call in place of the localizer's free-JSON Step 3):
 *   1. Symptom extraction  — shared prompt with the localizer (see
 *      src/lib/consult/symptomExtractorPrompt.ts), applied to the COMPLETE
 *      transcript instead of the last few turns.
 *   2. Plan evidence        — same neuro_plans DB grounding as the localizer.
 *   3. Final differential   — ONE schema-forced Sonnet tool call, max 6
 *      diagnoses, every quote validated as a verbatim substring of the
 *      transcript turn it cites.
 */

import { getNeuroPlansPool } from '@/lib/db'
import { retrievePlanEvidence } from '@/lib/consult/planEvidence'
import { SYMPTOM_EXTRACTOR_PROMPT } from '@/lib/consult/symptomExtractorPrompt'
import { invokeBedrockClinicalToolWithMeta, invokeBedrockJSONWithMeta } from './bedrockMeta'
import { PROMPT_VERSIONS } from './constants'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'
import type { ExtractedSymptoms } from '@/lib/consult/localizer-types'

// ── Public types ─────────────────────────────────────────────────────────────

export interface EvalProvenance {
  model_id: string
  prompt_version: string
  inference_params: Record<string, unknown>
  generated_at: string
}

export interface DifferentialItem {
  diagnosis: string
  icd10: string | null
  likelihood: 'High' | 'Moderate' | 'Low'
  likelihood_pct: number
  rationale: string
  supporting_quotes: { turn: number; quote: string }[]
  contradicting_quotes: { turn: number; quote: string }[]
}

export interface FinalDifferential {
  differential: DifferentialItem[]
  summary: string
  provenance: EvalProvenance
  /**
   * Count of model-proposed quotes dropped because they were not verbatim
   * substrings of the transcript turn they cited (or cited an invalid
   * turn). Aggregated across every differential item's supporting AND
   * contradicting quotes. Quote text is never logged — this count is the
   * only signal surfaced for a drop.
   */
  dropped_quotes: number
}

/** Deterministic fail-closed guard — see generateFinalDifferential. */
export class TranscriptTooLargeError extends Error {
  readonly name = 'TranscriptTooLargeError'
  constructor(
    public readonly length: number,
    public readonly limit: number,
  ) {
    super(
      `Transcript too large for final differential generation (${length} chars serialized > ${limit} limit).`,
    )
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Serialized-transcript size guard (JSON.stringify length, chars). Fail-closed. */
export const MAX_TRANSCRIPT_CHARS = 60_000

const MAX_DIFFERENTIAL_ITEMS = 6
const MAX_QUOTES_PER_ITEM = 6
// Sourced from the registry (not a separately-hardcoded literal) so this
// can never drift from the id PROMPT_VERSIONS advertises for 'final-ddx-v1'.
const FINAL_DDX_PROMPT_VERSION = PROMPT_VERSIONS['final-ddx-v1'].id
const FINAL_DDX_TOOL_NAME = 'record_final_differential'
const FINAL_DDX_TEMPERATURE = 0
// Up to 6 diagnoses × (diagnosis/icd10/likelihood/rationale + up to 6
// supporting + 6 contradicting verbatim quotes each) + a summary paragraph
// is a genuinely large tool-call payload. invokeBedrockClinicalTool fails
// closed on max_tokens (a truncated tool call can't be JSON-repaired the
// way free-text JSON can) — live-gate testing against the full 5-persona
// fixture set (2026-07-20) showed 2500 was too tight and every call
// truncated; 4000 gives real headroom without materially changing cost.
const FINAL_DDX_MAX_TOKENS = 4000
// The full-transcript pass sees far more turns than the live localizer's
// incremental (last 6-10 turns) calls, so its extracted-symptoms JSON is
// naturally larger — 700 truncated on the longer personas in the same
// live-gate run; 1200 covers the 5-persona fixture set with headroom.
const SYMPTOM_EXTRACTION_MAX_TOKENS = 1200

const FINAL_DDX_TOOL_DESCRIPTION =
  'Record the final, full-transcript differential diagnosis for this completed AI Historian ' +
  'interview. Called exactly once per session as a retrospective QA/audit artifact — never ' +
  'shown to the patient and never used for real-time clinical decisions.'

const FINAL_DDX_SYSTEM_PROMPT = `You are a neurologist producing a FINAL differential diagnosis from a COMPLETE patient intake transcript, for retrospective quality-review purposes.

You will receive:
  1. The full numbered transcript (each line prefixed "Turn N (Patient|Historian): ...").
  2. Structured symptoms already extracted from that transcript.
  3. Relevant excerpts from vetted clinical guidelines/plans, when available.

Produce up to ${MAX_DIFFERENTIAL_ITEMS} candidate diagnoses, ranked most likely first, and a one-paragraph summary.

CRITICAL — quote grounding:
- Every supporting_quotes and contradicting_quotes entry MUST be a VERBATIM, character-for-character substring copied from the numbered transcript's turn text — do not paraphrase, truncate mid-word, or combine text from two turns.
- "turn" is the integer N from that quote's "Turn N" line.
- contradicting_quotes cites evidence that argues AGAINST that diagnosis (may be an empty array — do not invent contradicting evidence that is not in the transcript).
- If you cannot find a verbatim supporting quote for a diagnosis, you may still list it (grounded in the extracted symptoms/guideline context) but leave supporting_quotes empty rather than fabricate one.
- Up to ${MAX_QUOTES_PER_ITEM} quotes per list per item.

Other rules:
- diagnosis: display name (e.g. "Migraine without aura").
- icd10: an ICD-10 code if determinable, otherwise null. Never invent a code you are not reasonably confident in.
- likelihood: exactly one of "High", "Moderate", "Low".
- likelihood_pct: your estimated probability 0-100, consistent with the likelihood band.
- rationale: 1-2 sentences grounded in the transcript and, when available, the guideline context.
- summary: one paragraph synthesizing the overall clinical picture and the reasoning behind the ranking.
- Base everything on what the patient/historian actually said and the provided guideline context — never invent clinical findings.`

// ── Tool schema (mirrors DifferentialItem[]) ──────────────────────────────────

const QUOTE_SCHEMA = {
  type: 'object',
  properties: {
    turn: {
      type: 'integer',
      minimum: 0,
      description: 'Turn index (the integer N from "Turn N" in the numbered transcript).',
    },
    quote: {
      type: 'string',
      description: 'Verbatim substring copied exactly from that turn\'s text.',
    },
  },
  required: ['turn', 'quote'],
} as const

const DIFFERENTIAL_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    diagnosis: { type: 'string' },
    icd10: { type: ['string', 'null'] },
    likelihood: { type: 'string', enum: ['High', 'Moderate', 'Low'] },
    likelihood_pct: { type: 'number', minimum: 0, maximum: 100 },
    rationale: { type: 'string' },
    supporting_quotes: {
      type: 'array',
      items: QUOTE_SCHEMA,
      maxItems: MAX_QUOTES_PER_ITEM,
    },
    contradicting_quotes: {
      type: 'array',
      items: QUOTE_SCHEMA,
      maxItems: MAX_QUOTES_PER_ITEM,
    },
  },
  required: [
    'diagnosis',
    'icd10',
    'likelihood',
    'likelihood_pct',
    'rationale',
    'supporting_quotes',
    'contradicting_quotes',
  ],
} as const

const FINAL_DDX_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    differential: {
      type: 'array',
      items: DIFFERENTIAL_ITEM_SCHEMA,
      minItems: 1,
      maxItems: MAX_DIFFERENTIAL_ITEMS,
    },
    summary: { type: 'string' },
  },
  required: ['differential', 'summary'],
} as const

interface FinalDdxToolOutput {
  differential: unknown[]
  summary: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function serializedTranscriptLength(transcript: HistorianTranscriptEntry[]): number {
  return JSON.stringify(transcript).length
}

function buildNumberedTranscriptText(transcript: HistorianTranscriptEntry[]): string {
  return transcript
    .map((t, i) => `Turn ${i} (${t.role === 'user' ? 'Patient' : 'Historian'}): ${t.text}`)
    .join('\n')
}

function isVerbatimQuote(
  transcript: HistorianTranscriptEntry[],
  turn: unknown,
  quote: unknown,
): turn is number {
  if (!Number.isInteger(turn) || typeof quote !== 'string' || quote.length === 0) return false
  const t = turn as number
  if (t < 0 || t >= transcript.length) return false
  return transcript[t].text.includes(quote)
}

/** Keep only verbatim-quoted entries; count how many were dropped. Never logs quote text. */
function sanitizeQuotes(
  transcript: HistorianTranscriptEntry[],
  quotes: unknown,
): { kept: { turn: number; quote: string }[]; dropped: number } {
  if (!Array.isArray(quotes)) return { kept: [], dropped: 0 }

  const kept: { turn: number; quote: string }[] = []
  let dropped = 0
  for (const q of quotes) {
    if (q && typeof q === 'object' && 'turn' in q && 'quote' in q) {
      const { turn, quote } = q as { turn: unknown; quote: unknown }
      if (isVerbatimQuote(transcript, turn, quote)) {
        kept.push({ turn, quote: quote as string })
        continue
      }
    }
    dropped++
  }
  return { kept, dropped }
}

function sanitizeLikelihood(value: unknown): DifferentialItem['likelihood'] {
  return value === 'High' || value === 'Moderate' || value === 'Low' ? value : 'Moderate'
}

function sanitizeLikelihoodPct(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

function sanitizeIcd10(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Defensively normalize + validate the model's raw tool output into safe DifferentialItem[]. */
function sanitizeDifferential(
  transcript: HistorianTranscriptEntry[],
  raw: unknown,
): { items: DifferentialItem[]; droppedQuotes: number } {
  if (!Array.isArray(raw)) return { items: [], droppedQuotes: 0 }

  let droppedQuotes = 0
  const items: DifferentialItem[] = []

  for (const entry of raw.slice(0, MAX_DIFFERENTIAL_ITEMS)) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (typeof e.diagnosis !== 'string' || !e.diagnosis.trim()) continue

    const supporting = sanitizeQuotes(transcript, e.supporting_quotes)
    const contradicting = sanitizeQuotes(transcript, e.contradicting_quotes)
    droppedQuotes += supporting.dropped + contradicting.dropped

    items.push({
      diagnosis: e.diagnosis.trim(),
      icd10: sanitizeIcd10(e.icd10),
      likelihood: sanitizeLikelihood(e.likelihood),
      likelihood_pct: sanitizeLikelihoodPct(e.likelihood_pct),
      rationale: typeof e.rationale === 'string' ? e.rationale.trim() : '',
      supporting_quotes: supporting.kept,
      contradicting_quotes: contradicting.kept,
    })
  }

  return { items, droppedQuotes }
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Generate the final full-transcript differential for a completed historian
 * session. Pure w.r.t. side effects other than the two Bedrock calls (and
 * one read-only neuro_plans DB query) — does not persist anything; see
 * runFinalDifferential for the fire-and-forget persistence wrapper used by
 * POST /save.
 *
 * Fail-closed: throws TranscriptTooLargeError before invoking Bedrock at
 * all if the serialized transcript exceeds MAX_TRANSCRIPT_CHARS. Any other
 * failure (Bedrock error, DB error) propagates to the caller — callers that
 * want "never throws" semantics (the save-route hook) must catch.
 */
export async function generateFinalDifferential(
  transcript: HistorianTranscriptEntry[],
  chiefComplaint?: string,
): Promise<FinalDifferential> {
  const serializedLength = serializedTranscriptLength(transcript)
  if (serializedLength > MAX_TRANSCRIPT_CHARS) {
    throw new TranscriptTooLargeError(serializedLength, MAX_TRANSCRIPT_CHARS)
  }

  const numberedTranscript = buildNumberedTranscriptText(transcript)

  // ── Step 1: symptom extraction (shared prompt with the live localizer) ──
  // Routed through the WithMeta wrapper (like Step 3) for symmetric
  // provenance capture across both calls, even though Step 1's usage/
  // latency isn't persisted anywhere yet — keeps both call sites on the
  // same invocation path rather than one raw and one wrapped.
  const { result: symptoms } = await invokeBedrockJSONWithMeta<ExtractedSymptoms>({
    system: SYMPTOM_EXTRACTOR_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          chiefComplaint ? `Chief complaint: ${chiefComplaint}` : '',
          '',
          'Transcript:',
          numberedTranscript,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    maxTokens: SYMPTOM_EXTRACTION_MAX_TOKENS,
    temperature: 0,
  })

  // ── Step 2: plan-grounded evidence (same neuro_plans DB as the localizer) ──
  // Non-fatal — a grounding failure degrades to "no guideline context",
  // matching the live localizer's own Step 2 error handling.
  let guidelineText = ''
  try {
    const pool = await getNeuroPlansPool()
    const evidence = await retrievePlanEvidence(pool, {
      symptomTerms: [...symptoms.primarySymptoms, ...symptoms.redFlags],
      chiefComplaint,
      maxPlans: 3,
    })
    guidelineText = evidence.guidelineText
  } catch (err) {
    console.error('[historian/eval] plan evidence retrieval failed (non-fatal):', err)
  }

  // ── Step 3: ONE schema-forced final differential call ───────────────────
  const { result, modelId } = await invokeBedrockClinicalToolWithMeta<FinalDdxToolOutput>({
    system: FINAL_DDX_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          chiefComplaint: chiefComplaint ?? null,
          extractedSymptoms: symptoms,
          guidelineContext: guidelineText || '(No guideline context available — use clinical judgment)',
          numberedTranscript,
        }),
      },
    ],
    maxTokens: FINAL_DDX_MAX_TOKENS,
    temperature: FINAL_DDX_TEMPERATURE,
    toolName: FINAL_DDX_TOOL_NAME,
    toolDescription: FINAL_DDX_TOOL_DESCRIPTION,
    inputSchema: FINAL_DDX_INPUT_SCHEMA,
  })

  const { items, droppedQuotes } = sanitizeDifferential(transcript, result.differential)

  return {
    differential: items,
    summary: typeof result.summary === 'string' ? result.summary.trim() : '',
    provenance: {
      model_id: modelId,
      prompt_version: FINAL_DDX_PROMPT_VERSION,
      inference_params: {
        temperature: FINAL_DDX_TEMPERATURE,
        max_tokens: FINAL_DDX_MAX_TOKENS,
        tool: FINAL_DDX_TOOL_NAME,
      },
      generated_at: new Date().toISOString(),
    },
    dropped_quotes: droppedQuotes,
  }
}

// ── Fire-and-forget persistence wrapper (used by POST /save) ─────────────────

/**
 * Generate + persist the final differential for one session, catching
 * everything. Intended to be called `void`-style (fire-and-forget) right
 * after POST /save's row insert — never throws, never awaited by the save
 * response.
 *
 * Persists via a raw UPDATE (not the from() query builder) so the JSONB
 * payload is pre-stringified explicitly at the call site, per the
 * db-query.ts array/object auto-stringify gotcha documented in save/route.ts.
 *
 * If historian_sessions.final_differential doesn't exist yet (migration 057
 * not applied — expected until the rollout task applies it), logs one quiet
 * informational line, not an error, mirroring the historian_transcript_events
 * 42P01 precedent from Task 1.
 */
export async function runFinalDifferential(
  sessionId: string,
  transcript: HistorianTranscriptEntry[],
  chiefComplaint?: string,
): Promise<void> {
  let result: FinalDifferential
  try {
    result = await generateFinalDifferential(transcript, chiefComplaint)
  } catch (err) {
    if (err instanceof TranscriptTooLargeError) {
      console.warn(
        '[historian/eval] skipping final differential — transcript too large for session',
        sessionId,
      )
    } else {
      console.error(
        '[historian/eval] final differential generation failed (non-fatal) for session',
        sessionId,
        err,
      )
    }
    return
  }

  try {
    const { getPool } = await import('@/lib/db')
    const pool = await getPool()
    await pool.query('UPDATE historian_sessions SET final_differential = $1 WHERE id = $2', [
      JSON.stringify(result),
      sessionId,
    ])
  } catch (err: unknown) {
    const pgCode = (err as { code?: string } | undefined)?.code
    if (pgCode === '42703') {
      // final_differential column doesn't exist yet — expected and benign
      // until the rollout task applies migration 057.
      console.info(
        '[historian/eval] historian_sessions.final_differential not present yet (migration 057 not applied) — skipping persist for session',
        sessionId,
      )
    } else {
      console.error(
        '[historian/eval] failed to persist final differential (non-fatal) for session',
        sessionId,
        err,
      )
    }
  }
}
