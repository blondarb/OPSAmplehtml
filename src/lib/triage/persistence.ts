import type {
  CoverageStatus,
  TriageDecisionState,
  WorkflowStatus,
} from './types'

export function buildInitialTriageSafetyState(
  coverageStatus: CoverageStatus,
) {
  return {
    care_pathway: 'undetermined' as const,
    data_quality: 'partial' as const,
    coverage_status: coverageStatus,
    review_requirement: 'clinician_confirmation' as const,
    workflow_status: 'pending_safety_screen' as const,
    scheduling_locked: true,
  }
}

export function buildCompletedTriageSafetyState(
  decision: TriageDecisionState,
  coverageStatus: CoverageStatus,
) {
  const workflowStatus: WorkflowStatus =
    decision.carePathway === 'emergency_now'
      ? 'emergency_hold'
      : 'clinician_review'

  return {
    care_pathway: decision.carePathway,
    data_quality: decision.dataQuality,
    coverage_status: coverageStatus,
    review_requirement: decision.reviewRequirement,
    workflow_status: workflowStatus,
    scheduling_locked: true,
  }
}
