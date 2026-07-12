import { describe, expect, it } from 'vitest'
import type { EmergencyGatewayResult } from '@/lib/triage/emergencyGateway'
import type { TriageDecisionState } from '@/lib/triage/types'
import {
  applyAdjudicatorDecision,
  fuseTriageBranches,
} from '@/lib/triage/ensemblePolicy'

function gateway(
  carePathway: EmergencyGatewayResult['carePathway'] = 'routine_outpatient',
): EmergencyGatewayResult {
  return {
    status: 'completed',
    failureCode: null,
    carePathway,
    reviewRequirement:
      carePathway === 'emergency_now'
        ? 'emergency_action'
        : carePathway === 'same_day_clinician_review'
          ? 'immediate_clinician_review'
          : 'clinician_confirmation',
    schedulingLocked: true,
    signals: [],
    lexicalHits: [],
    version: 'neurology-emergency-gateway-v1',
  }
}

const scorerDecision: TriageDecisionState = {
  carePathway: 'expedited_outpatient',
  outpatientPriority: 'urgent',
  dataQuality: 'sufficient',
  reviewRequirement: 'clinician_confirmation',
  schedulingLocked: true,
  weightedScore: 4,
  appliedFloors: [],
}

const noSignalSafety = {
  carePathway: 'no_time_critical_signal' as const,
  dataQuality: 'sufficient' as const,
  criticalUnknowns: [],
  signals: [],
}

describe('fuseTriageBranches', () => {
  it('never lets two model branches lower a deterministic emergency', () => {
    const result = fuseTriageBranches({
      gateway: gateway('emergency_now'),
      safetyBranch: { status: 'complete', result: noSignalSafety },
      scoringBranch: { status: 'complete', result: scorerDecision },
    })

    expect(result).toMatchObject({
      carePathway: 'emergency_now',
      schedulingLocked: true,
      adjudicationRequired: true,
    })
  })

  it('raises to a safety-model emergency when the lexical gateway is quiet', () => {
    const result = fuseTriageBranches({
      gateway: gateway(),
      safetyBranch: {
        status: 'complete',
        result: {
          ...noSignalSafety,
          carePathway: 'emergency_now',
          signals: [{ code: 'synthetic_signal' } as never],
        },
      },
      scoringBranch: { status: 'complete', result: scorerDecision },
    })

    expect(result.carePathway).toBe('emergency_now')
    expect(result.reviewRequirement).toBe('emergency_action')
    expect(result.adjudicationRequired).toBe(true)
  })

  it('fails closed when the safety branch fails', () => {
    const result = fuseTriageBranches({
      gateway: gateway(),
      safetyBranch: { status: 'failed', reason: 'timeout' },
      scoringBranch: { status: 'complete', result: scorerDecision },
    })

    expect(result).toMatchObject({
      carePathway: 'undetermined',
      dataQuality: 'insufficient',
      reviewRequirement: 'immediate_clinician_review',
      outpatientPriority: 'urgent',
      adjudicationRequired: true,
    })
  })

  it('fails closed when scoring fails even if the safety branch is quiet', () => {
    const result = fuseTriageBranches({
      gateway: gateway(),
      safetyBranch: { status: 'complete', result: noSignalSafety },
      scoringBranch: { status: 'invalid', reason: 'schema_invalid' },
    })

    expect(result).toMatchObject({
      carePathway: 'undetermined',
      outpatientPriority: null,
      adjudicationRequired: true,
    })
  })

  it('never erases a literal positive scoring emergency when the remaining scorer payload is invalid', () => {
    const result = fuseTriageBranches({
      gateway: gateway(),
      safetyBranch: { status: 'complete', result: noSignalSafety },
      scoringBranch: { status: 'invalid', reason: 'schema_invalid' },
      scoringEmergencyOverride: true,
    })

    expect(result).toMatchObject({
      carePathway: 'emergency_now',
      dataQuality: 'insufficient',
      reviewRequirement: 'emergency_action',
      schedulingLocked: true,
      adjudicationRequired: true,
    })
    expect(result.reasons).toContain('scoring_emergency_override')
    expect(result.reasons).toContain('scoring_branch_invalid')
  })

  it('retains the scorer outpatient decision when both safety systems clear', () => {
    const result = fuseTriageBranches({
      gateway: gateway(),
      safetyBranch: { status: 'complete', result: noSignalSafety },
      scoringBranch: { status: 'complete', result: scorerDecision },
    })

    expect(result).toMatchObject({
      carePathway: 'expedited_outpatient',
      outpatientPriority: 'urgent',
      adjudicationRequired: false,
    })
  })

  it('does not allow an adjudicator to lower an established safety floor', () => {
    const fused = fuseTriageBranches({
      gateway: gateway('emergency_now'),
      safetyBranch: { status: 'complete', result: noSignalSafety },
      scoringBranch: { status: 'complete', result: scorerDecision },
    })

    expect(
      applyAdjudicatorDecision(fused, {
        carePathway: 'routine_outpatient',
        rationale: 'Synthetic attempted downgrade',
      }).carePathway,
    ).toBe('emergency_now')
  })
})
