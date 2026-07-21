/**
 * Independent DeepSeek-R1 differential diagnosis + production adjudicator +
 * save-route orchestration (Historian Validation Suite Task 4).
 *
 * This is the cross-family independence check at the heart of the
 * validation design: Task 2's `generateFinalDifferential`
 * (finalDifferential.ts) produces the pipeline's differential using a
 * Sonnet-family model with structured-symptom-extraction and
 * neuro_plans-grounded evidence as intermediate context. This module
 * produces a SECOND, completely independent differential from a DIFFERENT
 * model family (DeepSeek-R1), then agreement.ts is where the two are
 * compared. If both pipelines "agree" only because they secretly saw the
 * same intermediate reasoning, the agreement metric would be meaningless —
 * so this module's independence is enforced BY CONSTRUCTION, not by
 * convention:
 *
 *   BLINDNESS (binding): generateIndependentDdx's signature takes ONLY a
 *   transcript and an optional chief complaint — nothing else. It must
 *   NEVER receive or read structured HPI output, localizer output,
 *   final_differential, rubrics, or persona expectedDDx. agreement.ts is
 *   the ONLY place the two differentials are allowed to meet (as plain
 *   DifferentialItem[] arrays, after both have already been generated).
 *
 * ── WIRE-FORMAT NOTE (read before touching the R1 request-building code) ──
 * DeepSeek-R1 on Bedrock is invoked via the InvokeModel API, which (unlike
 * Converse) requires the model's OWN native request/response schema — it is
 * NOT a drop-in for invokeBedrockJSON / invokeBedrockJSONWithMeta, which
 * are hard-coded to the Anthropic Messages wire format
 * (`anthropic_version`/`system`/`messages` request; `.content[]`/
 * `.stop_reason`/`.usage.input_tokens` response). This was verified LIVE
 * against `us.deepseek.r1-v1:0` in this account (2026-07-21, sevaro-sandbox
 * / us-east-2) before writing this module: an Anthropic-shaped request body
 * returns a hard `ValidationException` from Bedrock — not a parse quirk,
 * a rejected request. R1's actual native request body is
 * `{prompt, max_tokens, temperature}`, where DeepSeek's own chat-template
 * markers (`<｜begin▁of▁sentence｜>{system}<｜User｜>{user}<｜Assistant｜>`)
 * take the place of separate system/messages fields, and its response body
 * is `{choices: [{text, stop_reason}]}` with NO usage/token-count field
 * anywhere — confirmed against both the raw HTTP response and the JS SDK's
 * CommandOutput (only body/contentType/$metadata, no token headers). `text`
 * also embeds the model's chain-of-thought inline as a leading
 * `<think>...</think>` block before the actual answer — not a separate
 * content block the way that might be assumed; it is plain text prefixed
 * onto the same string, stripped below before JSON parsing. `stop_reason`
 * is `"stop"` (complete) or `"length"` (truncated).
 *
 * Given this, independentDdx.ts calls Bedrock directly via a small
 * dedicated invoke helper (invokeDeepSeekR1Json below) that mirrors
 * invokeBedrockJSON's exact lenient parse policy (try direct JSON.parse
 * first; on failure, if the stop reason indicates truncation, attempt the
 * same brace/bracket-closing repair strategy before giving up) — reused
 * here as a local, documented duplicate rather than by exporting or
 * modifying bedrock.ts's private repairTruncatedJSON, since that file is
 * shared, production, and clinically live (triage, the historian
 * localizer) and this task has no reason to touch it. Token usage is
 * always `{}` for R1 (no data available from Bedrock for this model) —
 * cost_usd resolves to null via computeCostUsd, which is correct: R1 isn't
 * in MODEL_PRICING and no fabricated cost should ever be persisted.
 *
 * Two failure modes get exactly ONE retry, then fail closed (throw): (a) a
 * thrown error from the invoke/parse step (network error, empty or
 * reasoning-only text, persistent JSON-parse failure even after repair),
 * and (b) a structurally shape-invalid parsed object (hand-rolled guard,
 * following src/lib/triage/sentinel/catalog.ts's isRecord/explicit-type-
 * check conventions — adapted to a boolean predicate here since this
 * module needs to branch on validity for the retry loop rather than throw
 * immediately the way catalog.ts's parse functions do). The shape guard is
 * deliberately coarse (differential is a non-empty array of objects each
 * with a non-blank diagnosis string) — fine-grained per-field cleanup
 * (likelihood enum coercion, icd10 blank-to-null, non-verbatim quote
 * dropping) is handled permissively by finalDifferential.ts's
 * sanitizeDifferential, reused here so both differentials are cleaned by
 * the exact same, already-tested logic rather than two hand-rolled copies
 * that could silently drift apart.
 *
 * This module also owns the PRODUCTION adjudicator (adjudicateEquivalence)
 * — a real Haiku-backed implementation of agreement.ts's injected
 * Adjudicator type, used both by the save-route orchestration wrapper
 * below and by the live gate test. agreement.ts itself has zero
 * Bedrock/DB imports and never calls this directly; it only accepts an
 * injected function.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

import { buildBedrockClientConfig } from '@/lib/bedrock'
import { invokeBedrockClinicalToolWithMeta } from './bedrockMeta'
import {
  TranscriptTooLargeError,
  MAX_TRANSCRIPT_CHARS,
  sanitizeDifferential,
  type DifferentialItem,
  type EvalProvenance,
  type FinalDifferential,
} from './finalDifferential'
import { computeAgreement, type Adjudicator, type AgreementResult } from './agreement'
import { PROMPT_VERSIONS } from './constants'
import { persistEvaluation } from './persistEvaluation'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

// ── Public types ─────────────────────────────────────────────────────────────

export interface IndependentDifferential {
  differential: DifferentialItem[]
  summary: string
  provenance: EvalProvenance
  /** Same semantics as FinalDifferential.dropped_quotes (finalDifferential.ts) — quotes dropped for not being a verbatim transcript substring. */
  dropped_quotes: number
  /** Raw DeepSeek-R1 stop_reason from the call that ultimately succeeded ('stop' | 'length' | other) — surfaced since R1 has no token-usage data to report instead, and this is the most useful diagnostic signal available for the live-gate table. */
  stop_reason: string
  /** True if the first attempt was rejected (thrown error or shape-invalid) and this result came from the one retry. */
  retried: boolean
}

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * DeepSeek-R1 Bedrock inference profile. Verified live (on-demand,
 * us-east-2, sevaro-sandbox account) before this module was written — see
 * task-4-report.md.
 */
export const DEEPSEEK_R1_MODEL_ID = 'us.deepseek.r1-v1:0'

/**
 * Claude Haiku 4.5 Bedrock inference profile, used as the equivalence
 * adjudicator (schema-forced tool use — Haiku, unlike R1, supports it).
 * Verified live 2026-07-21 via:
 *   aws bedrock list-inference-profiles --profile sevaro-sandbox \
 *     --region us-east-2 \
 *     --query "inferenceProfileSummaries[?contains(inferenceProfileId,'haiku')].inferenceProfileId"
 * which returned three candidates (the legacy 'us.anthropic.claude-3-haiku-
 * 20240307-v1:0', plus 4.5 as both 'global.anthropic.claude-haiku-4-5-...'
 * and 'us.anthropic.claude-haiku-4-5-...'). The regional `us.` profile is
 * used here for consistency with every other model id in this codebase
 * (BEDROCK_MODEL, DEEPSEEK_R1_MODEL_ID above), which are all region-scoped
 * rather than global.
 */
export const HAIKU_MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

const INDEPENDENT_DDX_PROMPT_VERSION = PROMPT_VERSIONS['independent-ddx-r1-v1'].id
const AGREEMENT_PROMPT_VERSION = PROMPT_VERSIONS['agreement-icd10-adjudicated-v1'].id

// Reasoning consumes output budget before the model ever gets to the JSON
// answer (confirmed live: a trivial one-line prompt used >150 reasoning
// tokens before producing anything). Generous by design per the task brief.
const DEEPSEEK_R1_MAX_TOKENS = 8000
const DEEPSEEK_R1_TEMPERATURE = 0
const MAX_RETRIES = 1 // i.e. up to 2 total attempts

const MAX_DIFFERENTIAL_ITEMS = 6
const MAX_QUOTES_PER_ITEM = 6

const INDEPENDENT_DDX_SYSTEM_PROMPT = `You are a neurologist producing an INDEPENDENT differential diagnosis from a patient intake transcript, for retrospective quality-review purposes. You have not seen any other clinician's or AI system's analysis of this case — form your own opinion from the transcript alone.

You will receive the full numbered transcript (each line prefixed "Turn N (Patient|Historian): ...") and, if available, the stated chief complaint.

Produce up to ${MAX_DIFFERENTIAL_ITEMS} candidate diagnoses, ranked most likely first, and a one-paragraph summary.

CRITICAL — quote grounding:
- Every supporting_quotes and contradicting_quotes entry MUST be a VERBATIM, character-for-character substring copied from the numbered transcript's turn text — do not paraphrase, truncate mid-word, or combine text from two turns.
- "turn" is the integer N from that quote's "Turn N" line.
- contradicting_quotes cites evidence that argues AGAINST that diagnosis (may be an empty array — do not invent contradicting evidence that is not in the transcript).
- If you cannot find a verbatim supporting quote for a diagnosis, you may still list it but leave supporting_quotes empty rather than fabricate one.
- Up to ${MAX_QUOTES_PER_ITEM} quotes per list per item.

Other rules:
- diagnosis: display name (e.g. "Migraine without aura").
- icd10: an ICD-10 code if determinable, otherwise null. Never invent a code you are not reasonably confident in.
- likelihood: exactly one of "High", "Moderate", "Low".
- likelihood_pct: your estimated probability 0-100, consistent with the likelihood band.
- rationale: 1-2 sentences grounded in the transcript.
- summary: one paragraph synthesizing the overall clinical picture and the reasoning behind the ranking.
- Base everything on what the patient/historian actually said — never invent clinical findings.

Respond with ONLY a single valid JSON object, no markdown code fences, no prose outside the JSON. Schema:
{"differential": [{"diagnosis": string, "icd10": string|null, "likelihood": "High"|"Moderate"|"Low", "likelihood_pct": number, "rationale": string, "supporting_quotes": [{"turn": number, "quote": string}], "contradicting_quotes": [{"turn": number, "quote": string}]}], "summary": string}`

// ── DeepSeek-R1 native-format Bedrock plumbing (private) ──────────────────────

let _r1Client: BedrockRuntimeClient | null = null
function getR1Client(): BedrockRuntimeClient {
  if (!_r1Client) {
    _r1Client = new BedrockRuntimeClient(buildBedrockClientConfig())
  }
  return _r1Client
}

/**
 * Mirrors bedrock.ts's private repairTruncatedJSON exactly (brace/bracket/
 * string-tracking closer) — see the module doc for why this is a
 * documented local duplicate rather than an import.
 */
function repairTruncatedJSON(text: string): string {
  let inString = false
  let escaped = false
  const stack: ('{' | '[')[] = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\' && inString) {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') stack.push('{')
    else if (ch === '[') stack.push('[')
    else if (ch === '}' && stack.length && stack[stack.length - 1] === '{') stack.pop()
    else if (ch === ']' && stack.length && stack[stack.length - 1] === '[') stack.pop()
  }

  let repaired = text
  if (inString) repaired += '"'
  const trimmed = repaired.trimEnd()
  const lastChar = trimmed[trimmed.length - 1]
  if (lastChar === ':' || lastChar === ',') repaired = trimmed.slice(0, -1)
  while (stack.length) {
    const open = stack.pop()
    repaired += open === '{' ? '}' : ']'
  }
  return repaired
}

interface R1InvokeResult {
  result: unknown
  stopReason: string
  latencyMs: number
}

/**
 * One raw call to DeepSeek-R1 via its native Bedrock wire format. Strips
 * the leading <think>...</think> reasoning block and any markdown fences,
 * then applies invokeBedrockJSON's exact lenient parse policy (direct
 * parse first; repair-then-reparse only on a truncated stop reason).
 * Throws a plain Error (never returns a partially-valid result) on
 * anything unparseable — the caller (generateIndependentDdx) is
 * responsible for the retry-once-then-fail-closed policy, not this
 * function.
 */
async function invokeDeepSeekR1Json(userText: string): Promise<R1InvokeResult> {
  const prompt = `<｜begin▁of▁sentence｜>${INDEPENDENT_DDX_SYSTEM_PROMPT}<｜User｜>${userText}<｜Assistant｜>`
  const body = JSON.stringify({
    prompt,
    max_tokens: DEEPSEEK_R1_MAX_TOKENS,
    temperature: DEEPSEEK_R1_TEMPERATURE,
  })

  const start = Date.now()
  const response = await getR1Client().send(
    new InvokeModelCommand({
      modelId: DEEPSEEK_R1_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(body),
    }),
  )
  const latencyMs = Date.now() - start

  const decoded = JSON.parse(new TextDecoder().decode(response.body)) as {
    choices?: { text?: string; stop_reason?: string }[]
  }
  const rawText = decoded.choices?.[0]?.text ?? ''
  const stopReason = decoded.choices?.[0]?.stop_reason ?? 'unknown'

  // Strip the reasoning block (plain text prefix, not a separate content
  // block — see module doc). Non-greedy + dotAll so a multi-line think
  // block is removed in one shot; if the model never closes it (persistent
  // truncation mid-thought), nothing is stripped and the JSON parse below
  // fails naturally, which is the correct "empty/reasoning-only text"
  // failure the brief anticipated.
  let cleaned = rawText.replace(/<think>[\s\S]*?<\/think>/, '').trim()
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7)
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3)
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3)
  cleaned = cleaned.trim()

  try {
    return { result: JSON.parse(cleaned), stopReason, latencyMs }
  } catch {
    if (stopReason === 'length') {
      const repaired = repairTruncatedJSON(cleaned)
      try {
        return { result: JSON.parse(repaired), stopReason, latencyMs }
      } catch {
        throw new Error(
          `DeepSeek-R1 response was truncated (stop_reason=length) and could not be repaired into valid JSON.`,
        )
      }
    }
    throw new Error(
      `DeepSeek-R1 response was not valid JSON (stop_reason=${stopReason}, text length=${cleaned.length}).`,
    )
  }
}

// ── Hand-rolled shape guard (catalog.ts conventions, boolean-predicate style) ──

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDifferentialItemShape(value: unknown): boolean {
  return isRecord(value) && typeof value.diagnosis === 'string' && value.diagnosis.trim().length > 0
}

/**
 * Coarse structural check only — "is this even a differential-shaped
 * response" — NOT the fine-grained per-field validation (that's
 * sanitizeDifferential's job, reused below). Deliberately permissive on
 * enums/numbers/quotes so a response with a slightly-off likelihood string
 * or a bad quote doesn't burn the one retry on something sanitizeDifferential
 * already handles safely.
 */
function isValidDifferentialResponseShape(
  value: unknown,
): value is { differential: unknown[]; summary: string } {
  return (
    isRecord(value) &&
    Array.isArray(value.differential) &&
    value.differential.length > 0 &&
    typeof value.summary === 'string' &&
    value.differential.every(isDifferentialItemShape)
  )
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

// ── Public entry point (BLIND — transcript + chief complaint ONLY) ────────────

/**
 * Generate an independent differential diagnosis from DeepSeek-R1, blind to
 * everything except the transcript and chief complaint (see module doc's
 * BLINDNESS section — this is enforced by this function's signature: it is
 * structurally impossible to pass in structured HPI output, localizer
 * output, final_differential, rubrics, or persona ground truth, because
 * there is no parameter for any of them).
 *
 * Fail-closed: throws TranscriptTooLargeError before invoking Bedrock at
 * all if the serialized transcript exceeds MAX_TRANSCRIPT_CHARS (same
 * guard/threshold as finalDifferential.ts). Otherwise, retries the
 * DeepSeek-R1 call at most once (on either a thrown error or a
 * shape-invalid parsed response) before throwing.
 */
export async function generateIndependentDdx(
  transcript: HistorianTranscriptEntry[],
  chiefComplaint?: string,
): Promise<IndependentDifferential> {
  const serializedLength = serializedTranscriptLength(transcript)
  if (serializedLength > MAX_TRANSCRIPT_CHARS) {
    throw new TranscriptTooLargeError(serializedLength, MAX_TRANSCRIPT_CHARS)
  }

  const numberedTranscript = buildNumberedTranscriptText(transcript)
  const userText = [
    chiefComplaint ? `Chief complaint: ${chiefComplaint}` : '',
    '',
    'Transcript:',
    numberedTranscript,
    '',
    'Produce the JSON now.',
  ]
    .filter(Boolean)
    .join('\n')

  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { result: raw, stopReason } = await invokeDeepSeekR1Json(userText)
      if (!isValidDifferentialResponseShape(raw)) {
        lastError = new Error(
          `DeepSeek-R1 output was not differential-shaped (attempt ${attempt + 1}, stop_reason=${stopReason}).`,
        )
        continue
      }

      const { items, droppedQuotes } = sanitizeDifferential(transcript, raw.differential)
      return {
        differential: items,
        summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
        provenance: {
          model_id: DEEPSEEK_R1_MODEL_ID,
          prompt_version: INDEPENDENT_DDX_PROMPT_VERSION,
          inference_params: {
            temperature: DEEPSEEK_R1_TEMPERATURE,
            max_tokens: DEEPSEEK_R1_MAX_TOKENS,
          },
          generated_at: new Date().toISOString(),
        },
        dropped_quotes: droppedQuotes,
        stop_reason: stopReason,
        retried: attempt > 0,
      }
    } catch (err) {
      lastError = err
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('DeepSeek-R1 independent differential generation failed after one retry.')
}

// ── Production adjudicator (Haiku, schema-forced tool use) ────────────────────

const ADJUDICATE_SYSTEM_PROMPT = `You are a clinical terminology adjudicator. For each pair of diagnosis names, decide whether they refer to the SAME clinical diagnosis — allowing for synonyms, abbreviations, and different phrasings of the identical condition (e.g. "TIA" and "transient ischemic attack" are the SAME diagnosis; "CVA" and "stroke" are the SAME).

A more specific subtype and its general parent category count as the SAME (e.g. "migraine without aura" and "migraine" are the SAME). Two different specific subtypes, or a diagnosis and its negation, are DIFFERENT (e.g. "migraine with aura" and "migraine without aura" are DIFFERENT; "seizure" and "non-epileptic seizure" are DIFFERENT). Genuinely different diagnoses are DIFFERENT even if related (e.g. "migraine" and "tension headache" are DIFFERENT).

Return exactly one boolean per pair, in the same order given. true = same diagnosis, false = different diagnosis. Only mark true when you are clinically confident these describe the same condition — never guess "same" when genuinely uncertain.`

const ADJUDICATE_TOOL_NAME = 'record_equivalence_judgments'
const ADJUDICATE_TOOL_DESCRIPTION =
  'Record, for each candidate diagnosis-name pair, whether the two names refer to the same clinical diagnosis.'
const ADJUDICATE_MAX_TOKENS = 1500
const ADJUDICATE_TEMPERATURE = 0

interface AdjudicateToolOutput {
  judgments: unknown[]
}

/**
 * Production wiring of agreement.ts's injected Adjudicator type, backed by
 * Haiku tool-use (schema-forced — Haiku, unlike R1, supports it). Batches
 * EVERY pair into exactly one call, never one call per pair. Defensive
 * against a malformed/short/missing judgments array from the model: pads
 * with false rather than throwing or indexing out of bounds, so a
 * misbehaving adjudicator response degrades to "no match" for the
 * unaccounted pairs instead of crashing the caller.
 */
export const adjudicateEquivalence: Adjudicator = async (pairs) => {
  if (pairs.length === 0) return []

  const { result } = await invokeBedrockClinicalToolWithMeta<AdjudicateToolOutput>({
    system: ADJUDICATE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({ pairs: pairs.map(([a, b]) => ({ a, b })) }),
      },
    ],
    maxTokens: ADJUDICATE_MAX_TOKENS,
    temperature: ADJUDICATE_TEMPERATURE,
    model: HAIKU_MODEL_ID,
    toolName: ADJUDICATE_TOOL_NAME,
    toolDescription: ADJUDICATE_TOOL_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        judgments: {
          type: 'array',
          items: { type: 'boolean' },
          minItems: pairs.length,
          maxItems: pairs.length,
        },
      },
      required: ['judgments'],
    },
  })

  const judgments = Array.isArray(result.judgments) ? result.judgments : []
  return pairs.map((_, i) => judgments[i] === true)
}

// ── Fire-and-forget save-route orchestration ──────────────────────────────────

/**
 * Generate the independent R1 differential (blind), persist it, then — only
 * if Task 2's final_differential is already present for this session —
 * compute and persist agreement metrics. Intended to be called `void`-style
 * from POST /save, AFTER the thoroughness judge, in the same fail-open
 * chain. Never throws; every stage catches its own errors and logs
 * non-fatally, mirroring finalDifferential.ts's runFinalDifferential and
 * thoroughnessJudge.ts's runThoroughnessJudge. No PHI/transcript text is
 * ever passed to console.* — only session id and driver error messages.
 */
export async function runIndependentDdxAndAgreement(
  sessionId: string,
  transcript: HistorianTranscriptEntry[],
  chiefComplaint?: string,
): Promise<void> {
  const ddxStart = Date.now()
  let independent: IndependentDifferential
  try {
    independent = await generateIndependentDdx(transcript, chiefComplaint)
  } catch (err) {
    if (err instanceof TranscriptTooLargeError) {
      console.warn('[historian/eval] skipping independent ddx — transcript too large for session', sessionId)
    } else {
      console.error('[historian/eval] independent ddx generation failed (non-fatal) for session', sessionId, err)
    }
    return
  }

  await persistEvaluation({
    sessionId,
    evaluator: 'independent_ddx',
    modelId: independent.provenance.model_id,
    promptVersion: independent.provenance.prompt_version,
    inferenceParams: independent.provenance.inference_params,
    result: independent,
    // No token-usage data is available from Bedrock for DeepSeek-R1 (see
    // module doc) — cost_usd resolves to null via computeCostUsd rather
    // than a fabricated figure.
    usage: {},
    latencyMs: Date.now() - ddxStart,
  })

  // Agreement runs ONLY when both differentials exist — fetch Task 2's
  // persisted final_differential for this session (its own async pass may
  // not have completed, may have failed, or the transcript may have been
  // too large for it); skip quietly whenever it's absent.
  let finalDifferential: FinalDifferential | null = null
  try {
    const { getPool } = await import('@/lib/db')
    const pool = await getPool()
    const { rows } = await pool.query(
      'SELECT final_differential FROM historian_sessions WHERE id = $1',
      [sessionId],
    )
    finalDifferential = (rows[0]?.final_differential as FinalDifferential | null | undefined) ?? null
  } catch (err: unknown) {
    const pgCode = (err as { code?: string } | undefined)?.code
    if (pgCode === '42P01' || pgCode === '42703') {
      // historian_sessions.final_differential doesn't exist yet — expected
      // and benign until the rollout task applies migration 057.
      console.info(
        '[historian/eval] final_differential not available yet (migration 057 not applied) — skipping agreement for session',
        sessionId,
      )
    } else {
      console.error(
        '[historian/eval] failed to fetch final differential for agreement (non-fatal) for session',
        sessionId,
        err,
      )
    }
    return
  }

  if (!finalDifferential || !Array.isArray(finalDifferential.differential) || finalDifferential.differential.length === 0) {
    return // Task 2's pass hasn't completed / produced nothing yet — skip quietly.
  }

  const agreementStart = Date.now()
  let agreement: AgreementResult
  try {
    agreement = await computeAgreement(finalDifferential.differential, independent.differential, adjudicateEquivalence)
  } catch (err) {
    console.error('[historian/eval] agreement computation failed (non-fatal) for session', sessionId, err)
    return
  }

  await persistEvaluation({
    sessionId,
    evaluator: 'agreement',
    modelId: HAIKU_MODEL_ID,
    promptVersion: AGREEMENT_PROMPT_VERSION,
    inferenceParams: { adjudicator_model: HAIKU_MODEL_ID },
    result: agreement,
    usage: {},
    latencyMs: Date.now() - agreementStart,
  })
}
