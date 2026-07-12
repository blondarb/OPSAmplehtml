import {
  aggregateSentinelMetrics,
  evaluateSentinelReleaseGates,
  runOfflineSentinelSuite,
} from './evaluator'
import type {
  SentinelCatalog,
  SentinelEvaluationReport,
  SentinelRateMetric,
  SentinelReleaseGateSet,
  SentinelSliceMetrics,
} from './types'

export function buildOfflineSentinelReport(
  catalog: SentinelCatalog,
  gateSet: SentinelReleaseGateSet,
  generatedAt = new Date().toISOString(),
): SentinelEvaluationReport {
  const { outcomes } = runOfflineSentinelSuite(catalog)
  return buildSentinelReportFromOutcomes({
    catalog,
    gateSet,
    mode: 'offline_deterministic',
    outcomes,
    evaluationScope: 'full_catalog',
    generatedAt,
  })
}

export function buildSentinelReportFromOutcomes(input: {
  catalog: SentinelCatalog
  gateSet: SentinelReleaseGateSet
  mode: SentinelEvaluationReport['mode']
  outcomes: SentinelEvaluationReport['outcomes']
  evaluationScope: SentinelEvaluationReport['evaluationScope']
  generatedAt?: string
}): SentinelEvaluationReport {
  // Aggregation is pure and never reruns a model branch.
  const metrics = aggregateSentinelMetrics(input.outcomes)
  const gates = evaluateSentinelReleaseGates(metrics, input.gateSet)
  const releaseGateEligible = input.evaluationScope === 'full_catalog'
  return {
    schemaVersion: '1.0',
    catalogId: input.catalog.catalogId,
    gateSetId: input.gateSet.gateSetId,
    mode: input.mode,
    synthetic: true,
    clinicalValidationClaim: false,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    evaluationScope: input.evaluationScope,
    releaseGateEligible,
    outcomes: input.outcomes,
    metrics,
    gates,
    releaseGatePassed:
      releaseGateEligible && gates.every((gate) => gate.passed),
  }
}

function percent(metric: SentinelRateMetric): string {
  return metric.rate === null ? 'N/A' : `${(metric.rate * 100).toFixed(1)}%`
}

function metricCell(metric: SentinelRateMetric): string {
  return `${metric.count}/${metric.denominator} (${percent(metric)})`
}

function sliceRows(slices: Record<string, SentinelSliceMetrics>): string[] {
  return Object.entries(slices)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([name, value]) =>
        `| ${name} | ${value.evaluatedCases} | ${metricCell(value.exactOrAcceptable)} | ${metricCell(value.underTriage)} | ${metricCell(value.overTriage)} | ${metricCell(value.manualHold)} | ${metricCell(value.alerts)} |`,
    )
}

export function formatSentinelMarkdown(
  report: SentinelEvaluationReport,
): string {
  const metrics = report.metrics
  const failedGates = report.gates.filter((gate) => !gate.passed)
  const findingRows = report.outcomes
    .filter(
      (outcome) =>
        outcome.underTriaged || outcome.overTriaged || outcome.manualHold,
    )
    .map(
      (outcome) =>
        `| ${outcome.caseId} | ${outcome.expectedPathway} | ${outcome.actualPathway ?? 'not evaluated'} | ${outcome.underTriaged ? 'yes' : 'no'} | ${outcome.overTriaged ? 'yes' : 'no'} | ${outcome.manualHold ? 'yes' : 'no'} |`,
    )

  const telemetryRows = Object.entries(metrics.telemetryByBranch)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([branch, value]) =>
        `| ${branch} | ${value.executions} | ${value.inputTokens}${value.tokenUsageComplete ? '' : ' (partial/unknown)'} | ${value.outputTokens}${value.tokenUsageComplete ? '' : ' (partial/unknown)'} | ${value.latencyMs.toFixed(1)} | ${value.costUsd === null ? 'unknown' : value.costUsd.toFixed(6)} |`,
    )

  return [
    '# Neurology Triage Sentinel Report',
    '',
    '> **SYNTHETIC SOFTWARE EVALUATION — NOT CLINICALLY VALIDATED.** Passing these gates does not establish safety, effectiveness, calibration, or fitness for patient care.',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Catalog: ${report.catalogId}`,
    `- Mode: ${report.mode}`,
    `- Evaluation scope: ${report.evaluationScope}`,
    `- Release-gate eligible: ${report.releaseGateEligible ? 'yes' : 'no (subset runs cannot release)'}`,
    `- Release-gate result: ${report.releaseGatePassed ? 'PASS' : 'FAIL'}`,
    `- Evaluated: ${metrics.evaluatedCases}/${metrics.totalCases}; live-only unevaluated: ${metrics.unevaluatedCases}`,
    '',
    '## Safety and accuracy metrics',
    '',
    '| Metric | Result |',
    '|---|---:|',
    `| Exact / acceptable disposition | ${metricCell(metrics.exactOrAcceptable)} |`,
    `| Under-triage | ${metricCell(metrics.underTriage)} |`,
    `| Emergency under-triage | ${metricCell(metrics.emergencyUnderTriage)} |`,
    `| Over-triage | ${metricCell(metrics.overTriage)} |`,
    `| Manual hold / abstention | ${metricCell(metrics.manualHold)} |`,
    `| Alert burden | ${metricCell(metrics.alertBurden)} |`,
    `| Hard-negative false alerts | ${metricCell(metrics.hardNegativeFalseAlerts)} |`,
    `| Exact evidence | ${metricCell(metrics.evidenceExactness)} |`,
    `| Exact time-critical evidence | ${metricCell(metrics.timeCriticalEvidenceExactness)} |`,
    '',
    '## Release gates',
    '',
    '| Gate | Observed | Requirement | Result |',
    '|---|---:|---:|---|',
    ...report.gates.map(
      (gate) =>
        `| ${gate.id} | ${gate.observed} | ${gate.operator} ${gate.threshold} | ${gate.passed ? 'PASS' : 'FAIL'} |`,
    ),
    '',
    failedGates.length === 0
      ? 'No synthetic software release gate failed.'
      : `Failed gates: ${failedGates.map((gate) => gate.id).join(', ')}.`,
    '',
    '## Case-level safety findings',
    '',
    '| Case | Expected | Actual | Under-triage | Over-triage | Manual hold |',
    '|---|---|---|---|---|---|',
    ...(findingRows.length > 0
      ? findingRows
      : ['| none | — | — | — | — | — |']),
    '',
    '## Syndrome performance',
    '',
    '| Syndrome | Evaluated | Exact | Under-triage | Over-triage | Manual hold | Alerts |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...sliceRows(metrics.bySyndrome),
    '',
    '## Subgroup performance',
    '',
    '| Subgroup | Evaluated | Exact | Under-triage | Over-triage | Manual hold | Alerts |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...sliceRows(metrics.bySubgroup),
    '',
    '## Tokens / cost / latency',
    '',
    '| Branch | Executions | Input tokens | Output tokens | Latency ms | Cost USD |',
    '|---|---:|---:|---:|---:|---:|',
    ...telemetryRows,
    '',
    'Offline model branches show zero executions and zero tokens; no AWS or model call is made. A zero in an unexecuted branch is not a price estimate. Unknown cost for an executed live branch is reported as unknown, never coerced to zero.',
    '',
    '## Interpretation boundary',
    '',
    'This sentinel is a regression and software-release artifact. Clinical deployment still requires independent clinician labeling, representative retrospective and prospective validation, subgroup and site analysis, calibrated alert/hold SLAs, human-factors testing, drift monitoring, incident response, and governance approval.',
    '',
  ].join('\n')
}
