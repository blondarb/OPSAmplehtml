import { describe, expect, it } from 'vitest'

import { buildFloorDisclosure } from '@/lib/triage/floorDisclosure'
import type { DimensionScores } from '@/lib/triage/types'

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

describe('buildFloorDisclosure', () => {
  it('explains a floor that outranked the weighted score', () => {
    // 2.75 weighted -> routine_priority, but diagnostic_concern=5 floors to urgent.
    const disclosure = buildFloorDisclosure({
      dimensionScores: dims(2, 5, 2, 2, 2),
      redFlagOverride: false,
      finalTier: 'urgent',
    })
    expect(disclosure).not.toBeNull()
    expect(disclosure?.scoreTierName).toBe('Routine-priority')
    expect(disclosure?.reasons).toContain('Diagnostic concern scored 5 — floors to urgent.')
  })

  it('stays silent when the weighted score already explains the tier', () => {
    expect(
      buildFloorDisclosure({
        dimensionScores: dims(3, 3, 3, 3, 3),
        redFlagOverride: false,
        finalTier: 'semi_urgent',
      }),
    ).toBeNull()
  })

  it('stays silent on emergent and insufficient-data tiers', () => {
    // Those are decided upstream of the outpatient floors — explaining them in
    // terms of the weighted score would be actively misleading.
    for (const tier of ['emergent', 'insufficient_data'] as const) {
      expect(
        buildFloorDisclosure({
          dimensionScores: dims(2, 5, 2, 2, 2),
          redFlagOverride: true,
          finalTier: tier,
        }),
      ).toBeNull()
    }
  })

  it('degrades to silence rather than throwing on missing scores', () => {
    expect(
      buildFloorDisclosure({
        dimensionScores: null,
        redFlagOverride: false,
        finalTier: 'urgent',
      }),
    ).toBeNull()
  })

  it('reproduces the real production case that prompted this (2026-08-04 17:11:50)', () => {
    // Live row: weighted 3.50, diagnostic_concern 4, red_flag_presence 4,
    // red_flag_override true, displayed tier urgent. 3.50 maps to semi_urgent,
    // so the tier came from a floor and the UI must say so.
    const disclosure = buildFloorDisclosure({
      dimensionScores: dims(3, 4, 3, 3, 4),
      redFlagOverride: true,
      finalTier: 'urgent',
    })
    expect(disclosure).not.toBeNull()
    expect(disclosure?.scoreTierName).toBe('Semi-urgent')
    expect(disclosure?.reasons).toContain(
      'Red flag presence scored 4 or higher — floors to urgent.',
    )
  })
})
