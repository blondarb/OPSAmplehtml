import { describe, expect, it } from 'vitest'

import {
  canActivateOutpatientScheduling,
  canAdvanceToHistorian,
  type HistorianAuthorization,
  type SchedulingAuthorization,
} from '@/lib/triage/workflowPolicy'

const reviewedOutpatient: SchedulingAuthorization = {
  carePathway: 'routine_outpatient',
  workflowStatus: 'decision_ready',
  schedulingLocked: false,
  reviewedAt: '2026-07-10T12:00:00.000Z',
  reviewedBy: 'clinician-1',
  finalCarePathway: 'routine_outpatient',
  finalTriageTier: 'routine',
  openCriticalClarifications: 0,
  openEmergencyActions: 0,
  coverageStatus: 'complete',
  dataQuality: 'sufficient',
  reviewRequirement: 'none',
}

describe('canActivateOutpatientScheduling', () => {
  it.each(['routine_outpatient', 'expedited_outpatient'] as const)(
    'allows a reviewed, unlocked %s decision with complete coverage',
    (carePathway) => {
      expect(
        canActivateOutpatientScheduling({
          ...reviewedOutpatient,
          carePathway,
          finalCarePathway: carePathway,
          finalTriageTier:
            carePathway === 'expedited_outpatient'
              ? 'urgent'
              : 'routine',
        }),
      ).toEqual({ allowed: true })
    },
  )

  it.each([
    ['emergency_now', 'care_pathway_not_outpatient'],
    ['same_day_clinician_review', 'care_pathway_not_outpatient'],
    ['redirect', 'care_pathway_not_outpatient'],
    ['undetermined', 'care_pathway_not_outpatient'],
  ] as const)('blocks the %s pathway', (carePathway, reason) => {
    expect(
      canActivateOutpatientScheduling({ ...reviewedOutpatient, carePathway }),
    ).toEqual({ allowed: false, reason })
  })

  it.each([
    [{ ...reviewedOutpatient, workflowStatus: 'clinician_review' as const }, 'workflow_not_decision_ready'],
    [{ ...reviewedOutpatient, schedulingLocked: true }, 'scheduling_locked'],
    [{ ...reviewedOutpatient, reviewedAt: null }, 'clinician_review_incomplete'],
    [{ ...reviewedOutpatient, reviewedAt: '' }, 'clinician_review_incomplete'],
    [{ ...reviewedOutpatient, reviewedAt: 'not-a-date' }, 'clinician_review_incomplete'],
    [{ ...reviewedOutpatient, reviewedBy: null }, 'clinician_reviewer_missing'],
    [{ ...reviewedOutpatient, finalCarePathway: null }, 'final_disposition_missing'],
    [{ ...reviewedOutpatient, finalCarePathway: 'emergency_now' as const }, 'final_disposition_not_outpatient'],
    [{ ...reviewedOutpatient, finalCarePathway: 'expedited_outpatient' as const }, 'final_disposition_mismatch'],
    [{ ...reviewedOutpatient, finalTriageTier: null }, 'final_triage_tier_missing'],
    [{ ...reviewedOutpatient, finalTriageTier: 'emergent' }, 'final_triage_tier_not_outpatient'],
    [{ ...reviewedOutpatient, finalTriageTier: 'insufficient_data' }, 'final_triage_tier_not_outpatient'],
    [{ ...reviewedOutpatient, finalTriageTier: 'semi_urgent' }, 'final_triage_tier_mismatch'],
    [{ ...reviewedOutpatient, openCriticalClarifications: 1 }, 'critical_clarification_open'],
    [{ ...reviewedOutpatient, openCriticalClarifications: -1 }, 'invalid_critical_clarification_count'],
    [{ ...reviewedOutpatient, openEmergencyActions: 1 }, 'emergency_action_open'],
    [{ ...reviewedOutpatient, openEmergencyActions: -1 }, 'invalid_emergency_action_count'],
    [{ ...reviewedOutpatient, coverageStatus: 'partial' as const }, 'coverage_incomplete'],
    [{ ...reviewedOutpatient, coverageStatus: 'failed' as const }, 'coverage_incomplete'],
    [{ ...reviewedOutpatient, coverageStatus: 'not_applicable' as const }, 'coverage_incomplete'],
    [{ ...reviewedOutpatient, coverageStatus: 'legacy_unknown' as const }, 'coverage_incomplete'],
    [{ ...reviewedOutpatient, dataQuality: 'partial' as const }, 'data_quality_not_sufficient'],
    [{ ...reviewedOutpatient, dataQuality: 'insufficient' as const }, 'data_quality_not_sufficient'],
    [{ ...reviewedOutpatient, dataQuality: 'conflicting' as const }, 'data_quality_not_sufficient'],
    [{ ...reviewedOutpatient, reviewRequirement: 'clinician_confirmation' as const }, 'review_not_complete'],
    [{ ...reviewedOutpatient, reviewRequirement: 'immediate_clinician_review' as const }, 'review_not_complete'],
  ] as const)('fails closed for an unsafe state: %#', (state, reason) => {
    expect(canActivateOutpatientScheduling(state)).toEqual({
      allowed: false,
      reason,
    })
  })
})

const approvedPatientClarification: HistorianAuthorization = {
  carePathway: 'routine_outpatient',
  workflowStatus: 'patient_clarification',
  schedulingLocked: true,
  reviewedAt: '2026-07-10T12:00:00.000Z',
  reviewedBy: 'clinician-1',
  finalCarePathway: null,
  finalTriageTier: null,
  openCriticalClarifications: 0,
  openEmergencyActions: 0,
  coverageStatus: 'complete',
  patientClarificationApproved: true,
  clarificationMode: 'referral_clarification',
  approvedQuestionIds: ['symptom_onset', 'symptom_course'],
  dataQuality: 'partial',
  reviewRequirement: 'clinician_confirmation',
}

describe('canAdvanceToHistorian', () => {
  it.each(['routine_outpatient', 'expedited_outpatient'] as const)(
    'allows only an approved, purpose-limited clarification for a stable %s case',
    (carePathway) => {
      expect(
        canAdvanceToHistorian({ ...approvedPatientClarification, carePathway }),
      ).toEqual({ allowed: true })
    },
  )

  it('does not require the scheduling lock to be released for clarification', () => {
    expect(canAdvanceToHistorian(approvedPatientClarification)).toEqual({
      allowed: true,
    })
    expect(approvedPatientClarification.schedulingLocked).toBe(true)
  })

  it.each([
    ['emergency_now', 'care_pathway_not_stable_outpatient'],
    ['same_day_clinician_review', 'care_pathway_not_stable_outpatient'],
    ['redirect', 'care_pathway_not_stable_outpatient'],
    ['undetermined', 'care_pathway_not_stable_outpatient'],
  ] as const)('never advances a %s case to Historian', (carePathway, reason) => {
    expect(
      canAdvanceToHistorian({ ...approvedPatientClarification, carePathway }),
    ).toEqual({ allowed: false, reason })
  })

  it.each([
    [{ ...approvedPatientClarification, workflowStatus: 'clinician_review' as const }, 'workflow_not_patient_clarification'],
    [{ ...approvedPatientClarification, patientClarificationApproved: false }, 'patient_clarification_not_approved'],
    [{ ...approvedPatientClarification, schedulingLocked: false }, 'historian_requires_scheduling_lock'],
    [{ ...approvedPatientClarification, reviewedAt: null }, 'clinician_review_incomplete'],
    [{ ...approvedPatientClarification, reviewedBy: null }, 'clinician_reviewer_missing'],
    [{ ...approvedPatientClarification, openCriticalClarifications: 1 }, 'critical_clarification_open'],
    [{ ...approvedPatientClarification, openEmergencyActions: 1 }, 'emergency_action_open'],
    [{ ...approvedPatientClarification, coverageStatus: 'partial' as const }, 'coverage_incomplete'],
    [{ ...approvedPatientClarification, dataQuality: 'insufficient' as const }, 'data_quality_not_usable_for_clarification'],
    [{ ...approvedPatientClarification, dataQuality: 'conflicting' as const }, 'data_quality_not_usable_for_clarification'],
    [{ ...approvedPatientClarification, reviewRequirement: 'immediate_clinician_review' as const }, 'time_critical_review_unresolved'],
    [{ ...approvedPatientClarification, reviewRequirement: 'emergency_action' as const }, 'time_critical_review_unresolved'],
    [{ ...approvedPatientClarification, clarificationMode: 'general_historian' as const }, 'clarification_mode_not_permitted'],
    [{ ...approvedPatientClarification, approvedQuestionIds: [] }, 'approved_question_set_missing'],
    [{ ...approvedPatientClarification, approvedQuestionIds: ['valid', ''] }, 'approved_question_set_missing'],
  ] as const)('fails closed before Historian for an unsafe state: %#', (state, reason) => {
    expect(canAdvanceToHistorian(state)).toEqual({ allowed: false, reason })
  })
})
