import type {
  EmergencySyndrome,
  GatewaySignal,
} from '../emergencyGateway'
import type { SafetyModelSignal } from '../modelSafetyExtraction'
import type {
  LongPacketPlannerOptions,
  LongPacketSourceDocument,
} from '../longPacketPlanner'
import type { CarePathway } from '../types'

export type SentinelExecutionMode =
  | 'offline_deterministic'
  | 'live_ensemble'

export type SentinelClinicalClass =
  | 'time_critical'
  | 'same_day'
  | 'routine'
  | 'manual_hold'

export interface SentinelNoteInput {
  kind: 'note'
  text: string
  sourceStyle: 'short_rural' | 'standard'
}

export interface SentinelPacketInput {
  kind: 'packet'
  packetStyle: 'mayo_like' | 'tertiary_long' | 'standard'
  documents: LongPacketSourceDocument[]
  chunkOptions?: LongPacketPlannerOptions
}

export interface SentinelMissingInput {
  kind: 'missing'
  reason: string
}

export type SentinelInput =
  | SentinelNoteInput
  | SentinelPacketInput
  | SentinelMissingInput

export interface SentinelExpectation {
  clinicalClass: SentinelClinicalClass
  pathway: CarePathway
  acceptablePathways: CarePathway[]
  requiredSyndromes: EmergencySyndrome[]
  forbiddenSyndromes?: EmergencySyndrome[]
}

export interface SentinelCase {
  id: string
  title: string
  synthetic: true
  syndrome: EmergencySyndrome | null
  hardNegative: boolean
  tags: string[]
  executionModes: SentinelExecutionMode[]
  input: SentinelInput
  expected: SentinelExpectation
}

export interface SentinelCatalog {
  schemaVersion: '1.0'
  catalogId: string
  synthetic: true
  description: string
  cases: SentinelCase[]
}

export interface SentinelBranchTelemetry {
  branch:
    | 'deterministic_gateway'
    | 'safety_extractor'
    | 'outpatient_scorer'
    | 'adjudicator'
  executed: boolean
  modelId: string | null
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
  costUsd: number | null
  status: 'complete' | 'failed' | 'skipped'
  reason: string | null
}

export interface SentinelEvidenceValidation {
  totalReferences: number
  validReferences: number
  invalidReferences: number
  invalidReasons: string[]
}

export interface SentinelCaseOutcome {
  caseId: string
  title: string
  syndrome: EmergencySyndrome | null
  tags: string[]
  hardNegative: boolean
  expectedClinicalClass: SentinelClinicalClass
  offlineRequired: boolean
  evaluated: boolean
  unevaluatedReason: string | null
  expectedPathway: CarePathway
  acceptablePathways: CarePathway[]
  actualPathway: CarePathway | null
  exactOrAcceptable: boolean
  underTriaged: boolean
  overTriaged: boolean
  manualHold: boolean
  alertRaised: boolean
  signals: Array<GatewaySignal | SafetyModelSignal>
  evidenceValidation: SentinelEvidenceValidation
  branchTelemetry: SentinelBranchTelemetry[]
}

export interface SentinelRateMetric {
  count: number
  denominator: number
  rate: number | null
}

export interface SentinelSliceMetrics {
  evaluatedCases: number
  exactOrAcceptable: SentinelRateMetric
  underTriage: SentinelRateMetric
  overTriage: SentinelRateMetric
  manualHold: SentinelRateMetric
  alerts: SentinelRateMetric
}

export interface SentinelTelemetrySummary {
  executions: number
  inputTokens: number
  outputTokens: number
  tokenUsageComplete: boolean
  latencyMs: number
  costUsd: number | null
}

export interface SentinelMetrics {
  totalCases: number
  evaluatedCases: number
  unevaluatedCases: number
  unevaluatedOfflineCases: number
  exactOrAcceptable: SentinelRateMetric
  underTriage: SentinelRateMetric
  emergencyUnderTriage: SentinelRateMetric
  overTriage: SentinelRateMetric
  manualHold: SentinelRateMetric
  alertBurden: SentinelRateMetric
  hardNegativeFalseAlerts: SentinelRateMetric
  evidenceExactness: SentinelRateMetric
  timeCriticalEvidenceExactness: SentinelRateMetric
  bySyndrome: Record<string, SentinelSliceMetrics>
  bySubgroup: Record<string, SentinelSliceMetrics>
  telemetryByBranch: Record<string, SentinelTelemetrySummary>
}

export type SentinelGateMetric =
  | 'emergency_under_triage_count'
  | 'invalid_time_critical_evidence_count'
  | 'unevaluated_offline_case_count'
  | 'hard_negative_false_alert_rate'
  | 'manual_hold_rate'

export interface SentinelReleaseGate {
  id: string
  scope: 'synthetic_software_release_only'
  metric: SentinelGateMetric
  operator: 'lte' | 'gte' | 'eq'
  threshold: number
  description: string
}

export interface SentinelReleaseGateSet {
  schemaVersion: '1.0'
  gateSetId: string
  scope: 'synthetic_software_release_only'
  clinicalValidationClaim: false
  gates: SentinelReleaseGate[]
}

export interface SentinelGateResult {
  id: string
  metric: SentinelGateMetric
  operator: SentinelReleaseGate['operator']
  threshold: number
  observed: number
  passed: boolean
  description: string
}

export interface SentinelEvaluationReport {
  schemaVersion: '1.0'
  catalogId: string
  gateSetId: string
  mode: SentinelExecutionMode
  synthetic: true
  clinicalValidationClaim: false
  generatedAt: string
  evaluationScope: 'full_catalog' | 'subset'
  releaseGateEligible: boolean
  outcomes: SentinelCaseOutcome[]
  metrics: SentinelMetrics
  gates: SentinelGateResult[]
  releaseGatePassed: boolean
}
