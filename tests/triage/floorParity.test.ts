import { describe, expect, it } from 'vitest'

import {
  calculateTriageDecision,
  calculateWeightedScore,
  computeAppliedFloors,
  mapScoreToTier,
} from '@/lib/triage/scoring'
import type { AITriageResponse, DimensionScores } from '@/lib/triage/types'

/**
 * Exhaustive parity guard for the 2026-08-04 extraction of the single-dimension
 * floors into `computeAppliedFloors`.
 *
 * The floors decide a patient-facing acuity tier, so "behaviour-preserving" is
 * not something to assert in a commit message — it is checked here against a
 * REFERENCE implementation copied verbatim from the pre-refactor source, across
 * every one of the 5^5 x 2 = 6,250 reachable score/override combinations.
 */

/** Verbatim copy of the pre-refactor inline logic. Do not "tidy" this. */
function referenceFloors(scores: DimensionScores, redFlagOverride: boolean) {
  const appliedFloors: string[] = []
  if (redFlagOverride) appliedFloors.push('red_flag_override')
  if (scores.red_flag_presence.score >= 4) appliedFloors.push('red_flag_presence_urgent')
  if (scores.symptom_acuity.score === 5) appliedFloors.push('symptom_acuity_5_urgent')
  if (scores.diagnostic_concern.score === 5) appliedFloors.push('diagnostic_concern_5_urgent')
  if (scores.rate_of_progression.score === 5) appliedFloors.push('rate_of_progression_5_urgent')
  const urgentFloorCount = appliedFloors.length
  if (scores.symptom_acuity.score >= 4) appliedFloors.push('symptom_acuity_4_semi_urgent')
  if (scores.diagnostic_concern.score >= 4) appliedFloors.push('diagnostic_concern_4_semi_urgent')
  return {
    appliedFloors,
    hasUrgentFloor: urgentFloorCount > 0,
    hasSemiUrgentFloor: appliedFloors.length > urgentFloorCount,
  }
}

function dims(a: number, d: number, r: number, f: number, g: number): DimensionScores {
  const s = (score: number) => ({ score, rationale: 'synthetic' })
  return {
    symptom_acuity: s(a),
    diagnostic_concern: s(d),
    rate_of_progression: s(r),
    functional_impairment: s(f),
    red_flag_presence: s(g),
  } as unknown as DimensionScores
}

const RANGE = [1, 2, 3, 4, 5]

describe('computeAppliedFloors — exhaustive parity with the pre-refactor logic', () => {
  it('matches the reference across all 6,250 score/override combinations', () => {
    let checked = 0
    for (const a of RANGE) {
      for (const d of RANGE) {
        for (const r of RANGE) {
          for (const f of RANGE) {
            for (const g of RANGE) {
              for (const override of [false, true]) {
                const scores = dims(a, d, r, f, g)
                expect(computeAppliedFloors(scores, override)).toEqual(
                  referenceFloors(scores, override),
                )
                checked += 1
              }
            }
          }
        }
      }
    }
    expect(checked).toBe(6250)
  })
})

describe('floor disclosure is meaningful — a floor really can outrank the score', () => {
  it('raises a routine_priority weighted score to urgent on diagnostic_concern=5', () => {
    // Chosen so the weighted score sits inside routine_priority (2.5-2.9):
    // 2(.30) + 5(.25) + 2(.20) + 2(.15) + 2(.10) = 2.75
    const scores = dims(2, 5, 2, 2, 2)
    const weighted = calculateWeightedScore(scores)
    expect(mapScoreToTier(weighted)).toBe('routine_priority')

    const decision = calculateTriageDecision({
      dimension_scores: scores,
      red_flag_override: false,
      emergent_override: false,
      insufficient_data: false,
    } as unknown as AITriageResponse)

    expect(decision.outpatientPriority).toBe('urgent')
    expect(decision.appliedFloors).toContain('diagnostic_concern_5_urgent')
    // The published arithmetic and the final tier genuinely disagree here.
    // That divergence is exactly what the UI must disclose.
    expect(decision.weightedScore).toBeLessThan(3.0)
  })

  it('leaves the tier alone when no floor fires', () => {
    const scores = dims(3, 3, 3, 3, 3)
    const decision = calculateTriageDecision({
      dimension_scores: scores,
      red_flag_override: false,
      emergent_override: false,
      insufficient_data: false,
    } as unknown as AITriageResponse)
    expect(decision.appliedFloors).toEqual([])
    expect(decision.outpatientPriority).toBe(mapScoreToTier(decision.weightedScore))
  })
})
