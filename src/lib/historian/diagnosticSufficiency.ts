import { createHash } from 'node:crypto'

import type {
  ComprehensiveHistoryDomain,
  HistorianInterviewPromptVersion,
  HistorianTerminationReason,
  HistorianTranscriptEntry,
} from '@/lib/historianTypes'
import type { MedicationReconciliationState } from './medicationReconciliation'
import {
  medicationReconciliationClosed,
  medicationReconciliationHasUncertainty,
  medicationReconciliationUnresolvedCount,
} from './medicationReconciliation'
import {
  LIVE_INTERVIEW_REVIEW_V2_VERSION,
  LIVE_REVIEW_DEPTH_DIMENSIONS,
  type LiveInterviewReviewArtifact,
  type LiveInterviewReviewArtifactV2,
  type LiveReviewDepthDimension,
} from './liveReviewContract'

export const DIAGNOSTIC_SUFFICIENCY_VERSION = 1 as const

export type DiagnosticSufficiencyOutcome =
  | 'sufficient'
  | 'sufficient_with_uncertainty'
  | 'insufficient_partial'
  | 'insufficient_depth'
  | 'gate_unavailable'

export interface DiagnosticSufficiencyV1 {
  version: typeof DIAGNOSTIC_SUFFICIENCY_VERSION
  outcome: DiagnosticSufficiencyOutcome
  ddx_allowed: boolean
  termination_reason: HistorianTerminationReason
  reviewed_through_seq: number | null
  patient_turn_count: number
  dimensions: Array<{
    dimension: LiveReviewDepthDimension
    status: 'adequate' | 'uncertain' | 'missing' | 'not_assessed'
    patient_seqs: number[]
  }>
  blocking_gaps: Array<{
    domain: ComprehensiveHistoryDomain
    reason: string
    question_intent: string
  }>
  uncertainty_domains: ComprehensiveHistoryDomain[]
  medication: {
    status: 'closed' | 'closed_with_uncertainty' | 'incomplete'
    unresolved_count: number
  }
  input_digest: string
  provenance: {
    review_version: 2 | null
    model_id: string | null
    prompt_version: string | null
    generated_at: string
  }
}

export interface DiagnosticSufficiencyInput {
  transcript: HistorianTranscriptEntry[]
  promptVersion: HistorianInterviewPromptVersion
  completionStatus: 'complete' | 'ended_early'
  terminationReason: HistorianTerminationReason
  reviewArtifact: LiveInterviewReviewArtifact | null
  medicationState: MedicationReconciliationState | null
  generatedAt?: Date
}

export interface WithheldFinalDifferentialV1 {
  version: 1
  status: 'withheld_partial' | 'withheld_insufficient' | 'withheld_gate_error'
  diagnostic_sufficiency_outcome: DiagnosticSufficiencyOutcome
  input_digest: string
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map((key) => (
    `${JSON.stringify(key)}:${stableJson(object[key])}`
  )).join(',')}}`
}

function digest(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex')
}

function patientTurnCount(transcript: readonly HistorianTranscriptEntry[]): number {
  return transcript.filter((entry) => entry.role === 'user').length
}

function medicationStatus(state: MedicationReconciliationState | null): DiagnosticSufficiencyV1['medication'] {
  if (!state || !medicationReconciliationClosed(state)) {
    return { status: 'incomplete', unresolved_count: state ? medicationReconciliationUnresolvedCount(state) : 0 }
  }
  const unresolvedCount = medicationReconciliationUnresolvedCount(state)
  return {
    status: medicationReconciliationHasUncertainty(state)
      ? 'closed_with_uncertainty'
      : 'closed',
    unresolved_count: unresolvedCount,
  }
}

export function diagnosticSufficiencyInputDigest(
  input: Omit<DiagnosticSufficiencyInput, 'generatedAt'>,
): string {
  return digest({
    version: DIAGNOSTIC_SUFFICIENCY_VERSION,
    transcript: input.transcript.map(({ seq, role, text, timestamp }) => ({ seq, role, text, timestamp })),
    promptVersion: input.promptVersion,
    completionStatus: input.completionStatus,
    terminationReason: input.terminationReason,
    review: input.reviewArtifact
      ? { review: input.reviewArtifact.review, provenance: input.reviewArtifact.provenance }
      : null,
    medicationState: input.medicationState,
  })
}

/**
 * Server-owned completion authority. Browser-supplied coverage may be carried
 * through the signed review, but cannot set outcome or ddx_allowed.
 */
export function deriveDiagnosticSufficiency(
  input: DiagnosticSufficiencyInput,
): DiagnosticSufficiencyV1 {
  const reviewV2: LiveInterviewReviewArtifactV2 | null =
    input.reviewArtifact?.review.version === LIVE_INTERVIEW_REVIEW_V2_VERSION
    ? input.reviewArtifact as LiveInterviewReviewArtifactV2
    : null
  const ledgerMedication = medicationStatus(input.medicationState)
  // When the independent review contract is unavailable, the deterministic
  // ledger may still preserve already verified items for display, but it
  // cannot claim that the final medication inventory was independently
  // reconciled against the transcript.
  const medication: DiagnosticSufficiencyV1['medication'] =
    reviewV2 && reviewV2.review.integrity !== 'valid'
      ? {
          status: 'incomplete',
          unresolved_count: Math.max(1, ledgerMedication.unresolved_count),
        }
      : ledgerMedication
  const dimensions: DiagnosticSufficiencyV1['dimensions'] = reviewV2
    ? reviewV2.review.diagnosticDepth.dimensions.map((item) => ({
        dimension: item.dimension,
        status: item.status,
        patient_seqs: [...item.patientSeqs],
      }))
    : LIVE_REVIEW_DEPTH_DIMENSIONS.map((dimension) => ({
        dimension,
        status: 'not_assessed' as const,
        patient_seqs: [],
      }))
  const blockingGaps = reviewV2
    ? reviewV2.review.criticalGaps.map((gap) => ({
        domain: gap.domain,
        reason: gap.reason,
        question_intent: gap.questionIntent,
      }))
    : []
  const uncertaintyDomains = reviewV2
    ? reviewV2.review.domains
      .filter((domain) => domain.status === 'uncertain')
      .map((domain) => domain.domain)
    : []

  const partial = input.completionStatus === 'ended_early' ||
    !['coverage_complete', 'complete_with_uncertainty'].includes(input.terminationReason)
  const gateAvailable = input.promptVersion === 'comprehensive-v4' &&
    !!reviewV2 &&
    reviewV2.review.integrity === 'valid'
  const depthSufficient = !!reviewV2?.review.readyToClose &&
    reviewV2.review.diagnosticDepth.depthSufficient &&
    dimensions.every((item) => item.status !== 'missing' && item.status !== 'not_assessed') &&
    blockingGaps.length === 0 &&
    medication.status !== 'incomplete'

  let outcome: DiagnosticSufficiencyOutcome
  if (partial) outcome = 'insufficient_partial'
  else if (!gateAvailable) outcome = 'gate_unavailable'
  else if (!depthSufficient) outcome = 'insufficient_depth'
  else if (
    input.terminationReason === 'complete_with_uncertainty' ||
    medication.status === 'closed_with_uncertainty' ||
    uncertaintyDomains.length > 0 ||
    dimensions.some((item) => item.status === 'uncertain') ||
    (reviewV2?.review.contradictions.length ?? 0) > 0
  ) outcome = 'sufficient_with_uncertainty'
  else outcome = 'sufficient'

  const ddxAllowed = outcome === 'sufficient' || outcome === 'sufficient_with_uncertainty'
  return {
    version: DIAGNOSTIC_SUFFICIENCY_VERSION,
    outcome,
    ddx_allowed: ddxAllowed,
    termination_reason: input.terminationReason,
    reviewed_through_seq: reviewV2?.review.reviewedThroughSeq ?? null,
    patient_turn_count: patientTurnCount(input.transcript),
    dimensions,
    blocking_gaps: blockingGaps,
    uncertainty_domains: uncertaintyDomains,
    medication,
    input_digest: diagnosticSufficiencyInputDigest(input),
    provenance: {
      review_version: reviewV2 ? LIVE_INTERVIEW_REVIEW_V2_VERSION : null,
      model_id: reviewV2?.provenance.modelId ?? null,
      prompt_version: reviewV2?.provenance.promptVersion ?? null,
      generated_at: (input.generatedAt ?? new Date()).toISOString(),
    },
  }
}

export function diagnosticSufficiencyAllowsDdx(
  value: DiagnosticSufficiencyV1 | null | undefined,
): boolean {
  return !!value?.ddx_allowed &&
    (value.outcome === 'sufficient' || value.outcome === 'sufficient_with_uncertainty')
}

export function buildWithheldFinalDifferential(
  sufficiency: DiagnosticSufficiencyV1,
): WithheldFinalDifferentialV1 {
  return {
    version: 1,
    status: sufficiency.outcome === 'insufficient_partial'
      ? 'withheld_partial'
      : sufficiency.outcome === 'gate_unavailable'
        ? 'withheld_gate_error'
        : 'withheld_insufficient',
    diagnostic_sufficiency_outcome: sufficiency.outcome,
    input_digest: sufficiency.input_digest,
  }
}
