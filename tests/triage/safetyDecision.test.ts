import { describe, expect, it } from 'vitest'

import { mergeEmergencyGatewayDecision } from '@/lib/triage/safetyDecision'
import type { EmergencyGatewayResult } from '@/lib/triage/emergencyGateway'
import type { TriageDecisionState } from '@/lib/triage/types'

const modelDecision: TriageDecisionState = {
  carePathway: 'routine_outpatient',
  outpatientPriority: 'routine',
  dataQuality: 'sufficient',
  reviewRequirement: 'clinician_confirmation',
  schedulingLocked: true,
  weightedScore: 2,
  appliedFloors: [],
}

function gateway(
  overrides: Partial<EmergencyGatewayResult>,
): EmergencyGatewayResult {
  return {
    status: 'completed',
    failureCode: null,
    carePathway: 'routine_outpatient',
    reviewRequirement: 'clinician_confirmation',
    schedulingLocked: true,
    signals: [],
    lexicalHits: [],
    version: 'neurology-emergency-gateway-v1',
    ...overrides,
  }
}

describe('mergeEmergencyGatewayDecision', () => {
  it('preserves ordinary model nuance when the gateway is routine', () => {
    expect(
      mergeEmergencyGatewayDecision(gateway({}), modelDecision),
    ).toEqual(modelDecision)
  })

  it('makes a deterministic emergency an irreversible emergency floor', () => {
    expect(
      mergeEmergencyGatewayDecision(
        gateway({ carePathway: 'emergency_now' }),
        modelDecision,
      ),
    ).toEqual(
      expect.objectContaining({
        carePathway: 'emergency_now',
        reviewRequirement: 'emergency_action',
        schedulingLocked: true,
      }),
    )
  })

  it('makes an uncertain emergency an irreversible same-day review floor', () => {
    expect(
      mergeEmergencyGatewayDecision(
        gateway({
          carePathway: 'same_day_clinician_review',
          reviewRequirement: 'immediate_clinician_review',
        }),
        modelDecision,
      ),
    ).toEqual(
      expect.objectContaining({
        carePathway: 'same_day_clinician_review',
        reviewRequirement: 'immediate_clinician_review',
        schedulingLocked: true,
      }),
    )
  })

  it('keeps invalid or unreliable input undetermined and immediately reviewed', () => {
    expect(
      mergeEmergencyGatewayDecision(
        gateway({
          status: 'failed',
          failureCode: 'unreliable_extraction',
          carePathway: 'undetermined',
          reviewRequirement: 'immediate_clinician_review',
        }),
        modelDecision,
      ),
    ).toEqual(
      expect.objectContaining({
        carePathway: 'undetermined',
        dataQuality: 'insufficient',
        reviewRequirement: 'immediate_clinician_review',
        schedulingLocked: true,
      }),
    )
  })

  it('allows a more urgent model emergency to supersede a same-day floor', () => {
    const result = mergeEmergencyGatewayDecision(
      gateway({ carePathway: 'same_day_clinician_review' }),
      { ...modelDecision, carePathway: 'emergency_now', reviewRequirement: 'emergency_action' },
    )

    expect(result.carePathway).toBe('emergency_now')
  })
})
