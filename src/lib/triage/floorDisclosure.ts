import {
  calculateWeightedScore,
  computeAppliedFloors,
  mapScoreToTier,
} from './scoring'
import { TIER_PRESENTATION } from './tierPresentation'
import type { DimensionScores, TriageTier } from './types'

/**
 * Presentation-only explanation of a floor-driven tier.
 *
 * Audit 2026-08-04: `calculateTriageDecision` can raise the tier above what the
 * published weighted score maps to, via a single-dimension safety floor. The
 * result panel showed "Weighted total X / 5 → Tier N" with no indication a
 * floor had fired, which reads as an arithmetic contradiction against the tier
 * boundaries the Algorithm modal publishes. This derives the explanation from
 * the SAME floor function the engine uses (`computeAppliedFloors`), so the two
 * cannot drift — the API does not persist `appliedFloors`, but the floors are a
 * pure function of the dimension scores, which the API does return.
 *
 * Returns null when no floor fired, or when the floor did not actually change
 * the tier — in that case the weighted total already tells the whole story and
 * an extra note would be noise.
 */

const FLOOR_REASONS: Record<string, string> = {
  red_flag_override: 'A red flag triggered an override.',
  red_flag_presence_urgent: 'Red flag presence scored 4 or higher — floors to urgent.',
  symptom_acuity_5_urgent: 'Symptom acuity scored 5 — floors to urgent.',
  diagnostic_concern_5_urgent: 'Diagnostic concern scored 5 — floors to urgent.',
  rate_of_progression_5_urgent: 'Rate of progression scored 5 — floors to urgent.',
  symptom_acuity_4_semi_urgent: 'Symptom acuity scored 4 or higher — floors to semi-urgent.',
  diagnostic_concern_4_semi_urgent:
    'Diagnostic concern scored 4 or higher — floors to semi-urgent.',
}

export interface FloorDisclosure {
  /** Human-readable name of the tier the weighted score alone would give. */
  scoreTierName: string
  /** One sentence per floor that fired. */
  reasons: string[]
}

export function buildFloorDisclosure(input: {
  dimensionScores: DimensionScores | null | undefined
  redFlagOverride: boolean
  finalTier: TriageTier
}): FloorDisclosure | null {
  const { dimensionScores, redFlagOverride, finalTier } = input
  if (!dimensionScores) return null

  // Emergent and insufficient-data tiers are decided upstream of the outpatient
  // floors; explaining them in terms of the weighted score would be wrong.
  if (finalTier === 'emergent' || finalTier === 'insufficient_data') return null

  let weighted: number
  let scoreTier: TriageTier
  try {
    weighted = calculateWeightedScore(dimensionScores)
    scoreTier = mapScoreToTier(weighted)
  } catch {
    return null
  }

  // Only worth saying when the floor actually moved the tier.
  if (scoreTier === finalTier) return null

  const { appliedFloors } = computeAppliedFloors(dimensionScores, redFlagOverride)
  const reasons = appliedFloors
    .map((floor) => FLOOR_REASONS[floor])
    .filter((reason): reason is string => Boolean(reason))

  if (reasons.length === 0) return null

  return {
    scoreTierName: TIER_PRESENTATION[scoreTier].name,
    reasons,
  }
}
