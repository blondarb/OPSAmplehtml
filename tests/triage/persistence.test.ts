import { describe, expect, it } from 'vitest'

import {
  buildCompletedTriageSafetyState,
  buildInitialTriageSafetyState,
} from '@/lib/triage/persistence'

describe('triage safety persistence', () => {
  it('creates every new row in a locked, pending safety state', () => {
    expect(buildInitialTriageSafetyState('not_applicable')).toEqual({
      care_pathway: 'undetermined',
      data_quality: 'partial',
      coverage_status: 'not_applicable',
      review_requirement: 'clinician_confirmation',
      workflow_status: 'pending_safety_screen',
      scheduling_locked: true,
    })
  })

  it('persists an emergency decision as an emergency hold', () => {
    expect(
      buildCompletedTriageSafetyState(
        {
          carePathway: 'emergency_now',
          outpatientPriority: 'urgent',
          dataQuality: 'sufficient',
          reviewRequirement: 'emergency_action',
          schedulingLocked: true,
          weightedScore: 4,
          appliedFloors: ['emergent_override'],
        },
        'complete',
      ),
    ).toEqual({
      care_pathway: 'emergency_now',
      data_quality: 'sufficient',
      coverage_status: 'complete',
      review_requirement: 'emergency_action',
      workflow_status: 'emergency_hold',
      scheduling_locked: true,
    })
  })

  it('keeps non-emergency model output in clinician review', () => {
    expect(
      buildCompletedTriageSafetyState(
        {
          carePathway: 'routine_outpatient',
          outpatientPriority: 'routine',
          dataQuality: 'insufficient',
          reviewRequirement: 'clinician_confirmation',
          schedulingLocked: true,
          weightedScore: 2,
          appliedFloors: [],
        },
        'partial',
      ).workflow_status,
    ).toBe('clinician_review')
  })
})
