/**
 * Pure report builder + renderer for the AI Historian batch eval harness
 * (Historian Validation Suite Task 5).
 *
 * This module has NO Bedrock/DB imports and performs no I/O — it is given
 * already-computed per-case outcomes (produced by cli.ts, either from a
 * live `--fixtures`/`--sessions` run or as dry-run placeholders) and a
 * parsed release-gate set, and turns them into one report object plus a
 * markdown rendering of it. Mirrors src/lib/triage/sentinel/report.ts's
 * split (aggregate -> evaluate gates -> build report -> render markdown),
 * adapted to this harness's own metrics.
 *
 * This is a QI/software-release artifact, not a clinical validation study —
 * every report this module builds is self-labeled as such (banner,
 * headline, clinicalValidationClaim: false) regardless of how the gates
 * come out. A failing gate is DATA to report, never something this module
 * (or its caller) tunes around.
 */

import { INVESTIGATIONAL_BANNER } from './constants'
import type { FinalDifferential } from './finalDifferential'
import type { ThoroughnessEvaluation } from './thoroughnessJudge'
import type { IndependentDifferential } from './independentDdx'
import type { AgreementResult } from './agreement'

// ── Public constants ─────────────────────────────────────────────────────────

export const HISTORIAN_EVAL_HEADLINE =
  'SYNTHETIC SOFTWARE EVALUATION — NOT CLINICALLY VALIDATED'

/** Prominent self-label shown whenever ANY rubric contributing to a case's thoroughness evaluation is unvetted (vetted_by === null). */
export const UNVETTED_SELF_LABEL = 'developer baseline — not clinician-vetted'

// ── Per-case outcome shape (what cli.ts hands to this module) ────────────────

export interface HistorianEvalRunResult<T> {
  ok: boolean
  result: T | null
  /** Human-readable failure reason — never a raw stack trace, never PHI/transcript text. Null when ok, or when the evaluator was intentionally skipped (see skippedReason). */
  error: string | null
  /** Set (with error null) when this evaluator was deliberately not attempted for a structural reason — e.g. agreement skipped because one of its two inputs failed. Mutually exclusive with error. */
  skippedReason: string | null
  latencyMs: number
  costUsd: number | null
  /**
   * Provenance fields are carried on the WRAPPER itself (populated by
   * cli.ts's case runner) rather than read out of `result` — AgreementResult
   * (agreement.ts) has no embedded provenance field at all (the production
   * pipeline supplies it externally too, see independentDdx.ts's
   * runIndependentDdxAndAgreement), so a uniform wrapper-level contract is
   * simpler and safer than reaching into each T's own shape.
   */
  modelId: string | null
  promptVersion: string | null
  /** Thoroughness only — null for the other three evaluators. */
  rubricVersion: string | null
  inferenceParams: Record<string, unknown> | null
}

export interface HistorianEvalGroundTruthHit {
  top1Hit: boolean
  top3Hit: boolean
}

export interface HistorianEvalGroundTruth {
  expectedCandidates: string[]
  pipeline: HistorianEvalGroundTruthHit | null
  independent: HistorianEvalGroundTruthHit | null
}

export interface HistorianEvalCaseOutcome {
  caseId: string
  source: 'fixture' | 'session'
  chiefComplaint: string | null
  syndrome: string | null
  turnCount: number
  finalDifferential: HistorianEvalRunResult<FinalDifferential>
  thoroughness: HistorianEvalRunResult<ThoroughnessEvaluation>
  independentDdx: HistorianEvalRunResult<IndependentDifferential>
  agreement: HistorianEvalRunResult<AgreementResult>
  groundTruth: HistorianEvalGroundTruth | null
}

// ── Release gates ─────────────────────────────────────────────────────────────

export type HistorianEvalGateMetric =
  | 'thoroughness_mean_overall'
  | 'deterministic_diagnosis_leak_count'
  | 'pipeline_ground_truth_top3_rate'
  | 'independent_agreement_top3_rate'

export interface HistorianEvalReleaseGate {
  id: string
  scope: 'synthetic_software_release_only'
  metric: HistorianEvalGateMetric
  operator: 'gte' | 'lte' | 'eq'
  threshold: number
  description: string
}

export interface HistorianEvalReleaseGateSet {
  schemaVersion: '1.0'
  gateSetId: string
  scope: 'synthetic_software_release_only'
  clinicalValidationClaim: false
  gates: HistorianEvalReleaseGate[]
}

// ── Gate-set JSON validation (hand-rolled — mirrors
//    src/lib/triage/sentinel/catalog.ts's isRecord/boundedString/enumValue/
//    fail convention, the established pattern for validating untrusted JSON
//    in this repo; see rubric.ts's doc comment for the same citation) ───────

const GATE_METRICS = [
  'thoroughness_mean_overall',
  'deterministic_diagnosis_leak_count',
  'pipeline_ground_truth_top3_rate',
  'independent_agreement_top3_rate',
] as const satisfies readonly HistorianEvalGateMetric[]

const GATE_OPERATORS = ['gte', 'lte', 'eq'] as const satisfies readonly HistorianEvalReleaseGate['operator'][]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(path: string, reason: string): never {
  throw new Error(`Invalid historian-eval release gates ${path}: ${reason}`)
}

function boundedString(value: unknown, path: string, maxLength = 2_000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    fail(path, `must be a non-empty string of at most ${maxLength} characters`)
  }
  return value
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    fail(path, `must be one of ${allowed.join(', ')}`)
  }
  return value as T
}

function parseReleaseGate(value: unknown, path: string): HistorianEvalReleaseGate {
  if (!isRecord(value)) fail(path, 'must be an object')
  if (value.scope !== 'synthetic_software_release_only') {
    fail(`${path}.scope`, 'must be synthetic_software_release_only')
  }
  if (typeof value.threshold !== 'number' || !Number.isFinite(value.threshold)) {
    fail(`${path}.threshold`, 'must be a finite number')
  }
  return {
    id: boundedString(value.id, `${path}.id`, 100),
    scope: 'synthetic_software_release_only',
    metric: enumValue(value.metric, GATE_METRICS, `${path}.metric`),
    operator: enumValue(value.operator, GATE_OPERATORS, `${path}.operator`),
    threshold: value.threshold,
    description: boundedString(value.description, `${path}.description`, 500),
  }
}

/**
 * Validate an unknown JSON value (e.g. the parsed contents of
 * qa/historian-eval/release-gates.json) into a HistorianEvalReleaseGateSet.
 * Throws a descriptive Error on any structural problem — never silently
 * coerces a malformed gate file into something plausible.
 */
export function parseHistorianEvalReleaseGates(value: unknown): HistorianEvalReleaseGateSet {
  if (!isRecord(value)) fail('release gates', 'must be an object')
  if (value.schemaVersion !== '1.0') fail('release gates.schemaVersion', 'must be 1.0')
  if (value.scope !== 'synthetic_software_release_only' || value.clinicalValidationClaim !== false) {
    fail('release gates', 'must be synthetic software release gates with clinicalValidationClaim=false')
  }
  if (!Array.isArray(value.gates) || value.gates.length === 0) {
    fail('release gates.gates', 'must contain at least one gate')
  }
  const gates = value.gates.map((gate, index) => parseReleaseGate(gate, `release gates.gates[${index}]`))
  if (new Set(gates.map((g) => g.id)).size !== gates.length) {
    fail('release gates.gates', 'contains duplicate gate ids')
  }
  return {
    schemaVersion: '1.0',
    gateSetId: boundedString(value.gateSetId, 'release gates.gateSetId', 120),
    scope: 'synthetic_software_release_only',
    clinicalValidationClaim: false,
    gates,
  }
}

export interface HistorianEvalGateResult {
  id: string
  metric: HistorianEvalGateMetric
  operator: HistorianEvalReleaseGate['operator']
  threshold: number
  observed: number | null
  evaluated: boolean
  passed: boolean | null
  description: string
}

// ── Aggregates ─────────────────────────────────────────────────────────────────

export interface RangeStat {
  n: number
  min: number
  mean: number
  max: number
}

export interface RateStat {
  count: number
  denominator: number
  rate: number | null
}

export interface HistorianEvalAggregates {
  totalCases: number
  thoroughnessOverall: RangeStat | null
  agreementTop3Overlap: RangeStat | null
  agreementJaccardTop3: RangeStat | null
  deterministicDiagnosisLeakCount: number
  pipelineGroundTruthTop1: RateStat
  pipelineGroundTruthTop3: RateStat
  independentGroundTruthTop1: RateStat
  independentGroundTruthTop3: RateStat
  /** Rate of evaluated cases where agreement.top3Overlap >= 1 — the independent-agreement-top3 gate's metric. */
  independentAgreementTop3: RateStat
  /** True when at least one case's thoroughness evaluation reports unvetted: true. */
  unvetted: boolean
}

// ── Provenance ─────────────────────────────────────────────────────────────────

export type HistorianEvalEvaluatorName =
  | 'final_differential'
  | 'thoroughness'
  | 'independent_ddx'
  | 'agreement'

export interface HistorianEvalProvenanceRow {
  evaluator: HistorianEvalEvaluatorName
  /** Distinct model ids observed across successful cases, sorted. Empty when no case ran this evaluator successfully. */
  modelIds: string[]
  /** Distinct prompt versions observed across successful cases, sorted. */
  promptVersions: string[]
  /** Distinct rubric versions observed (thoroughness only) — always [] for the other three evaluators. */
  rubricVersions: string[]
  /** true = every case's rubric was vetted; false = at least one was unvetted; null = N/A (no rubric, i.e. not the thoroughness row). */
  vetted: boolean | null
  /** Inference params from the first successful case (temperature/max_tokens/etc. are static per evaluator call site, not per-case). Null when no case ran successfully. */
  inferenceParams: Record<string, unknown> | null
  casesRun: number
  casesFailed: number
}

// ── Cost / latency ───────────────────────────────────────────────────────────

export interface HistorianEvalEvaluatorCostLatency {
  evaluator: HistorianEvalEvaluatorName
  n: number
  totalCostUsd: number | null
  /** false when at least one included case's costUsd was null (unknown) — totalCostUsd is a partial sum in that case, never silently coerced to a complete figure. */
  costKnownForAll: boolean
  totalLatencyMs: number
  meanLatencyMs: number
  perCase: { caseId: string; costUsd: number | null; latencyMs: number }[]
}

export interface HistorianEvalCostLatencySummary {
  byEvaluator: HistorianEvalEvaluatorCostLatency[]
  totalCostUsd: number | null
  totalCostKnownForAll: boolean
  totalLatencyMs: number
}

// ── Top-level report ─────────────────────────────────────────────────────────

export interface HistorianEvalReport {
  schemaVersion: '1.0'
  generatedAt: string
  mode: 'fixtures' | 'sessions'
  live: boolean
  clinicalValidationClaim: false
  banner: string
  headline: string
  selfLabel: { unvetted: boolean; label: string | null }
  honestN: { n: number; label: string }
  gateSetId: string
  provenance: HistorianEvalProvenanceRow[]
  cases: HistorianEvalCaseOutcome[]
  aggregates: HistorianEvalAggregates
  gates: HistorianEvalGateResult[]
  releaseGateEligible: boolean
  releaseGatePassed: boolean | null
  costLatency: HistorianEvalCostLatencySummary
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

function computeRange(values: number[]): RangeStat | null {
  if (values.length === 0) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return { n: values.length, min, mean, max }
}

function computeRate(hits: boolean[]): RateStat {
  const denominator = hits.length
  const count = hits.filter(Boolean).length
  return { count, denominator, rate: denominator > 0 ? count / denominator : null }
}

/** honest-n label — varies by mode since "development-set personas" is only true for fixtures. */
function honestNLabel(mode: 'fixtures' | 'sessions', n: number): string {
  if (mode === 'fixtures') {
    return `n=${n} development-set personas; tuning permitted; no held-out claims`
  }
  return `n=${n} production session(s) sampled ad hoc; not a validated or held-out cohort`
}

// ── Aggregation ──────────────────────────────────────────────────────────────

export function aggregateHistorianEvalCases(cases: HistorianEvalCaseOutcome[]): HistorianEvalAggregates {
  const thoroughnessOverall = computeRange(
    cases.filter((c) => c.thoroughness.ok && c.thoroughness.result).map((c) => c.thoroughness.result!.overall),
  )
  const agreementTop3Overlap = computeRange(
    cases.filter((c) => c.agreement.ok && c.agreement.result).map((c) => c.agreement.result!.top3Overlap),
  )
  const agreementJaccardTop3 = computeRange(
    cases.filter((c) => c.agreement.ok && c.agreement.result).map((c) => c.agreement.result!.jaccardTop3),
  )
  const deterministicDiagnosisLeakCount = cases
    .filter((c) => c.thoroughness.ok && c.thoroughness.result)
    .reduce((sum, c) => sum + c.thoroughness.result!.deterministic.diagnosisLeak.matches.length, 0)

  const pipelineGroundTruthTop1 = computeRate(
    cases.filter((c) => c.groundTruth?.pipeline).map((c) => c.groundTruth!.pipeline!.top1Hit),
  )
  const pipelineGroundTruthTop3 = computeRate(
    cases.filter((c) => c.groundTruth?.pipeline).map((c) => c.groundTruth!.pipeline!.top3Hit),
  )
  const independentGroundTruthTop1 = computeRate(
    cases.filter((c) => c.groundTruth?.independent).map((c) => c.groundTruth!.independent!.top1Hit),
  )
  const independentGroundTruthTop3 = computeRate(
    cases.filter((c) => c.groundTruth?.independent).map((c) => c.groundTruth!.independent!.top3Hit),
  )
  const independentAgreementTop3 = computeRate(
    cases.filter((c) => c.agreement.ok && c.agreement.result).map((c) => c.agreement.result!.top3Overlap >= 1),
  )

  const unvetted = cases.some((c) => c.thoroughness.ok && c.thoroughness.result?.unvetted === true)

  return {
    totalCases: cases.length,
    thoroughnessOverall,
    agreementTop3Overlap,
    agreementJaccardTop3,
    deterministicDiagnosisLeakCount,
    pipelineGroundTruthTop1,
    pipelineGroundTruthTop3,
    independentGroundTruthTop1,
    independentGroundTruthTop3,
    independentAgreementTop3,
    unvetted,
  }
}

// ── Gate evaluation ──────────────────────────────────────────────────────────

function observedForMetric(metric: HistorianEvalGateMetric, aggregates: HistorianEvalAggregates): number | null {
  switch (metric) {
    case 'thoroughness_mean_overall':
      return aggregates.thoroughnessOverall?.mean ?? null
    case 'deterministic_diagnosis_leak_count':
      return aggregates.deterministicDiagnosisLeakCount
    case 'pipeline_ground_truth_top3_rate':
      return aggregates.pipelineGroundTruthTop3.rate
    case 'independent_agreement_top3_rate':
      return aggregates.independentAgreementTop3.rate
    default:
      return null
  }
}

function evaluateOperator(operator: HistorianEvalReleaseGate['operator'], observed: number, threshold: number): boolean {
  if (operator === 'gte') return observed >= threshold
  if (operator === 'lte') return observed <= threshold
  return observed === threshold
}

/**
 * Evaluate every gate in gateSet against the aggregates. When `live` is
 * false (a structure-only dry run — see cli.ts), every gate is reported as
 * NOT evaluated (observed: null, passed: null) regardless of what the
 * (necessarily empty) aggregates happen to compute — gates are evaluated in
 * fixtures/sessions mode only when --live, per the task's binding
 * constraint, never as an incidental side effect of zero data.
 */
export function evaluateHistorianEvalGates(
  aggregates: HistorianEvalAggregates,
  gateSet: HistorianEvalReleaseGateSet,
  live: boolean,
): HistorianEvalGateResult[] {
  return gateSet.gates.map((gate) => {
    if (!live) {
      return {
        id: gate.id,
        metric: gate.metric,
        operator: gate.operator,
        threshold: gate.threshold,
        observed: null,
        evaluated: false,
        passed: null,
        description: gate.description,
      }
    }
    const observed = observedForMetric(gate.metric, aggregates)
    return {
      id: gate.id,
      metric: gate.metric,
      operator: gate.operator,
      threshold: gate.threshold,
      observed,
      evaluated: true,
      passed: observed === null ? false : evaluateOperator(gate.operator, observed, gate.threshold),
      description: gate.description,
    }
  })
}

// ── Provenance ─────────────────────────────────────────────────────────────────

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort()
}

function buildProvenanceRow(
  evaluator: HistorianEvalEvaluatorName,
  runs: HistorianEvalRunResult<unknown>[],
  vetted: boolean | null,
): HistorianEvalProvenanceRow {
  const succeeded = runs.filter((r) => r.ok)
  const modelIds = sortedUnique(succeeded.map((r) => r.modelId).filter((v): v is string => !!v))
  const promptVersions = sortedUnique(succeeded.map((r) => r.promptVersion).filter((v): v is string => !!v))
  const rubricVersions = sortedUnique(succeeded.map((r) => r.rubricVersion).filter((v): v is string => !!v))
  const inferenceParams = succeeded[0]?.inferenceParams ?? null

  return {
    evaluator,
    modelIds,
    promptVersions,
    rubricVersions,
    vetted,
    inferenceParams,
    casesRun: succeeded.length,
    casesFailed: runs.length - succeeded.length,
  }
}

export function buildHistorianEvalProvenance(cases: HistorianEvalCaseOutcome[]): HistorianEvalProvenanceRow[] {
  const anyUnvetted = cases.some((c) => c.thoroughness.ok && c.thoroughness.result?.unvetted === true)
  const anyThoroughnessRan = cases.some((c) => c.thoroughness.ok)
  return [
    buildProvenanceRow('final_differential', cases.map((c) => c.finalDifferential), null),
    buildProvenanceRow('thoroughness', cases.map((c) => c.thoroughness), anyThoroughnessRan ? !anyUnvetted : null),
    buildProvenanceRow('independent_ddx', cases.map((c) => c.independentDdx), null),
    buildProvenanceRow('agreement', cases.map((c) => c.agreement), null),
  ]
}

// ── Cost / latency ───────────────────────────────────────────────────────────

function evaluatorCostLatency(
  evaluator: HistorianEvalEvaluatorName,
  runs: { caseId: string; run: HistorianEvalRunResult<unknown> }[],
): HistorianEvalEvaluatorCostLatency {
  // Only runs that were actually attempted count toward n/totals — a
  // deliberately skipped evaluator (e.g. agreement when its inputs failed)
  // contributes zero latency/cost, not an "unknown" that muddies the total.
  const attempted = runs.filter((r) => r.run.skippedReason === null)
  const totalLatencyMs = attempted.reduce((sum, r) => sum + r.run.latencyMs, 0)
  const costs = attempted.map((r) => r.run.costUsd)
  const costKnownForAll = costs.every((c) => c !== null)
  const totalCostUsd = costs.some((c) => c !== null) ? costs.reduce((sum: number, c) => sum + (c ?? 0), 0) : null
  return {
    evaluator,
    n: attempted.length,
    totalCostUsd,
    costKnownForAll,
    totalLatencyMs,
    meanLatencyMs: attempted.length > 0 ? totalLatencyMs / attempted.length : 0,
    perCase: attempted.map((r) => ({ caseId: r.caseId, costUsd: r.run.costUsd, latencyMs: r.run.latencyMs })),
  }
}

export function buildHistorianEvalCostLatency(cases: HistorianEvalCaseOutcome[]): HistorianEvalCostLatencySummary {
  const byEvaluator = [
    evaluatorCostLatency('final_differential', cases.map((c) => ({ caseId: c.caseId, run: c.finalDifferential }))),
    evaluatorCostLatency('thoroughness', cases.map((c) => ({ caseId: c.caseId, run: c.thoroughness }))),
    evaluatorCostLatency('independent_ddx', cases.map((c) => ({ caseId: c.caseId, run: c.independentDdx }))),
    evaluatorCostLatency('agreement', cases.map((c) => ({ caseId: c.caseId, run: c.agreement }))),
  ]
  const totalLatencyMs = byEvaluator.reduce((sum, e) => sum + e.totalLatencyMs, 0)
  const totalCostKnownForAll = byEvaluator.every((e) => e.costKnownForAll)
  const anyKnownCost = byEvaluator.some((e) => e.totalCostUsd !== null)
  const totalCostUsd = anyKnownCost ? byEvaluator.reduce((sum, e) => sum + (e.totalCostUsd ?? 0), 0) : null
  return { byEvaluator, totalCostUsd, totalCostKnownForAll, totalLatencyMs }
}

// ── Report builder ───────────────────────────────────────────────────────────

export function buildHistorianEvalReport(input: {
  mode: 'fixtures' | 'sessions'
  live: boolean
  cases: HistorianEvalCaseOutcome[]
  gateSet: HistorianEvalReleaseGateSet
  generatedAt: string
}): HistorianEvalReport {
  const aggregates = aggregateHistorianEvalCases(input.cases)
  const gates = evaluateHistorianEvalGates(aggregates, input.gateSet, input.live)
  const provenance = buildHistorianEvalProvenance(input.cases)
  const costLatency = buildHistorianEvalCostLatency(input.cases)

  return {
    schemaVersion: '1.0',
    generatedAt: input.generatedAt,
    mode: input.mode,
    live: input.live,
    clinicalValidationClaim: false,
    banner: INVESTIGATIONAL_BANNER,
    headline: HISTORIAN_EVAL_HEADLINE,
    selfLabel: {
      unvetted: aggregates.unvetted,
      label: input.live && aggregates.unvetted ? UNVETTED_SELF_LABEL : null,
    },
    honestN: { n: input.cases.length, label: honestNLabel(input.mode, input.cases.length) },
    gateSetId: input.gateSet.gateSetId,
    provenance,
    cases: input.cases,
    aggregates,
    gates,
    releaseGateEligible: input.live,
    releaseGatePassed: input.live ? gates.every((g) => g.passed === true) : null,
    costLatency,
  }
}

// ── Markdown rendering ───────────────────────────────────────────────────────

function fmtNum(value: number | null, digits = 1): string {
  return value === null ? 'N/A' : value.toFixed(digits)
}

function fmtCost(value: number | null): string {
  return value === null ? 'unknown' : `$${value.toFixed(6)}`
}

function fmtRange(range: RangeStat | null): string {
  if (!range) return 'N/A (no evaluated cases)'
  return `min ${fmtNum(range.min)} / mean ${fmtNum(range.mean)} / max ${fmtNum(range.max)} (n=${range.n})`
}

function fmtRate(rate: RateStat): string {
  return rate.rate === null ? 'N/A' : `${(rate.rate * 100).toFixed(1)}% (${rate.count}/${rate.denominator})`
}

function fmtDdxList(items: { diagnosis: string }[] | undefined): string {
  if (!items || items.length === 0) return '—'
  return items
    .slice(0, 3)
    .map((d) => d.diagnosis)
    .join('; ')
}

/**
 * Uniform "what happened with this evaluator" text for one run — ok (with
 * caller-supplied detail), skipped (dry run / a structural dependency
 * wasn't met), or failed (with the real error message). Shared across all
 * four evaluator lines in caseRow so a skipped run (dry run, or agreement's
 * dependency skip) is never misreported as a failure with a fabricated
 * "unknown error" — see the bug this fixed: dry-run cases showed
 * "FAILED — unknown error" for thoroughness/finalDifferential because only
 * independentDdx/agreement checked skippedReason before this helper existed.
 */
function runStatusText<T>(run: HistorianEvalRunResult<T>, describeOk: (result: T) => string): string {
  if (run.ok && run.result) return describeOk(run.result)
  if (run.skippedReason) return `skipped — ${run.skippedReason}`
  return `FAILED — ${run.error ?? 'unknown error'}`
}

function caseRow(c: HistorianEvalCaseOutcome): string {
  const th = c.thoroughness.ok ? c.thoroughness.result : null
  const gt = c.groundTruth
  return [
    `### ${c.caseId} (${c.source})`,
    '',
    `- Chief complaint: ${c.chiefComplaint ?? 'N/A'}`,
    `- Syndrome: ${c.syndrome ?? 'N/A'}`,
    `- Turns: ${c.turnCount}`,
    `- Thoroughness: ${runStatusText(
      c.thoroughness,
      (result) =>
        `overall=${result.overall} confidence=${result.confidence.level} missed_critical=${result.missed_critical_questions.length} coverage_disagreement=${result.coverage_disagreement} unvetted=${result.unvetted}`,
    )}`,
    th?.fidelity
      ? `- Fidelity: fabricated_claims=${th.fidelity.fabricated_claims.length} material_omissions=${th.fidelity.material_omissions.length}`
      : '- Fidelity: not screened (no report supplied)',
    `- Pipeline DDx top-3: ${runStatusText(c.finalDifferential, (result) => fmtDdxList(result.differential))}`,
    `- Independent (R1) DDx top-3: ${runStatusText(c.independentDdx, (result) => fmtDdxList(result.differential))}`,
    `- Agreement: ${runStatusText(
      c.agreement,
      (result) => `top1Match=${result.top1Match} top3Overlap=${result.top3Overlap}/3 jaccard=${result.jaccardTop3.toFixed(2)}`,
    )}`,
    `- Ground truth: expected=[${gt?.expectedCandidates.join(' | ') ?? 'N/A'}] pipeline(top1/top3)=${gt?.pipeline ? `${gt.pipeline.top1Hit}/${gt.pipeline.top3Hit}` : 'N/A'} independent(top1/top3)=${gt?.independent ? `${gt.independent.top1Hit}/${gt.independent.top3Hit}` : 'N/A'}`,
    '',
  ].join('\n')
}

function costLatencyTable(summary: HistorianEvalCostLatencySummary): string[] {
  const rows = summary.byEvaluator.map(
    (e) =>
      `| ${e.evaluator} | ${e.n} | ${fmtCost(e.totalCostUsd)}${e.costKnownForAll ? '' : ' (partial/unknown)'} | ${e.totalLatencyMs.toFixed(0)} | ${e.meanLatencyMs.toFixed(0)} |`,
  )
  return [
    '| Evaluator | Cases run | Total cost | Total latency ms | Mean latency ms |',
    '|---|---:|---:|---:|---:|',
    ...rows,
    '',
    `Totals: cost ${fmtCost(summary.totalCostUsd)}${summary.totalCostKnownForAll ? '' : ' (partial/unknown)'}, latency ${summary.totalLatencyMs.toFixed(0)}ms.`,
    '',
    'Unknown cost means the evaluator\'s public API does not expose token usage (final_differential, independent_ddx, agreement) — never coerced to zero.',
  ]
}

export function formatHistorianEvalMarkdown(report: HistorianEvalReport): string {
  const failedGates = report.gates.filter((g) => g.evaluated && !g.passed)

  const provenanceRows = report.provenance.map(
    (p) =>
      `| ${p.evaluator} | ${p.modelIds.join(', ') || 'N/A'} | ${p.promptVersions.join(', ') || 'N/A'} | ${p.rubricVersions.join(', ') || 'N/A'} | ${p.vetted === null ? 'N/A' : p.vetted ? 'vetted' : 'UNVETTED'} | ${p.casesRun}/${p.casesRun + p.casesFailed} |`,
  )

  const gateRows = report.gates.map(
    (g) =>
      `| ${g.id} | ${g.observed === null ? 'N/A' : g.observed} | ${g.operator} ${g.threshold} | ${!g.evaluated ? 'NOT EVALUATED (dry run)' : g.passed ? 'PASS' : 'FAIL'} |`,
  )

  return [
    `# ${report.banner}`,
    '',
    `## ${report.headline}`,
    '',
    `> clinicalValidationClaim: ${report.clinicalValidationClaim}. Passing these gates does not establish safety, effectiveness, calibration, or fitness for patient care.`,
    '',
    report.live && report.selfLabel.unvetted
      ? `**${UNVETTED_SELF_LABEL}** — at least one rubric contributing to these scores has not been clinician-vetted.`
      : report.live
        ? 'All rubrics contributing to these scores are clinician-vetted.'
        : 'Rubric vetted-status not evaluated — this is a dry run (pass --live to execute).',
    '',
    `Honest n: ${report.honestN.label}`,
    '',
    `- Generated: ${report.generatedAt}`,
    `- Mode: ${report.mode}`,
    `- Live: ${report.live ? 'yes' : 'no (dry run — structure-only, no Bedrock/DB calls made)'}`,
    `- Gate set: ${report.gateSetId}`,
    `- Release-gate eligible: ${report.releaseGateEligible ? 'yes' : 'no (dry run)'}`,
    `- Release-gate result: ${report.releaseGatePassed === null ? 'NOT EVALUATED' : report.releaseGatePassed ? 'PASS' : 'FAIL'}`,
    '',
    '## Provenance',
    '',
    '| Evaluator | Model id(s) | Prompt version(s) | Rubric version(s) | Vetted | Cases run/total |',
    '|---|---|---|---|---|---:|',
    ...provenanceRows,
    '',
    '## Per-case scorecards',
    '',
    ...report.cases.map(caseRow),
    '## Aggregates (ranges, not point estimates)',
    '',
    `- Thoroughness overall: ${fmtRange(report.aggregates.thoroughnessOverall)}`,
    `- Agreement top3Overlap: ${fmtRange(report.aggregates.agreementTop3Overlap)}`,
    `- Agreement Jaccard top-3: ${fmtRange(report.aggregates.agreementJaccardTop3)}`,
    `- Deterministic diagnosis-leak count (summed): ${report.aggregates.deterministicDiagnosisLeakCount}`,
    `- Pipeline ground-truth hit rate: top1=${fmtRate(report.aggregates.pipelineGroundTruthTop1)} top3=${fmtRate(report.aggregates.pipelineGroundTruthTop3)}`,
    `- Independent ground-truth hit rate: top1=${fmtRate(report.aggregates.independentGroundTruthTop1)} top3=${fmtRate(report.aggregates.independentGroundTruthTop3)}`,
    `- Independent/pipeline top-3 agreement rate (>=1 overlap): ${fmtRate(report.aggregates.independentAgreementTop3)}`,
    '',
    '## Release gates',
    '',
    '| Gate | Observed | Requirement | Result |',
    '|---|---:|---:|---|',
    ...gateRows,
    '',
    failedGates.length === 0
      ? report.releaseGateEligible
        ? 'No synthetic software release gate failed.'
        : 'Gates not evaluated (dry run).'
      : `Failed gates: ${failedGates.map((g) => g.id).join(', ')}. This is data to report, not something this harness tunes around.`,
    '',
    '## Cost / latency',
    '',
    ...costLatencyTable(report.costLatency),
    '',
    '## Interpretation boundary',
    '',
    'This is a synthetic-software-release artifact for internal QI/IRB preparation, not a clinical validation study. Clinical deployment still requires independent clinician labeling, representative retrospective and prospective validation, subgroup analysis, calibrated review SLAs, and governance approval.',
    '',
  ].join('\n')
}
