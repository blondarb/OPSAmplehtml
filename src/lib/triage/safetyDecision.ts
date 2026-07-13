import type { EmergencyGatewayResult } from './emergencyGateway'
import type { TriageDecisionState } from './types'

export function mergeEmergencyGatewayDecision(
  gateway: EmergencyGatewayResult,
  modelDecision: TriageDecisionState,
): TriageDecisionState {
  if (modelDecision.carePathway === 'emergency_now') {
    return modelDecision
  }

  if (gateway.status === 'failed' || gateway.carePathway === 'undetermined') {
    return {
      ...modelDecision,
      carePathway: 'undetermined',
      dataQuality: 'insufficient',
      reviewRequirement: 'immediate_clinician_review',
      schedulingLocked: true,
      appliedFloors: [
        ...modelDecision.appliedFloors,
        `emergency_gateway_${gateway.failureCode ?? 'undetermined'}`,
      ],
    }
  }

  if (gateway.carePathway === 'emergency_now') {
    return {
      ...modelDecision,
      carePathway: 'emergency_now',
      reviewRequirement: 'emergency_action',
      schedulingLocked: true,
      appliedFloors: [
        ...modelDecision.appliedFloors,
        'deterministic_emergency_gateway',
      ],
    }
  }

  if (gateway.carePathway === 'same_day_clinician_review') {
    return {
      ...modelDecision,
      carePathway: 'same_day_clinician_review',
      reviewRequirement: 'immediate_clinician_review',
      schedulingLocked: true,
      appliedFloors: [
        ...modelDecision.appliedFloors,
        'deterministic_same_day_gateway',
      ],
    }
  }

  return modelDecision
}
