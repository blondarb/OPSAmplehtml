/**
 * AI Historian thoroughness judge (Historian Validation Suite Task 3).
 *
 * Scores whether a COMPLETED historian interview gathered clinically
 * appropriate data, against a syndrome-matched, (eventually) clinician-
 * vetted rubric (rubric.ts). This is a separate, post-session evaluation
 * pass — never the live historian agent itself, which never diagnoses
 * (historianPrompts.ts CORE_PROMPT rules 3-4) and has no knowledge this
 * judge exists.
 *
 * Two layers, always both present in the result:
 *   1. Deterministic pre-layer (deterministicChecks.ts) — diagnosis-leak
 *      lexicon, phase-marker presence, turn cap, structured-output shape.
 *      Runs first; its findings are ALWAYS appended into the final result,
 *      never skipped or gated on what the LLM says.
 *   2. One schema-forced Sonnet tool call, with the loaded rubric's
 *      critical_questions inlined into the prompt, scoring 6 fixed
 *      dimensions (oldcarts, red_flags, pmh_meds_allergies, fh_sh,
 *      question_quality, closure) plus missed_critical_questions,
 *      diagnosis_leak, an optional fidelity screen (only when `reports`
 *      are supplied), overall, and confidence.
 *
 * Every LLM-claimed finding is defensively sanitized against ground truth
 * this module already has, rather than trusted verbatim — mirroring
 * finalDifferential.ts's verbatim-quote-checking pattern:
 *   - missed_critical_questions[].rubric_id must reference a real id in the
 *     loaded rubric; its severity is OVERRIDDEN from the rubric's own
 *     record (never trusted from the model), and overall is capped at 85
 *     if any surviving entry is severity "critical" — enforced here as a
 *     deterministic backstop to the same instruction given to the model.
 *   - diagnosis_leak quotes must be verbatim substrings of the cited
 *     ASSISTANT turn; the deterministic scanner's own hits are always
 *     folded in regardless of what the model reported.
 *   - fidelity fabricated_claims[].report must reference a key actually
 *     present in the `reports` option.
 * Anything that fails validation is dropped and counted in
 * dropped_findings, never silently passed through.
 */

import { invokeBedrockClinicalToolWithMeta } from './bedrockMeta'
import { PROMPT_VERSIONS } from './constants'
import { loadRubric } from './rubric'
import { runDeterministicChecks, type DeterministicCheckResult } from './deterministicChecks'
import { MAX_TRANSCRIPT_CHARS, TranscriptTooLargeError } from './finalDifferential'
import { persistEvaluation } from './persistEvaluation'
import type { BedrockTokenUsage } from '@/lib/bedrock'
import type { HistorianTranscriptEntry, HistorianStructuredOutput } from '@/lib/historianTypes'

// ── Public types ─────────────────────────────────────────────────────────────

export interface DimensionScore {
  score: number
  evidence_turns: number[]
  notes: string
}

const DIMENSION_KEYS = [
  'oldcarts',
  'red_flags',
  'pmh_meds_allergies',
  'fh_sh',
  'question_quality',
  'closure',
] as const
type DimensionKey = (typeof DIMENSION_KEYS)[number]

export type RubricSeverity = 'critical' | 'important' | 'minor'

export interface MissedCriticalQuestion {
  rubric_id: string
  severity: RubricSeverity
  why_it_matters: string
}

export interface DiagnosisLeakQuote {
  turn: number
  quote: string
  source: 'llm' | 'deterministic'
}

export interface FidelityFinding {
  fabricated_claims: { report: string; claim: string }[]
  material_omissions: { transcript_turn: number; omission: string }[]
}

export interface ThoroughnessConfidence {
  level: 'High' | 'Moderate' | 'Low'
  reason: string
}

export interface ThoroughnessProvenance {
  model_id: string
  prompt_version: string
  rubric_version: string
  inference_params: Record<string, unknown>
  generated_at: string
}

export type ThoroughnessEvaluation = {
  [K in DimensionKey]: DimensionScore
} & {
  missed_critical_questions: MissedCriticalQuestion[]
  diagnosis_leak: { leaked: boolean; quotes: DiagnosisLeakQuote[] }
  /** Only non-null when `reports` was supplied to generateThoroughnessEvaluation. */
  fidelity: FidelityFinding | null
  overall: number
  confidence: ThoroughnessConfidence
  /** True whenever the rubric contributing to this evaluation (base and/or syndrome) has vetted_by === null — Task 5's reports self-label as "developer baseline — not clinician-vetted" on this flag. */
  unvetted: boolean
  /** Always present — the deterministic pre-layer's findings, appended regardless of what the LLM reported. */
  deterministic: DeterministicCheckResult
  /** Count of LLM-claimed findings dropped by defensive sanitization (invalid rubric_id refs, non-verbatim leak quotes, unrecognized report labels, out-of-bounds evidence_turns). */
  dropped_findings: number
  /**
   * True when at least one severity:"critical" rubric item has an
   * unmatched coverage_hints lexical screen (deterministicChecks.ts's
   * computeCriticalCoverage — hint_matched === false) that the model
   * nonetheless did NOT list in missed_critical_questions. This is an
   * AUDIT signal only — Task 5's reports surface it for human review — and
   * never affects `overall` (see the trust-boundary comment above the
   * overall-capping logic below). False when every unmatched hint was
   * also flagged by the model, or when there were no unmatched hints.
   */
  coverage_disagreement: boolean
  provenance: ThoroughnessProvenance
}

export interface ThoroughnessJudgeOptions {
  chiefComplaint?: string
  /** Explicit syndrome override — takes priority over chiefComplaint-based detection. Falls back to base-only if unrecognized. */
  syndrome?: string
  structuredOutput?: HistorianStructuredOutput | null
  narrativeSummary?: string | null
  /**
   * label -> report text. Fidelity dimension is included in the
   * schema/result only when this is non-empty.
   *
   * SCOPE (as of Task 3): at save time, `narrative_summary` is the ONLY
   * report that exists — save/route.ts is the sole current caller and
   * only ever passes `{narrative_summary}`. Other physician/QA-facing
   * reports (the patient-report tab, a future printed chart note, Task 2's
   * FinalDifferential.summary) are generated later, at VIEW time, not at
   * save time — this option deliberately does not reach for them. Task
   * 5's batch harness is the natural extension point: it runs after a
   * session is already complete and CAN generate + pass additional
   * reports here without any change to this module.
   */
  reports?: Record<string, string>
}

// ── Prompt / tool-schema constants ───────────────────────────────────────────

const THOROUGHNESS_PROMPT_VERSION = PROMPT_VERSIONS['thoroughness-v1'].id
const THOROUGHNESS_TOOL_NAME = 'record_thoroughness_evaluation'
const THOROUGHNESS_TEMPERATURE = 0
const THOROUGHNESS_MAX_TOKENS_BASE = 3000
const THOROUGHNESS_MAX_TOKENS_WITH_FIDELITY = 4500
// Overall may not exceed this when any critical-severity rubric item went
// unaddressed — instructed to the model AND enforced as a deterministic
// backstop below (sanitizeMissedCriticalQuestions / the overall-capping step).
const CRITICAL_MISS_OVERALL_CAP = 85

const THOROUGHNESS_TOOL_DESCRIPTION =
  'Record the thoroughness evaluation for this completed AI Historian interview transcript, scored ' +
  'against the supplied rubric. Called exactly once as a retrospective QA/audit artifact — never shown ' +
  'to the patient and never used to alter or gate the interview itself.'

function buildSystemPrompt(includeFidelity: boolean, hasVerifySpecifically: boolean): string {
  return `You are a neurologist acting as a thoroughness judge for a COMPLETED AI patient-intake interview transcript, for retrospective quality-review purposes. You are not conducting the interview and cannot ask questions — you only score what already happened.

You will receive:
  1. The full numbered transcript (each line prefixed "Turn N (Patient|Historian): ...").
  2. A rubric: a base checklist plus (when applicable) syndrome-specific critical questions, each with a stable id and a severity of "critical", "important", or "minor".
${includeFidelity ? '  3. One or more physician/QA-facing reports generated from this same interview, each labeled with a report key.\n' : ''}${hasVerifySpecifically ? '  4. A verify_specifically list of critical rubric item ids/questions that a fast, imperfect keyword screen found no lexical trace of anywhere in the transcript.\n' : ''}
Score exactly these 6 dimensions, each 0-100 with supporting evidence_turns (the integer N from "Turn N" for every turn that supports your score — never leave this empty unless the transcript truly has zero relevant turns) and brief notes:
  - oldcarts: onset, location, duration, character, aggravating/relieving factors, timing, severity coverage
  - red_flags: whether syndrome-appropriate red-flag/critical questions were asked
  - pmh_meds_allergies: past medical history, current medications, allergies coverage
  - fh_sh: family history and social history coverage
  - question_quality: were questions clear, non-leading, and appropriately paced (not redundant, not skipping patient-volunteered info)
  - closure: did the interview open and close appropriately, including an open-door "anything else" question

CRITICAL — grounding and rubric fidelity:
- Cite turn numbers for EVERY dimension score via evidence_turns — a score with no supporting turn is not acceptable.
- missed_critical_questions MUST reference rubric ids EXACTLY as given in the rubric below — never invent an id, never reference an id not present in the rubric.
- Do NOT award an overall score above ${CRITICAL_MISS_OVERALL_CAP} if ANY severity:"critical" rubric item was never asked about or covered in the transcript.
- diagnosis_leak flags the HISTORIAN (assistant) telling or implying to the patient what their diagnosis is — the patient reporting a PRIOR diagnosis from another clinician is NOT a leak. Only cite turns/quotes where the historian itself asserts a diagnosis.
${includeFidelity ? '- fidelity: for each supplied report, flag fabricated_claims (stated in the report but not supported anywhere in the transcript, citing the report key you were given) and material_omissions (clinically important transcript content missing from every report). Only flag genuine, clinically material discrepancies — do not flag ordinary summarization/paraphrasing.\n' : ''}${hasVerifySpecifically ? '- verify_specifically lists critical items a KEYWORD screen could not find — that screen is fast and imperfect (a topic can be covered in wording it did not anticipate), so it is NOT proof those items were missed. Look closely at the transcript yourself for each one and decide independently, exactly as you would for any other rubric item; if you conclude it truly was not covered, include it in missed_critical_questions as usual with your own turn evidence. Do not treat verify_specifically as an instruction to mark these missed.\n' : ''}- confidence reflects how confident YOU are in this scoring (e.g. lower for a very short or ambiguous transcript), not the historian's performance.
- Never invent clinical content that is not present in the transcript.`
}

// ── Tool input schema (dynamic: fidelity only when reports were supplied) ────

const DIMENSION_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number', minimum: 0, maximum: 100 },
    evidence_turns: { type: 'array', items: { type: 'integer', minimum: 0 }, maxItems: 15 },
    notes: { type: 'string' },
  },
  required: ['score', 'evidence_turns', 'notes'],
} as const

const MISSED_CRITICAL_QUESTION_SCHEMA = {
  type: 'object',
  properties: {
    rubric_id: { type: 'string' },
    severity: { type: 'string', enum: ['critical', 'important', 'minor'] },
    why_it_matters: { type: 'string' },
  },
  required: ['rubric_id', 'severity', 'why_it_matters'],
} as const

const DIAGNOSIS_LEAK_QUOTE_SCHEMA = {
  type: 'object',
  properties: {
    turn: { type: 'integer', minimum: 0 },
    quote: { type: 'string' },
  },
  required: ['turn', 'quote'],
} as const

function buildInputSchema(includeFidelity: boolean): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    ...Object.fromEntries(DIMENSION_KEYS.map((key) => [key, DIMENSION_SCHEMA])),
    missed_critical_questions: {
      type: 'array',
      items: MISSED_CRITICAL_QUESTION_SCHEMA,
      maxItems: 20,
    },
    diagnosis_leak: {
      type: 'object',
      properties: {
        leaked: { type: 'boolean' },
        quotes: { type: 'array', items: DIAGNOSIS_LEAK_QUOTE_SCHEMA, maxItems: 10 },
      },
      required: ['leaked', 'quotes'],
    },
    overall: { type: 'number', minimum: 0, maximum: 100 },
    confidence: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['High', 'Moderate', 'Low'] },
        reason: { type: 'string' },
      },
      required: ['level', 'reason'],
    },
  }

  const required: string[] = [...DIMENSION_KEYS, 'missed_critical_questions', 'diagnosis_leak', 'overall', 'confidence']

  if (includeFidelity) {
    properties.fidelity = {
      type: 'object',
      properties: {
        fabricated_claims: {
          type: 'array',
          maxItems: 15,
          items: {
            type: 'object',
            properties: { report: { type: 'string' }, claim: { type: 'string' } },
            required: ['report', 'claim'],
          },
        },
        material_omissions: {
          type: 'array',
          maxItems: 15,
          items: {
            type: 'object',
            properties: { transcript_turn: { type: 'integer', minimum: 0 }, omission: { type: 'string' } },
            required: ['transcript_turn', 'omission'],
          },
        },
      },
      required: ['fabricated_claims', 'material_omissions'],
    }
    required.push('fidelity')
  }

  return { type: 'object', properties, required }
}

interface RawThoroughnessToolOutput {
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildNumberedTranscriptText(transcript: HistorianTranscriptEntry[]): string {
  return transcript
    .map((t, i) => `Turn ${i} (${t.role === 'user' ? 'Patient' : 'Historian'}): ${t.text}`)
    .join('\n')
}

function serializedTranscriptLength(transcript: HistorianTranscriptEntry[]): number {
  return JSON.stringify(transcript).length
}

function sanitizeScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

/** Returns {kept, droppedCount} — evidence_turns not a valid in-bounds integer are dropped, never silently kept. */
function sanitizeEvidenceTurns(value: unknown, transcriptLength: number): { kept: number[]; dropped: number } {
  if (!Array.isArray(value)) return { kept: [], dropped: 0 }
  const kept: number[] = []
  let dropped = 0
  for (const raw of value) {
    if (Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < transcriptLength) {
      kept.push(raw as number)
    } else {
      dropped++
    }
  }
  return { kept: [...new Set(kept)], dropped }
}

function sanitizeDimension(
  raw: unknown,
  transcriptLength: number,
): { dimension: DimensionScore; dropped: number } {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const { kept, dropped } = sanitizeEvidenceTurns(r.evidence_turns, transcriptLength)
  return {
    dimension: {
      score: sanitizeScore(r.score),
      evidence_turns: kept,
      notes: typeof r.notes === 'string' ? r.notes : '',
    },
    dropped,
  }
}

function sanitizeConfidence(raw: unknown): ThoroughnessConfidence {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const level = r.level === 'High' || r.level === 'Moderate' || r.level === 'Low' ? r.level : 'Moderate'
  return { level, reason: typeof r.reason === 'string' ? r.reason : '' }
}

function isVerbatimAssistantQuote(
  transcript: HistorianTranscriptEntry[],
  turn: unknown,
  quote: unknown,
): turn is number {
  if (!Number.isInteger(turn) || typeof quote !== 'string' || quote.length === 0) return false
  const t = turn as number
  if (t < 0 || t >= transcript.length) return false
  return transcript[t].role === 'assistant' && transcript[t].text.includes(quote)
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Internal: generates the evaluation AND returns the raw Bedrock token
 * usage alongside it, so runThoroughnessJudge can pass real usage to
 * persistEvaluation for cost_usd computation without a second Bedrock
 * call. generateThoroughnessEvaluation (the public entry point) wraps this
 * and drops usage — it is not part of the documented judge result shape.
 *
 * Fail-closed: throws TranscriptTooLargeError before invoking Bedrock at
 * all if the serialized transcript exceeds MAX_TRANSCRIPT_CHARS (reused
 * from finalDifferential.ts — same guard, same threshold, one definition).
 */
async function generateThoroughnessEvaluationWithUsage(
  transcript: HistorianTranscriptEntry[],
  options: ThoroughnessJudgeOptions = {},
): Promise<{ evaluation: ThoroughnessEvaluation; usage: BedrockTokenUsage }> {
  const serializedLength = serializedTranscriptLength(transcript)
  if (serializedLength > MAX_TRANSCRIPT_CHARS) {
    throw new TranscriptTooLargeError(serializedLength, MAX_TRANSCRIPT_CHARS)
  }

  // ── Rubric selection (loaded before the deterministic layer now, since
  //    the critical-coverage screen below needs each critical item's
  //    coverage_hints — still entirely synchronous/deterministic, still
  //    entirely before the one Bedrock call) ───────────────────────────────
  const loaded = loadRubric({ syndrome: options.syndrome, chiefComplaint: options.chiefComplaint })
  const rubricForPrompt = {
    base_dimensions: loaded.base.expected_dimensions,
    syndrome: loaded.syndromeId,
    syndrome_dimensions: loaded.syndrome?.expected_dimensions ?? [],
    critical_questions: loaded.criticalQuestions.map((q) => ({
      id: q.id,
      question: q.question,
      severity: q.severity,
      source: q.source,
    })),
  }

  // ── Layer 1: deterministic pre-layer — always runs, never skipped ───────
  const deterministic = runDeterministicChecks(
    transcript,
    options.structuredOutput,
    options.narrativeSummary,
    loaded.criticalQuestions.map((q) => ({ id: q.id, severity: q.severity, coverage_hints: q.coverage_hints })),
  )

  // Critical rubric items the lexical coverage screen found no trace of —
  // named for the model to specifically double-check (never an instruction
  // to mark them missed; see buildSystemPrompt's verify_specifically
  // wording and the trust-boundary comment on the overall cap below).
  const unmatchedCriticalIds = deterministic.criticalCoverage
    .filter((c) => c.hint_matched === false)
    .map((c) => c.rubric_id)
  const verifySpecifically =
    unmatchedCriticalIds.length > 0
      ? loaded.criticalQuestions
          .filter((q) => unmatchedCriticalIds.includes(q.id))
          .map((q) => ({ id: q.id, question: q.question }))
      : undefined

  const numberedTranscript = buildNumberedTranscriptText(transcript)
  const reports = options.reports ?? {}
  const includeFidelity = Object.keys(reports).length > 0

  // ── Layer 2: one schema-forced Sonnet tool call ──────────────────────────
  const { result: raw, modelId, usage } = await invokeBedrockClinicalToolWithMeta<RawThoroughnessToolOutput>({
    system: buildSystemPrompt(includeFidelity, verifySpecifically !== undefined),
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          chiefComplaint: options.chiefComplaint ?? null,
          rubric: rubricForPrompt,
          reports: includeFidelity ? reports : undefined,
          verify_specifically: verifySpecifically,
          numberedTranscript,
        }),
      },
    ],
    maxTokens: includeFidelity ? THOROUGHNESS_MAX_TOKENS_WITH_FIDELITY : THOROUGHNESS_MAX_TOKENS_BASE,
    temperature: THOROUGHNESS_TEMPERATURE,
    toolName: THOROUGHNESS_TOOL_NAME,
    toolDescription: THOROUGHNESS_TOOL_DESCRIPTION,
    inputSchema: buildInputSchema(includeFidelity),
  })

  let droppedFindings = 0

  // ── Sanitize the 6 dimensions ────────────────────────────────────────────
  const dimensions = {} as { [K in DimensionKey]: DimensionScore }
  for (const key of DIMENSION_KEYS) {
    const { dimension, dropped } = sanitizeDimension(raw[key], transcript.length)
    dimensions[key] = dimension
    droppedFindings += dropped
  }

  // ── Sanitize missed_critical_questions: rubric_id must be real; severity
  //    is OVERRIDDEN from the rubric's own record, never trusted from the
  //    model ──────────────────────────────────────────────────────────────
  const rubricById = new Map(loaded.criticalQuestions.map((q) => [q.id, q]))
  const rawMissed = Array.isArray(raw.missed_critical_questions) ? raw.missed_critical_questions : []
  const missedCriticalQuestions: MissedCriticalQuestion[] = []
  for (const entry of rawMissed) {
    if (!entry || typeof entry !== 'object') {
      droppedFindings++
      continue
    }
    const e = entry as Record<string, unknown>
    const rubricItem = typeof e.rubric_id === 'string' ? rubricById.get(e.rubric_id) : undefined
    if (!rubricItem) {
      droppedFindings++
      continue
    }
    missedCriticalQuestions.push({
      rubric_id: rubricItem.id,
      severity: rubricItem.severity,
      why_it_matters: typeof e.why_it_matters === 'string' ? e.why_it_matters : '',
    })
  }

  // ── Sanitize diagnosis_leak: verbatim-check LLM quotes, fold in the
  //    deterministic layer's own hits unconditionally ──────────────────────
  const rawLeak = raw.diagnosis_leak && typeof raw.diagnosis_leak === 'object'
    ? (raw.diagnosis_leak as Record<string, unknown>)
    : {}
  const rawLeakQuotes = Array.isArray(rawLeak.quotes) ? rawLeak.quotes : []
  const llmQuotes: DiagnosisLeakQuote[] = []
  for (const q of rawLeakQuotes) {
    if (q && typeof q === 'object' && 'turn' in q && 'quote' in q) {
      const { turn, quote } = q as { turn: unknown; quote: unknown }
      if (isVerbatimAssistantQuote(transcript, turn, quote)) {
        llmQuotes.push({ turn, quote: quote as string, source: 'llm' })
        continue
      }
    }
    droppedFindings++
  }
  const deterministicQuotes: DiagnosisLeakQuote[] = deterministic.diagnosisLeak.matches.map((m) => ({
    turn: m.turnIndex,
    quote: m.phrase,
    source: 'deterministic',
  }))
  const diagnosisLeak = {
    leaked: rawLeak.leaked === true || deterministic.diagnosisLeak.leaked,
    quotes: [...llmQuotes, ...deterministicQuotes],
  }

  // ── Sanitize fidelity (only when reports were supplied) ──────────────────
  let fidelity: FidelityFinding | null = null
  if (includeFidelity) {
    const rawFidelity = raw.fidelity && typeof raw.fidelity === 'object' ? (raw.fidelity as Record<string, unknown>) : {}
    const rawClaims = Array.isArray(rawFidelity.fabricated_claims) ? rawFidelity.fabricated_claims : []
    const fabricated_claims: FidelityFinding['fabricated_claims'] = []
    for (const c of rawClaims) {
      if (
        c &&
        typeof c === 'object' &&
        typeof (c as Record<string, unknown>).report === 'string' &&
        Object.prototype.hasOwnProperty.call(reports, (c as Record<string, unknown>).report as string) &&
        typeof (c as Record<string, unknown>).claim === 'string'
      ) {
        fabricated_claims.push({
          report: (c as Record<string, unknown>).report as string,
          claim: (c as Record<string, unknown>).claim as string,
        })
      } else {
        droppedFindings++
      }
    }
    const rawOmissions = Array.isArray(rawFidelity.material_omissions) ? rawFidelity.material_omissions : []
    const material_omissions: FidelityFinding['material_omissions'] = []
    for (const o of rawOmissions) {
      if (
        o &&
        typeof o === 'object' &&
        Number.isInteger((o as Record<string, unknown>).transcript_turn) &&
        ((o as Record<string, unknown>).transcript_turn as number) >= 0 &&
        ((o as Record<string, unknown>).transcript_turn as number) < transcript.length &&
        typeof (o as Record<string, unknown>).omission === 'string'
      ) {
        material_omissions.push({
          transcript_turn: (o as Record<string, unknown>).transcript_turn as number,
          omission: (o as Record<string, unknown>).omission as string,
        })
      } else {
        droppedFindings++
      }
    }
    fidelity = { fabricated_claims, material_omissions }
  }

  // ── overall: clamp to CRITICAL_MISS_OVERALL_CAP when a critical-severity
  //    item is in the MODEL'S OWN (sanitized) missed_critical_questions.
  //
  //    TRUST BOUNDARY — read before touching this (review fix, Important
  //    #1d): this clamp fires ONLY on what the model itself self-reports
  //    missing. It is NOT independent verification that the item was
  //    actually covered, and it must stay that way. The
  //    coverage_hints/computeCriticalCoverage/coverage_disagreement
  //    mechanism above and below is a SEPARATE signal surfaced ALONGSIDE
  //    the score (via verify_specifically in the prompt and
  //    coverage_disagreement on the result) — deliberately NOT folded into
  //    this clamp — because lexical hints carry real false-negative risk: a
  //    topic can be genuinely covered in wording no hint anticipated.
  //    Clamping on a hint miss alone would unfairly punish a thorough
  //    interview that simply used different words, corrupting the score
  //    distribution. Full independent coverage verification (an evaluator
  //    that doesn't trust the judge's own self-report at all) is future
  //    work, not this cap. See thoroughnessJudge.test.ts's "does NOT clamp
  //    overall on an unmatched coverage hint alone" test, which fails if
  //    this boundary is ever crossed. ─────────────────────────────────────
  let overall = sanitizeScore(raw.overall)
  const hasUnaddressedCritical = missedCriticalQuestions.some((q) => q.severity === 'critical')
  if (hasUnaddressedCritical) {
    overall = Math.min(overall, CRITICAL_MISS_OVERALL_CAP)
  }

  // Audit-only disagreement signal (see coverage_disagreement's own
  // doc-comment on ThoroughnessEvaluation) — computed from, but never
  // feeding back into, the score above.
  const missedIds = new Set(missedCriticalQuestions.map((q) => q.rubric_id))
  const coverageDisagreement = unmatchedCriticalIds.some((id) => !missedIds.has(id))

  const confidence = sanitizeConfidence(raw.confidence)

  const evaluation: ThoroughnessEvaluation = {
    ...dimensions,
    missed_critical_questions: missedCriticalQuestions,
    diagnosis_leak: diagnosisLeak,
    fidelity,
    overall,
    confidence,
    unvetted: loaded.unvetted,
    deterministic,
    dropped_findings: droppedFindings,
    coverage_disagreement: coverageDisagreement,
    provenance: {
      model_id: modelId,
      prompt_version: THOROUGHNESS_PROMPT_VERSION,
      rubric_version: loaded.rubricVersion,
      inference_params: {
        temperature: THOROUGHNESS_TEMPERATURE,
        max_tokens: includeFidelity ? THOROUGHNESS_MAX_TOKENS_WITH_FIDELITY : THOROUGHNESS_MAX_TOKENS_BASE,
        tool: THOROUGHNESS_TOOL_NAME,
      },
      generated_at: new Date().toISOString(),
    },
  }

  return { evaluation, usage }
}

/**
 * Generate the thoroughness evaluation for a completed historian session.
 * Pure w.r.t. side effects other than the one Bedrock call — does not
 * persist anything; see runThoroughnessJudge for the fire-and-forget
 * generate+persist wrapper used by POST /save.
 */
export async function generateThoroughnessEvaluation(
  transcript: HistorianTranscriptEntry[],
  options: ThoroughnessJudgeOptions = {},
): Promise<ThoroughnessEvaluation> {
  const { evaluation } = await generateThoroughnessEvaluationWithUsage(transcript, options)
  return evaluation
}

// ── Fire-and-forget generate+persist wrapper (used by POST /save) ────────────

/**
 * Generate + persist the thoroughness evaluation for one session, catching
 * everything. Intended to be called `void`-style (fire-and-forget) —
 * never throws, never awaited by the save response. Mirrors
 * finalDifferential.ts's runFinalDifferential: a TranscriptTooLargeError
 * logs a quiet warning (expected, not a bug); any other generation error
 * logs at error level; persistEvaluation itself already never throws (see
 * that module), so its own errors surface via its own logging, not here.
 *
 * Calls generateThoroughnessEvaluationWithUsage (not the public
 * generateThoroughnessEvaluation) so the real Bedrock token usage reaches
 * persistEvaluation's cost_usd computation without a second Bedrock call.
 */
export async function runThoroughnessJudge(
  sessionId: string,
  transcript: HistorianTranscriptEntry[],
  options: ThoroughnessJudgeOptions = {},
): Promise<void> {
  const start = Date.now()
  let evaluation: ThoroughnessEvaluation
  let usage: BedrockTokenUsage
  try {
    const generated = await generateThoroughnessEvaluationWithUsage(transcript, options)
    evaluation = generated.evaluation
    usage = generated.usage
  } catch (err) {
    if (err instanceof TranscriptTooLargeError) {
      console.warn('[historian/eval] skipping thoroughness judge — transcript too large for session', sessionId)
    } else {
      console.error('[historian/eval] thoroughness judge generation failed (non-fatal) for session', sessionId, err)
    }
    return
  }

  await persistEvaluation({
    sessionId,
    evaluator: 'thoroughness',
    modelId: evaluation.provenance.model_id,
    promptVersion: evaluation.provenance.prompt_version,
    rubricVersion: evaluation.provenance.rubric_version,
    inferenceParams: evaluation.provenance.inference_params,
    result: evaluation,
    usage,
    latencyMs: Date.now() - start,
  })
}
