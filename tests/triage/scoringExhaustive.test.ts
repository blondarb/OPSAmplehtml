import { describe, expect, it } from 'vitest'

import {
  calculateTriageDecision,
  calculateTriageTier,
} from '@/lib/triage/scoring'
import type { AITriageResponse, DimensionScores } from '@/lib/triage/types'

const OUTPATIENT_RANK = {
  urgent: 0,
  semi_urgent: 1,
  routine_priority: 2,
  routine: 3,
  non_urgent: 4,
} as const

function scores(
  symptomAcuity: number,
  diagnosticConcern: number,
  rateOfProgression: number,
  functionalImpairment: number,
  redFlagPresence: number,
): DimensionScores {
  return {
    symptom_acuity: { score: symptomAcuity, rationale: 'synthetic' },
    diagnostic_concern: { score: diagnosticConcern, rationale: 'synthetic' },
    rate_of_progression: { score: rateOfProgression, rationale: 'synthetic' },
    functional_impairment: {
      score: functionalImpairment,
      rationale: 'synthetic',
    },
    red_flag_presence: { score: redFlagPresence, rationale: 'synthetic' },
  }
}

function response(input: {
  dimensionScores: DimensionScores
  emergentOverride: boolean
  insufficientData: boolean
  redFlagOverride: boolean
}): AITriageResponse {
  return {
    emergent_override: input.emergentOverride,
    emergent_reason: input.emergentOverride ? 'Synthetic emergency' : null,
    insufficient_data: input.insufficientData,
    missing_information: input.insufficientData ? ['synthetic gap'] : null,
    confidence: 'high',
    red_flag_override: input.redFlagOverride,
    dimension_scores: input.dimensionScores,
    clinical_reasons: ['Synthetic exhaustive vector'],
    red_flags: [],
    suggested_workup: [],
    failed_therapies: [],
    subspecialty_recommendation: 'General Neurology',
    subspecialty_rationale: 'Synthetic exhaustive vector',
    redirect_to_non_neuro: false,
    redirect_specialty: null,
    redirect_rationale: null,
    safety_anticoagulation: null,
    safety_symptom_onset_time: null,
    safety_allergies: null,
    safety_implanted_devices: null,
    safety_pregnancy_status: null,
    safety_recent_procedures: null,
    safety_renal_function: null,
  }
}

describe('exhaustive triage scoring invariants', () => {
  it('checks every 1-5 score vector and boolean combination without allowing a safety-floor downgrade', () => {
    let checked = 0

    for (let acuity = 1; acuity <= 5; acuity += 1) {
      for (let concern = 1; concern <= 5; concern += 1) {
        for (let progression = 1; progression <= 5; progression += 1) {
          for (let impairment = 1; impairment <= 5; impairment += 1) {
            for (let redFlag = 1; redFlag <= 5; redFlag += 1) {
              for (const emergentOverride of [false, true]) {
                for (const insufficientData of [false, true]) {
                  for (const redFlagOverride of [false, true]) {
                    const input = response({
                      dimensionScores: scores(
                        acuity,
                        concern,
                        progression,
                        impairment,
                        redFlag,
                      ),
                      emergentOverride,
                      insufficientData,
                      redFlagOverride,
                    })
                    const decision = calculateTriageDecision(input)
                    const tier = calculateTriageTier(input).tier
                    checked += 1

                    expect(decision.schedulingLocked).toBe(true)
                    expect(decision.dataQuality).toBe(
                      insufficientData ? 'insufficient' : 'sufficient',
                    )

                    if (emergentOverride) {
                      expect(decision.carePathway).toBe('emergency_now')
                      expect(tier).toBe('emergent')
                      continue
                    }

                    const urgentFloor =
                      redFlagOverride ||
                      redFlag >= 4 ||
                      acuity === 5 ||
                      concern === 5 ||
                      progression === 5
                    if (urgentFloor) {
                      expect(decision.outpatientPriority).toBe('urgent')
                      expect(tier).toBe('urgent')
                      continue
                    }

                    const semiUrgentFloor = acuity >= 4 || concern >= 4
                    if (semiUrgentFloor) {
                      expect(decision.outpatientPriority).not.toBeNull()
                      expect(
                        OUTPATIENT_RANK[
                          decision.outpatientPriority as keyof typeof OUTPATIENT_RANK
                        ],
                      ).toBeLessThanOrEqual(OUTPATIENT_RANK.semi_urgent)
                    }

                    expect(
                      decision.appliedFloors.some((floor) =>
                        floor.includes('functional_impairment'),
                      ),
                    ).toBe(false)
                  }
                }
              }
            }
          }
        }
      }
    }

    expect(checked).toBe(3_125 * 8)
  })
})
