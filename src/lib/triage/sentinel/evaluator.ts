import {
  runEmergencyGateway,
  type GatewayEvidence,
  type GatewaySignal,
} from '../emergencyGateway'
import type { SafetyModelSignal } from '../modelSafetyExtraction'
import { scanLongPacketEmergency } from '../longPacketEmergency'
import { planLongPacketChunks } from '../longPacketPlanner'
import type { CarePathway } from '../types'
import type {
  SentinelBranchTelemetry,
  SentinelCatalog,
  SentinelCase,
  SentinelCaseOutcome,
  SentinelEvidenceValidation,
  SentinelExpectation,
  SentinelGateResult,
  SentinelInput,
  SentinelMetrics,
  SentinelRateMetric,
  SentinelReleaseGateSet,
  SentinelSliceMetrics,
  SentinelTelemetrySummary,
} from './types'

interface SentinelDispositionClassification {
  exactOrAcceptable: boolean
  underTriaged: boolean
  overTriaged: boolean
  manualHold: boolean
  alertRaised: boolean
}

const URGENCY_RANK: Record<CarePathway, number> = {
  redirect: 0,
  routine_outpatient: 1,
  expedited_outpatient: 2,
  undetermined: 3,
  same_day_clinician_review: 4,
  emergency_now: 5,
}

export function classifySentinelDisposition(
  expected: SentinelExpectation,
  actual: CarePathway,
): SentinelDispositionClassification {
  const manualHold = actual === 'undetermined'
  const alertRaised =
    actual === 'emergency_now' || actual === 'same_day_clinician_review'
  const exactOrAcceptable = expected.acceptablePathways.includes(actual)

  let underTriaged = false
  if (expected.clinicalClass === 'time_critical') {
    underTriaged = actual !== 'emergency_now'
  } else if (expected.clinicalClass === 'same_day') {
    underTriaged = ![
      'emergency_now',
      'same_day_clinician_review',
    ].includes(actual)
  }

  const overTriaged =
    expected.clinicalClass === 'routine' &&
    !manualHold &&
    URGENCY_RANK[actual] > URGENCY_RANK.routine_outpatient

  return {
    exactOrAcceptable,
    underTriaged,
    overTriaged,
    manualHold,
    alertRaised,
  }
}

function invalidEvidence(
  evidence: GatewayEvidence,
  input: SentinelInput,
): string | null {
  if (
    !Number.isSafeInteger(evidence.startOffset) ||
    !Number.isSafeInteger(evidence.endOffset) ||
    evidence.startOffset < 0 ||
    evidence.endOffset <= evidence.startOffset ||
    !evidence.quote
  ) {
    return 'invalid_or_empty_offsets'
  }

  if (input.kind === 'note') {
    if (evidence.endOffset > input.text.length) return 'note_offset_out_of_bounds'
    if (
      input.text.slice(evidence.startOffset, evidence.endOffset) !==
      evidence.quote
    ) {
      return 'note_quote_offset_mismatch'
    }
    return null
  }

  if (input.kind === 'missing') return 'evidence_for_missing_source'

  const document = input.documents.find(
    (item) =>
      item.packetId === evidence.packetId &&
      item.documentId === evidence.documentId,
  )
  if (!document) return 'packet_document_not_found'
  const page = document.pages.find(
    (item) => item.pageNumber === evidence.pageNumber,
  )
  if (!page) return 'packet_page_not_found'
  if (evidence.endOffset > page.text.length) return 'packet_offset_out_of_bounds'
  if (
    page.text.slice(evidence.startOffset, evidence.endOffset) !== evidence.quote
  ) {
    return 'packet_quote_offset_mismatch'
  }
  if (evidence.extractionMethod !== page.extractionMethod) {
    return 'packet_extraction_method_mismatch'
  }
  if (evidence.extractionConfidence !== page.extractionConfidence) {
    return 'packet_extraction_confidence_mismatch'
  }
  return null
}

export function validateSentinelEvidence(
  signals: Array<GatewaySignal | SafetyModelSignal>,
  input: SentinelInput,
): SentinelEvidenceValidation {
  const references = signals.flatMap((signal) => signal.evidence)
  const invalidReasons = references.flatMap((evidence) => {
    const reason = invalidEvidence(evidence, input)
    return reason ? [reason] : []
  })
  return {
    totalReferences: references.length,
    validReferences: references.length - invalidReasons.length,
    invalidReferences: invalidReasons.length,
    invalidReasons,
  }
}

function telemetry(
  overrides: Partial<SentinelBranchTelemetry>,
): SentinelBranchTelemetry {
  return {
    branch: 'deterministic_gateway',
    executed: true,
    modelId: null,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    costUsd: 0,
    status: 'complete',
    reason: null,
    ...overrides,
  }
}

function skippedOutcome(item: SentinelCase): SentinelCaseOutcome {
  return {
    caseId: item.id,
    title: item.title,
    syndrome: item.syndrome,
    tags: item.tags,
    hardNegative: item.hardNegative,
    expectedClinicalClass: item.expected.clinicalClass,
    offlineRequired: item.executionModes.includes('offline_deterministic'),
    evaluated: false,
    unevaluatedReason:
      'Case requires live_ensemble and is not eligible for offline_deterministic execution.',
    expectedPathway: item.expected.pathway,
    acceptablePathways: item.expected.acceptablePathways,
    actualPathway: null,
    exactOrAcceptable: false,
    underTriaged: false,
    overTriaged: false,
    manualHold: false,
    alertRaised: false,
    signals: [],
    evidenceValidation: {
      totalReferences: 0,
      validReferences: 0,
      invalidReferences: 0,
      invalidReasons: [],
    },
    branchTelemetry: [
      telemetry({
        executed: false,
        status: 'skipped',
        reason: 'live_ensemble_only',
      }),
    ],
  }
}

export function runOfflineSentinelCase(
  item: SentinelCase,
): SentinelCaseOutcome {
  if (!item.executionModes.includes('offline_deterministic')) {
    return skippedOutcome(item)
  }

  const startedAt = performance.now()
  let actualPathway: CarePathway = 'undetermined'
  let signals: GatewaySignal[] = []
  let branchStatus: SentinelBranchTelemetry['status'] = 'complete'
  let branchReason: string | null = null

  if (item.input.kind === 'missing') {
    branchReason = 'missing_source_fail_closed'
  } else {
    try {
      if (item.input.kind === 'note') {
        const gateway = runEmergencyGateway(item.input.text)
        actualPathway = gateway.carePathway
        signals = gateway.signals
        if (gateway.status === 'failed') {
          branchStatus = 'failed'
          branchReason = gateway.failureCode
        }
      } else {
        const plan = planLongPacketChunks(
          item.input.documents,
          item.input.chunkOptions,
        )
        const gateway = scanLongPacketEmergency(plan)
        actualPathway = gateway.carePathway
        signals = gateway.signals
        if (gateway.status === 'failed') {
          branchStatus = 'failed'
          branchReason = gateway.failureCode
        }
      }
    } catch (error) {
      actualPathway = 'undetermined'
      branchStatus = 'failed'
      branchReason =
        error instanceof Error ? error.message : 'deterministic_execution_failed'
    }
  }

  const disposition = classifySentinelDisposition(
    item.expected,
    actualPathway,
  )
  const requiredSyndromesPresent = item.expected.requiredSyndromes.every(
    (syndrome) => signals.some((signal) => signal.syndrome === syndrome),
  )
  const forbiddenSyndromesAbsent = (
    item.expected.forbiddenSyndromes ?? []
  ).every(
    (syndrome) => !signals.some((signal) => signal.syndrome === syndrome),
  )
  const evidenceValidation = validateSentinelEvidence(signals, item.input)
  const evidenceIsExact = evidenceValidation.invalidReferences === 0

  return {
    caseId: item.id,
    title: item.title,
    syndrome: item.syndrome,
    tags: item.tags,
    hardNegative: item.hardNegative,
    expectedClinicalClass: item.expected.clinicalClass,
    offlineRequired: item.executionModes.includes('offline_deterministic'),
    evaluated: true,
    unevaluatedReason: null,
    expectedPathway: item.expected.pathway,
    acceptablePathways: item.expected.acceptablePathways,
    actualPathway,
    exactOrAcceptable:
      disposition.exactOrAcceptable &&
      requiredSyndromesPresent &&
      forbiddenSyndromesAbsent &&
      evidenceIsExact,
    underTriaged: disposition.underTriaged,
    overTriaged: disposition.overTriaged,
    manualHold: disposition.manualHold,
    alertRaised: disposition.alertRaised,
    signals,
    evidenceValidation,
    branchTelemetry: [
      telemetry({
        latencyMs: Math.max(0, performance.now() - startedAt),
        status: branchStatus,
        reason: branchReason,
      }),
    ],
  }
}

function rateMetric(count: number, denominator: number): SentinelRateMetric {
  return {
    count,
    denominator,
    rate: denominator === 0 ? null : count / denominator,
  }
}

function sliceMetrics(outcomes: SentinelCaseOutcome[]): SentinelSliceMetrics {
  const evaluated = outcomes.filter((outcome) => outcome.evaluated)
  return {
    evaluatedCases: evaluated.length,
    exactOrAcceptable: rateMetric(
      evaluated.filter((outcome) => outcome.exactOrAcceptable).length,
      evaluated.length,
    ),
    underTriage: rateMetric(
      evaluated.filter((outcome) => outcome.underTriaged).length,
      evaluated.length,
    ),
    overTriage: rateMetric(
      evaluated.filter((outcome) => outcome.overTriaged).length,
      evaluated.length,
    ),
    manualHold: rateMetric(
      evaluated.filter((outcome) => outcome.manualHold).length,
      evaluated.length,
    ),
    alerts: rateMetric(
      evaluated.filter((outcome) => outcome.alertRaised).length,
      evaluated.length,
    ),
  }
}

const BRANCHES: SentinelBranchTelemetry['branch'][] = [
  'deterministic_gateway',
  'safety_extractor',
  'outpatient_scorer',
  'adjudicator',
]

function summarizeTelemetry(
  outcomes: SentinelCaseOutcome[],
): Record<string, SentinelTelemetrySummary> {
  return Object.fromEntries(
    BRANCHES.map((branch) => {
      const executed = outcomes
        .flatMap((outcome) => outcome.branchTelemetry)
        .filter((item) => item.branch === branch && item.executed)
      const hasUnknownCost = executed.some((item) => item.costUsd === null)
      const tokenUsageComplete = executed.every(
        (item) => item.inputTokens !== null && item.outputTokens !== null,
      )
      return [
        branch,
        {
          executions: executed.length,
          inputTokens: executed.reduce(
            (sum, item) => sum + (item.inputTokens ?? 0),
            0,
          ),
          outputTokens: executed.reduce(
            (sum, item) => sum + (item.outputTokens ?? 0),
            0,
          ),
          tokenUsageComplete,
          latencyMs: executed.reduce((sum, item) => sum + item.latencyMs, 0),
          costUsd: hasUnknownCost
            ? null
            : executed.reduce((sum, item) => sum + (item.costUsd ?? 0), 0),
        },
      ]
    }),
  )
}

export function aggregateSentinelMetrics(
  outcomes: SentinelCaseOutcome[],
): SentinelMetrics {
  const evaluated = outcomes.filter((outcome) => outcome.evaluated)
  const underTriageEligible = evaluated.filter((outcome) =>
    ['time_critical', 'same_day'].includes(outcome.expectedClinicalClass),
  )
  const emergencyCases = evaluated.filter(
    (outcome) => outcome.expectedClinicalClass === 'time_critical',
  )
  const routineCases = evaluated.filter(
    (outcome) => outcome.expectedClinicalClass === 'routine',
  )
  const hardNegatives = evaluated.filter((outcome) => outcome.hardNegative)
  const allReferences = evaluated.reduce(
    (sum, outcome) => sum + outcome.evidenceValidation.totalReferences,
    0,
  )
  const validReferences = evaluated.reduce(
    (sum, outcome) => sum + outcome.evidenceValidation.validReferences,
    0,
  )
  const evaluatedTimeCritical = evaluated.filter((outcome) =>
    ['time_critical', 'same_day'].includes(outcome.expectedClinicalClass),
  )
  const timeCriticalReferences = evaluatedTimeCritical.reduce(
    (sum, outcome) => sum + outcome.evidenceValidation.totalReferences,
    0,
  )
  const validTimeCriticalReferences = evaluatedTimeCritical.reduce(
    (sum, outcome) => sum + outcome.evidenceValidation.validReferences,
    0,
  )

  const syndromeGroups = new Map<string, SentinelCaseOutcome[]>()
  const subgroupGroups = new Map<string, SentinelCaseOutcome[]>()
  for (const outcome of outcomes) {
    if (outcome.syndrome) {
      syndromeGroups.set(outcome.syndrome, [
        ...(syndromeGroups.get(outcome.syndrome) ?? []),
        outcome,
      ])
    }
    for (const tag of outcome.tags) {
      subgroupGroups.set(tag, [...(subgroupGroups.get(tag) ?? []), outcome])
    }
  }

  return {
    totalCases: outcomes.length,
    evaluatedCases: evaluated.length,
    unevaluatedCases: outcomes.length - evaluated.length,
    unevaluatedOfflineCases: outcomes.filter(
      (outcome) => !outcome.evaluated && outcome.offlineRequired,
    ).length,
    exactOrAcceptable: rateMetric(
      evaluated.filter((outcome) => outcome.exactOrAcceptable).length,
      evaluated.length,
    ),
    underTriage: rateMetric(
      underTriageEligible.filter((outcome) => outcome.underTriaged).length,
      underTriageEligible.length,
    ),
    emergencyUnderTriage: rateMetric(
      emergencyCases.filter((outcome) => outcome.underTriaged).length,
      emergencyCases.length,
    ),
    overTriage: rateMetric(
      routineCases.filter((outcome) => outcome.overTriaged).length,
      routineCases.length,
    ),
    manualHold: rateMetric(
      evaluated.filter((outcome) => outcome.manualHold).length,
      evaluated.length,
    ),
    alertBurden: rateMetric(
      evaluated.filter((outcome) => outcome.alertRaised).length,
      evaluated.length,
    ),
    hardNegativeFalseAlerts: rateMetric(
      hardNegatives.filter((outcome) => outcome.alertRaised).length,
      hardNegatives.length,
    ),
    evidenceExactness: rateMetric(validReferences, allReferences),
    timeCriticalEvidenceExactness: rateMetric(
      validTimeCriticalReferences,
      timeCriticalReferences,
    ),
    bySyndrome: Object.fromEntries(
      [...syndromeGroups.entries()].map(([key, items]) => [
        key,
        sliceMetrics(items),
      ]),
    ),
    bySubgroup: Object.fromEntries(
      [...subgroupGroups.entries()].map(([key, items]) => [
        key,
        sliceMetrics(items),
      ]),
    ),
    telemetryByBranch: summarizeTelemetry(outcomes),
  }
}

export function runOfflineSentinelSuite(catalog: SentinelCatalog): {
  outcomes: SentinelCaseOutcome[]
  metrics: SentinelMetrics
} {
  const outcomes = catalog.cases.map(runOfflineSentinelCase)
  return { outcomes, metrics: aggregateSentinelMetrics(outcomes) }
}

function gateObservedValue(
  metrics: SentinelMetrics,
  metric: SentinelReleaseGateSet['gates'][number]['metric'],
): number {
  switch (metric) {
    case 'emergency_under_triage_count':
      return metrics.emergencyUnderTriage.count
    case 'invalid_time_critical_evidence_count':
      return (
        metrics.timeCriticalEvidenceExactness.denominator -
        metrics.timeCriticalEvidenceExactness.count
      )
    case 'unevaluated_offline_case_count':
      return metrics.unevaluatedOfflineCases
    case 'hard_negative_false_alert_rate':
      return metrics.hardNegativeFalseAlerts.rate ?? 0
    case 'manual_hold_rate':
      return metrics.manualHold.rate ?? 0
  }
}

export function evaluateSentinelReleaseGates(
  metrics: SentinelMetrics,
  gateSet: SentinelReleaseGateSet,
): SentinelGateResult[] {
  return gateSet.gates.map((gate) => {
    const observed = gateObservedValue(metrics, gate.metric)
    const passed =
      gate.operator === 'eq'
        ? observed === gate.threshold
        : gate.operator === 'lte'
          ? observed <= gate.threshold
          : observed >= gate.threshold
    return {
      id: gate.id,
      metric: gate.metric,
      operator: gate.operator,
      threshold: gate.threshold,
      observed,
      passed,
      description: gate.description,
    }
  })
}
