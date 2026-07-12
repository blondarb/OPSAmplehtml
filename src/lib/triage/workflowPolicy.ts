import type {
  CarePathway,
  CoverageStatus,
  DataQuality,
  ReviewRequirement,
  WorkflowStatus,
} from './types'

export interface SchedulingAuthorization {
  carePathway: CarePathway
  workflowStatus: WorkflowStatus
  schedulingLocked: boolean
  reviewedAt: string | null
  reviewedBy: string | null
  finalCarePathway: CarePathway | null
  finalTriageTier: string | null
  openCriticalClarifications: number
  openEmergencyActions: number
  coverageStatus: CoverageStatus
  dataQuality: DataQuality
  reviewRequirement: ReviewRequirement
}

export interface HistorianAuthorization extends SchedulingAuthorization {
  patientClarificationApproved: boolean
  clarificationMode: 'referral_clarification' | 'general_historian'
  approvedQuestionIds: readonly string[]
}

export type WorkflowPolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: string }

const OUTPATIENT_PATHWAYS = new Set<CarePathway>([
  'expedited_outpatient',
  'routine_outpatient',
])

const OUTPATIENT_TIERS_BY_PATHWAY: Record<
  'expedited_outpatient' | 'routine_outpatient',
  ReadonlySet<string>
> = {
  expedited_outpatient: new Set(['urgent', 'semi_urgent']),
  routine_outpatient: new Set(['routine_priority', 'routine', 'non_urgent']),
}

const NON_OUTPATIENT_FINAL_TIERS = new Set([
  'emergent',
  'insufficient_data',
])

function hasCompletedClinicianReview(reviewedAt: string | null): boolean {
  return (
    typeof reviewedAt === 'string' &&
    reviewedAt.trim().length > 0 &&
    !Number.isNaN(Date.parse(reviewedAt))
  )
}

function criticalClarificationDenial(
  count: number,
): WorkflowPolicyDecision | null {
  if (!Number.isSafeInteger(count) || count < 0) {
    return { allowed: false, reason: 'invalid_critical_clarification_count' }
  }
  if (count > 0) {
    return { allowed: false, reason: 'critical_clarification_open' }
  }
  return null
}

function emergencyActionDenial(count: number): WorkflowPolicyDecision | null {
  if (!Number.isSafeInteger(count) || count < 0) {
    return { allowed: false, reason: 'invalid_emergency_action_count' }
  }
  if (count > 0) {
    return { allowed: false, reason: 'emergency_action_open' }
  }
  return null
}

export function canActivateOutpatientScheduling(
  state: SchedulingAuthorization,
): WorkflowPolicyDecision {
  if (!OUTPATIENT_PATHWAYS.has(state.carePathway)) {
    return { allowed: false, reason: 'care_pathway_not_outpatient' }
  }
  if (state.workflowStatus !== 'decision_ready') {
    return { allowed: false, reason: 'workflow_not_decision_ready' }
  }
  if (state.schedulingLocked) {
    return { allowed: false, reason: 'scheduling_locked' }
  }
  if (state.coverageStatus !== 'complete') {
    return { allowed: false, reason: 'coverage_incomplete' }
  }
  if (state.dataQuality !== 'sufficient') {
    return { allowed: false, reason: 'data_quality_not_sufficient' }
  }
  if (state.reviewRequirement !== 'none') {
    return { allowed: false, reason: 'review_not_complete' }
  }

  const clarificationDenial = criticalClarificationDenial(
    state.openCriticalClarifications,
  )
  if (clarificationDenial) return clarificationDenial

  const actionDenial = emergencyActionDenial(state.openEmergencyActions)
  if (actionDenial) return actionDenial

  if (!hasCompletedClinicianReview(state.reviewedAt)) {
    return { allowed: false, reason: 'clinician_review_incomplete' }
  }
  if (typeof state.reviewedBy !== 'string' || !state.reviewedBy.trim()) {
    return { allowed: false, reason: 'clinician_reviewer_missing' }
  }
  if (!state.finalCarePathway) {
    return { allowed: false, reason: 'final_disposition_missing' }
  }
  if (!OUTPATIENT_PATHWAYS.has(state.finalCarePathway)) {
    return { allowed: false, reason: 'final_disposition_not_outpatient' }
  }
  if (state.finalCarePathway !== state.carePathway) {
    return { allowed: false, reason: 'final_disposition_mismatch' }
  }
  if (
    typeof state.finalTriageTier !== 'string' ||
    !state.finalTriageTier.trim()
  ) {
    return { allowed: false, reason: 'final_triage_tier_missing' }
  }
  if (NON_OUTPATIENT_FINAL_TIERS.has(state.finalTriageTier)) {
    return { allowed: false, reason: 'final_triage_tier_not_outpatient' }
  }
  if (
    !OUTPATIENT_TIERS_BY_PATHWAY[
      state.finalCarePathway as 'expedited_outpatient' | 'routine_outpatient'
    ].has(state.finalTriageTier)
  ) {
    return { allowed: false, reason: 'final_triage_tier_mismatch' }
  }

  return { allowed: true }
}

export function canAdvanceToHistorian(
  state: HistorianAuthorization,
): WorkflowPolicyDecision {
  if (!OUTPATIENT_PATHWAYS.has(state.carePathway)) {
    return { allowed: false, reason: 'care_pathway_not_stable_outpatient' }
  }
  if (state.workflowStatus !== 'patient_clarification') {
    return { allowed: false, reason: 'workflow_not_patient_clarification' }
  }
  if (!state.patientClarificationApproved) {
    return { allowed: false, reason: 'patient_clarification_not_approved' }
  }
  if (!state.schedulingLocked) {
    return { allowed: false, reason: 'historian_requires_scheduling_lock' }
  }
  if (state.coverageStatus !== 'complete') {
    return { allowed: false, reason: 'coverage_incomplete' }
  }
  if (state.dataQuality === 'insufficient' || state.dataQuality === 'conflicting') {
    return {
      allowed: false,
      reason: 'data_quality_not_usable_for_clarification',
    }
  }
  if (
    state.reviewRequirement === 'emergency_action' ||
    state.reviewRequirement === 'immediate_clinician_review'
  ) {
    return { allowed: false, reason: 'time_critical_review_unresolved' }
  }

  const clarificationDenial = criticalClarificationDenial(
    state.openCriticalClarifications,
  )
  if (clarificationDenial) return clarificationDenial

  const actionDenial = emergencyActionDenial(state.openEmergencyActions)
  if (actionDenial) return actionDenial

  if (!hasCompletedClinicianReview(state.reviewedAt)) {
    return { allowed: false, reason: 'clinician_review_incomplete' }
  }
  if (typeof state.reviewedBy !== 'string' || !state.reviewedBy.trim()) {
    return { allowed: false, reason: 'clinician_reviewer_missing' }
  }
  if (state.clarificationMode !== 'referral_clarification') {
    return { allowed: false, reason: 'clarification_mode_not_permitted' }
  }
  if (
    state.approvedQuestionIds.length === 0 ||
    state.approvedQuestionIds.some(
      (questionId) =>
        typeof questionId !== 'string' || questionId.trim().length === 0,
    ) ||
    new Set(state.approvedQuestionIds).size !== state.approvedQuestionIds.length
  ) {
    return { allowed: false, reason: 'approved_question_set_missing' }
  }

  return { allowed: true }
}
