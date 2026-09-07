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

const SCORE_RANGE = [1, 2, 3, 4, 5] as const
const BOOLEANS = [false, true] as const

/**
 * The 5^5 x 2^3 = 25,000-vector enumeration is sliced by the first two score
 * dimensions so each `it` case runs a bounded 5 x 5 x 5 x 2 x 2 x 2 = 1,000
 * vectors. Coverage is unchanged (25 slices x 1,000 = 3,125 x 8) and the
 * per-vector assertions are the same as the single-case version; the slicing
 * only keeps any one case far from vitest's 5 s default timeout when the
 * machine is shared (2026-09-06: the unsliced case ran 5.5 s in a contended
 * full-suite run against a 1.1-2.0 s idle baseline).
 *
 * Profiled 2026-09-06: object construction plus both scoring calls cost
 * 4-30 ms for all 25,000 vectors; ~99% of the runtime is the per-vector
 * `expect()` machinery. Hoisting scoring work would not help, so the
 * assertions were left verbatim and only the loop was partitioned.
 */
const SLICES = SCORE_RANGE.flatMap((acuity) =>
  SCORE_RANGE.map((concern) => ({ acuity, concern })),
)
const VECTORS_PER_SLICE = 5 * 5 * 5 * 2 * 2 * 2
const TOTAL_VECTORS = 3_125 * 8

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

/**
 * Checks every vector with the given symptom_acuity and diagnostic_concern.
 * Returns the number of vectors checked so the caller can pin the slice size.
 */
function checkSlice(acuity: number, concern: number): number {
  let checked = 0

  for (const progression of SCORE_RANGE) {
    for (const impairment of SCORE_RANGE) {
      for (const redFlag of SCORE_RANGE) {
        for (const emergentOverride of BOOLEANS) {
          for (const insufficientData of BOOLEANS) {
            for (const redFlagOverride of BOOLEANS) {
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

  return checked
}

describe('exhaustive triage scoring invariants', () => {
  it('slices the 3,125 x 8 vector space into disjoint acuity x concern cases that cover it exactly once', () => {
    const expectedKeys = new Set<string>()
    for (const acuity of SCORE_RANGE) {
      for (const concern of SCORE_RANGE) {
        expectedKeys.add(`${acuity}:${concern}`)
      }
    }
    const sliceKeys = SLICES.map((slice) => `${slice.acuity}:${slice.concern}`)

    expect(new Set(sliceKeys)).toEqual(expectedKeys)
    expect(sliceKeys).toHaveLength(expectedKeys.size)
    expect(SLICES.length * VECTORS_PER_SLICE).toBe(TOTAL_VECTORS)
  })

  it.each(SLICES)(
    'checks every 1-5 score vector and boolean combination without allowing a safety-floor downgrade (symptom_acuity=$acuity, diagnostic_concern=$concern)',
    ({ acuity, concern }) => {
      expect(checkSlice(acuity, concern)).toBe(VECTORS_PER_SLICE)
    },
  )
})
