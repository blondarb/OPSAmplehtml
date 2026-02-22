import { AITriageResponse, TriageTier, TIER_DISPLAY } from './types'

export interface ScoringResult {
  tier: TriageTier
  display: string
  weightedScore: number | null
}

// Dimension weights (must sum to 1.0)
const WEIGHTS = {
  symptom_acuity: 0.30,
  diagnostic_concern: 0.25,
  rate_of_progression: 0.20,
  functional_impairment: 0.15,
  red_flag_presence: 0.10,
} as const

export function calculateWeightedScore(scores: {
  symptom_acuity: { score: number }
  diagnostic_concern: { score: number }
  rate_of_progression: { score: number }
  functional_impairment: { score: number }
  red_flag_presence: { score: number }
}): number {
  const raw =
    scores.symptom_acuity.score * WEIGHTS.symptom_acuity +
    scores.diagnostic_concern.score * WEIGHTS.diagnostic_concern +
    scores.rate_of_progression.score * WEIGHTS.rate_of_progression +
    scores.functional_impairment.score * WEIGHTS.functional_impairment +
    scores.red_flag_presence.score * WEIGHTS.red_flag_presence
  // Round to 2 decimal places
  return Math.round(raw * 100) / 100
}

export function mapScoreToTier(weightedScore: number): TriageTier {
  if (weightedScore >= 4.0) return 'urgent'
  if (weightedScore >= 3.0) return 'semi_urgent'
  if (weightedScore >= 2.5) return 'routine_priority'
  if (weightedScore >= 1.5) return 'routine'
  return 'non_urgent'
}

export function formatTierDisplay(tier: TriageTier, isRedFlagOverride?: boolean): string {
  const config = TIER_DISPLAY[tier]
  const base = `${config.label} — ${config.timeframe}`
  if (isRedFlagOverride) return `${base} (Red Flag Override)`
  return base
}

export function calculateTriageTier(aiResponse: AITriageResponse): ScoringResult {
  // 1. Check emergent override FIRST
  if (aiResponse.emergent_override) {
    return {
      tier: 'emergent',
      display: formatTierDisplay('emergent'),
      weightedScore: null,
    }
  }

  // 2. Check insufficient data SECOND
  if (aiResponse.insufficient_data) {
    return {
      tier: 'insufficient_data',
      display: formatTierDisplay('insufficient_data'),
      weightedScore: null,
    }
  }

  // 3. Calculate weighted score
  const weightedScore = calculateWeightedScore(aiResponse.dimension_scores)

  // 4. Check red flag override THIRD (escalates to Urgent, not Emergent)
  if (aiResponse.red_flag_override) {
    return {
      tier: 'urgent',
      display: formatTierDisplay('urgent', true),
      weightedScore,
    }
  }

  // 5. Map score to tier
  const tier = mapScoreToTier(weightedScore)
  return {
    tier,
    display: formatTierDisplay(tier),
    weightedScore,
  }
}
