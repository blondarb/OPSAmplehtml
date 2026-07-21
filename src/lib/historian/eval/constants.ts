/**
 * Shared constants for the AI Historian post-session evaluator pipeline
 * (Historian Validation Suite, Task 2+).
 *
 * Single source of truth so:
 *   - The investigational banner text is never inlined by a UI component —
 *     DifferentialCard (and any future evaluator-output surface) must import
 *     INVESTIGATIONAL_BANNER rather than hardcode the string.
 *   - Every evaluator prompt version is registered once, here, instead of
 *     scattered as string literals across finalDifferential.ts and later
 *     sprint tasks (thoroughness judge, fidelity screen, independent scorer).
 *   - Per-model USD pricing (MODEL_PRICING/computeCostUsd) lives in one
 *     place so historian_evaluations.cost_usd is computed identically by
 *     every evaluator (persistEvaluation.ts) rather than re-derived ad hoc.
 */

import { BEDROCK_MODEL } from '@/lib/bedrock'

/**
 * Banner shown on every AI-generated differential surface (DifferentialCard).
 * The historian interview itself never diagnoses (prompt-hardened, by
 * design) — this differential comes from a separate, post-session review
 * pass and is for retrospective QA/audit review only, never for real-time
 * clinical decision-making.
 */
export const INVESTIGATIONAL_BANNER =
  'Investigational — AI-generated differential for retrospective QA and audit review only. ' +
  'Not a clinical diagnosis and not intended to guide patient care. The historian interview ' +
  'itself never diagnoses; this differential is produced by a separate review pass after the ' +
  'session ends and requires physician verification against the full chart.'

export interface PromptVersionInfo {
  /** Stable identifier used verbatim as provenance.prompt_version. */
  id: string
  /** Human-readable description of what this prompt version does. */
  description: string
  /** ISO date (YYYY-MM-DD) this version was introduced. */
  introducedAt: string
}

/**
 * Registry of every evaluator prompt version ever shipped.
 *
 * Append-only: once an id has been used in a persisted
 * FinalDifferential.provenance.prompt_version, its entry here must never be
 * edited or removed — later tasks (independent scorer, batch harness, QI
 * report) key off these stable ids to compare runs across prompt versions.
 */
export const PROMPT_VERSIONS: Record<string, PromptVersionInfo> = {
  'final-ddx-v1': {
    id: 'final-ddx-v1',
    description:
      'Final full-transcript differential diagnosis pass: shared symptom extraction + neuro_plans-grounded evidence + one schema-forced Sonnet tool call, max 6 diagnoses, verbatim-quote-cited.',
    introducedAt: '2026-07-20',
  },
  'thoroughness-v1': {
    id: 'thoroughness-v1',
    description:
      'Thoroughness judge: deterministic pre-layer (diagnosis-leak lexicon, phase-marker presence, turn cap, structured-output shape) appended to one schema-forced Sonnet tool call scoring 6 dimensions against an inlined syndrome-matched rubric, plus missed-critical-question and diagnosis-leak findings and an optional report-fidelity screen.',
    introducedAt: '2026-07-20',
  },
  'independent-ddx-r1-v1': {
    id: 'independent-ddx-r1-v1',
    description:
      'Independent full-transcript differential diagnosis pass via DeepSeek-R1 (cross-family independence check for final-ddx-v1) — transcript + chief complaint ONLY as input (blind to the Sonnet pipeline\'s structured output, localizer output, final_differential, rubrics, and persona ground truth), native-format Bedrock InvokeModel call (R1 has no tool-use on Bedrock), hand-rolled shape validation with one retry on shape-invalid, then fail-closed. Reuses finalDifferential.ts\'s verbatim-quote sanitization against the SAME DifferentialItem[] shape.',
    introducedAt: '2026-07-21',
  },
  'agreement-icd10-adjudicated-v1': {
    id: 'agreement-icd10-adjudicated-v1',
    description:
      'Cross-model agreement metrics between final-ddx-v1 (Sonnet) and independent-ddx-r1-v1 (DeepSeek-R1): ICD-10 3-character category match as the deterministic fast path, Haiku-adjudicated synonym resolution (batched into one call) for pairs where either side lacks a usable ICD-10 code.',
    introducedAt: '2026-07-21',
  },
}

// ── Model pricing (for historian_evaluations.cost_usd) ───────────────────────

export interface ModelPricing {
  /** USD per 1,000 input tokens. */
  inputPer1k: number
  /** USD per 1,000 output tokens. */
  outputPer1k: number
}

/**
 * Per-1k-token USD pricing for cost_usd computation (persistEvaluation.ts).
 * [Source: pricepertoken.com's Claude Sonnet 4.6 Bedrock listing, checked
 * 2026-07-20 — $3.00 / $15.00 per million input/output tokens, i.e.
 * $0.003 / $0.015 per 1k. This matches the $3/$15-per-million rate AWS has
 * used for every prior Bedrock Sonnet-tier model (3.5, 3.7, 4), so it is a
 * plausible-and-checked figure rather than a guess — but it was not cross-
 * verified against the authoritative aws.amazon.com/bedrock/pricing page
 * directly. Treat as verify-before-relying-on for anything beyond relative
 * cost tracking (e.g. finance reporting); flag for a from-source recheck if
 * it ever looks off. Cache read/write tokens are NOT priced separately here
 * (computeCostUsd only prices inputTokens/outputTokens) — a known
 * simplification, not a claim that Bedrock's real cache pricing is flat.]
 * Unknown model ids resolve to a null cost via computeCostUsd — never throw.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  [BEDROCK_MODEL]: { inputPer1k: 0.003, outputPer1k: 0.015 },
}

/**
 * cost_usd for one Bedrock call given its model id and token usage.
 * Returns null for an unrecognized model id (never throws) — callers
 * persist null rather than a fabricated number.
 */
export function computeCostUsd(
  modelId: string,
  usage: { inputTokens?: number; outputTokens?: number },
): number | null {
  const pricing = MODEL_PRICING[modelId]
  if (!pricing) return null
  const inputTokens = usage.inputTokens ?? 0
  const outputTokens = usage.outputTokens ?? 0
  const cost = (inputTokens / 1000) * pricing.inputPer1k + (outputTokens / 1000) * pricing.outputPer1k
  return Number.isFinite(cost) ? cost : null
}
