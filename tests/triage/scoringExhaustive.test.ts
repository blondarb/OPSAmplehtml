import { describe, expect, it } from 'vitest'

import {
  calculateTriageDecision,
  calculateTriageTier,
} from '@/lib/triage/scoring'
import type {
  AITriageResponse,
  CarePathway,
  DimensionScores,
  OutpatientTriageTier,
  ReviewRequirement,
  TriageTier,
} from '@/lib/triage/types'

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
 *
 * 2026-09-07: one reference-model assertion per vector was added (see
 * `referenceOutputs` below). The original assertions are still verbatim.
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
 * Reference model of the outputs `calculateTriageDecision` and
 * `calculateTriageTier` derive from one vector, written from the published
 * constants rather than by calling the code under test.
 *
 * Added 2026-09-07 after an independent mutation check found two mutants of
 * src/lib/triage/scoring.ts that survived every assertion in `checkSlice`:
 * `reviewRequirement` hard-coded to 'clinician_confirmation', and
 * `WEIGHTS.diagnostic_concern` 0.25 -> 0.20 (equivalently `mapScoreToTier`'s
 * urgent cutoff 4.0 -> 4.5). Neither output was asserted — the floor checks
 * and the semi-urgent rank inequality hold under both. Every expected value
 * below cites the scoring.ts path it mirrors; none is a clinical judgement
 * made in this file.
 */

/**
 * `WEIGHTS` in src/lib/triage/scoring.ts: symptom_acuity 0.30,
 * diagnostic_concern 0.25, rate_of_progression 0.20,
 * functional_impairment 0.15, red_flag_presence 0.10 (sum 1.0).
 *
 * Kept in hundredths so the expectation is exact integer arithmetic and shares
 * nothing with `calculateWeightedScore`'s float sum and its
 * `Math.round(raw * 100) / 100` rounding. Both sides end as N / 100 for the
 * same integer N, so `toStrictEqual` on the number is exact.
 */
const WEIGHT_HUNDREDTHS = {
  symptom_acuity: 30,
  diagnostic_concern: 25,
  rate_of_progression: 20,
  functional_impairment: 15,
  red_flag_presence: 10,
} as const

/**
 * `mapScoreToTier` in src/lib/triage/scoring.ts: >= 4.0 urgent,
 * >= 3.0 semi_urgent, >= 2.5 routine_priority, >= 1.5 routine, else
 * non_urgent — expressed in hundredths of the weighted score. The four
 * cutoffs are exactly representable doubles, so the integer comparison agrees
 * with the float comparison on every reachable score.
 */
function referenceBaseTier(weightedHundredths: number): OutpatientTriageTier {
  if (weightedHundredths >= 400) return 'urgent'
  if (weightedHundredths >= 300) return 'semi_urgent'
  if (weightedHundredths >= 250) return 'routine_priority'
  if (weightedHundredths >= 150) return 'routine'
  return 'non_urgent'
}

interface Vector {
  acuity: number
  concern: number
  progression: number
  impairment: number
  redFlag: number
  emergentOverride: boolean
  insufficientData: boolean
  redFlagOverride: boolean
}

/**
 * The derived outputs pinned per vector. `vector` is a label, not an
 * observation: it makes a failing diff name the exact vector, which the
 * it.each title (acuity, concern) alone cannot.
 */
interface DerivedOutputs {
  vector: string
  weightedScore: number
  outpatientPriority: OutpatientTriageTier
  carePathway: CarePathway
  reviewRequirement: ReviewRequirement
  tier: TriageTier
  tierWeightedScore: number | null
}

function vectorLabel(v: Vector): string {
  return (
    `acuity=${v.acuity} concern=${v.concern} progression=${v.progression} ` +
    `impairment=${v.impairment} redFlag=${v.redFlag} ` +
    `emergentOverride=${v.emergentOverride} ` +
    `insufficientData=${v.insufficientData} ` +
    `redFlagOverride=${v.redFlagOverride}`
  )
}

function referenceOutputs(v: Vector): DerivedOutputs {
  const weightedHundredths =
    v.acuity * WEIGHT_HUNDREDTHS.symptom_acuity +
    v.concern * WEIGHT_HUNDREDTHS.diagnostic_concern +
    v.progression * WEIGHT_HUNDREDTHS.rate_of_progression +
    v.impairment * WEIGHT_HUNDREDTHS.functional_impairment +
    v.redFlag * WEIGHT_HUNDREDTHS.red_flag_presence
  const weightedScore = weightedHundredths / 100
  const baseTier = referenceBaseTier(weightedHundredths)

  // `computeAppliedFloors` (scoring.ts): urgent floors are red_flag_override,
  // red_flag_presence >= 4, and a 5 in symptom_acuity, diagnostic_concern or
  // rate_of_progression; semi-urgent floors are symptom_acuity >= 4 and
  // diagnostic_concern >= 4. functional_impairment has no floor.
  const urgentFloor =
    v.redFlagOverride ||
    v.redFlag >= 4 ||
    v.acuity === 5 ||
    v.concern === 5 ||
    v.progression === 5
  const semiUrgentFloor = v.acuity >= 4 || v.concern >= 4

  // `calculateTriageDecision` (scoring.ts): an urgent floor applies
  // moreUrgentOutpatientTier(base, 'urgent'), which is always 'urgent'. A
  // semi-urgent floor alone applies moreUrgentOutpatientTier(base,
  // 'semi_urgent'), which keeps the base tier when it already ranks at or
  // above semi_urgent (OUTPATIENT_ORDER.indexOf(a) <= indexOf(b) ? a : b) and
  // otherwise raises it to semi_urgent. No floor leaves the base tier alone.
  const outpatientPriority: OutpatientTriageTier = urgentFloor
    ? 'urgent'
    : semiUrgentFloor
      ? OUTPATIENT_RANK[baseTier] <= OUTPATIENT_RANK.semi_urgent
        ? baseTier
        : 'semi_urgent'
      : baseTier

  // `calculateTriageDecision` (scoring.ts): emergent_override ->
  // 'emergency_now'; else urgent or semi_urgent -> 'expedited_outpatient';
  // else 'routine_outpatient'.
  const carePathway: CarePathway = v.emergentOverride
    ? 'emergency_now'
    : outpatientPriority === 'urgent' || outpatientPriority === 'semi_urgent'
      ? 'expedited_outpatient'
      : 'routine_outpatient'

  // `calculateTriageDecision` (scoring.ts): reviewRequirement reads ONLY
  // emergent_override (emergent_override ? 'emergency_action' :
  // 'clinician_confirmation'). insufficient_data feeds dataQuality and
  // red_flag_override feeds the floors; neither participates here, so this
  // pin deliberately does not vary with them.
  const reviewRequirement: ReviewRequirement = v.emergentOverride
    ? 'emergency_action'
    : 'clinician_confirmation'

  // `calculateTriageTier` (scoring.ts): emergent_override returns tier
  // 'emergent' with a null weightedScore before any scoring. insufficient_data
  // with an EMPTY appliedFloors returns 'insufficient_data' with a null
  // weightedScore; appliedFloors is empty exactly when no urgent and no
  // semi-urgent floor fired. Otherwise the tier is the decision's
  // outpatientPriority and the weightedScore is the decision's.
  const tier: TriageTier = v.emergentOverride
    ? 'emergent'
    : v.insufficientData && !urgentFloor && !semiUrgentFloor
      ? 'insufficient_data'
      : outpatientPriority
  const tierWeightedScore =
    tier === 'emergent' || tier === 'insufficient_data' ? null : weightedScore

  return {
    vector: vectorLabel(v),
    weightedScore,
    outpatientPriority,
    carePathway,
    reviewRequirement,
    tier,
    tierWeightedScore,
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
              const vector: Vector = {
                acuity,
                concern,
                progression,
                impairment,
                redFlag,
                emergentOverride,
                insufficientData,
                redFlagOverride,
              }
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
              const result = calculateTriageTier(input)
              const tier = result.tier
              checked += 1

              // Reference-model pin of every derived output (see
              // `referenceOutputs`). One assertion per vector keeps the added
              // cost at roughly one expect() call; the original assertions
              // below are unchanged.
              const expected = referenceOutputs(vector)
              const observed: DerivedOutputs = {
                vector: expected.vector,
                weightedScore: decision.weightedScore,
                outpatientPriority: decision.outpatientPriority,
                carePathway: decision.carePathway,
                reviewRequirement: decision.reviewRequirement,
                tier,
                tierWeightedScore: result.weightedScore,
              }
              expect(observed).toStrictEqual(expected)

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
