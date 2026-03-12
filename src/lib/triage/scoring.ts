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

/**
 * Validate AI response structure before scoring.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateAIResponse(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') {
    return 'Response is not an object'
  }

  const r = parsed as Record<string, unknown>

  // Check boolean fields exist
  if (typeof r.emergent_override !== 'boolean') return 'Missing or invalid emergent_override (expected boolean)'
  if (typeof r.insufficient_data !== 'boolean') return 'Missing or invalid insufficient_data (expected boolean)'
  if (typeof r.red_flag_override !== 'boolean') return 'Missing or invalid red_flag_override (expected boolean)'

  // Check confidence
  if (!['high', 'moderate', 'low'].includes(r.confidence as string)) {
    return 'Missing or invalid confidence (expected high/moderate/low)'
  }

  // Check dimension scores
  const ds = r.dimension_scores
  if (!ds || typeof ds !== 'object') return 'Missing dimension_scores object'

  const dimensions = ['symptom_acuity', 'diagnostic_concern', 'rate_of_progression', 'functional_impairment', 'red_flag_presence']
  for (const dim of dimensions) {
    const d = (ds as Record<string, unknown>)[dim]
    if (!d || typeof d !== 'object') return `Missing dimension_scores.${dim}`
    const score = (d as Record<string, unknown>).score
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 5) {
      return `dimension_scores.${dim}.score must be an integer 1-5 (got ${score})`
    }
  }

  // Check required arrays exist (can be empty)
  if (!Array.isArray(r.clinical_reasons)) return 'Missing clinical_reasons array'
  if (!Array.isArray(r.red_flags)) return 'Missing red_flags array'
  if (!Array.isArray(r.suggested_workup)) return 'Missing suggested_workup array'
  if (!Array.isArray(r.failed_therapies)) return 'Missing failed_therapies array'

  return null
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

  // 4. Deterministic red flag escalation: if red_flag_presence dimension ≥ 4
  //    ("one or more major red flags identified"), auto-escalate to urgent.
  //    This replaces the AI's subjective red_flag_override boolean, which was
  //    inconsistent across runs even when dimension scores were identical.
  const redFlagScore = aiResponse.dimension_scores.red_flag_presence.score
  const scoreDerivedTier = mapScoreToTier(weightedScore)
  if (redFlagScore >= 4 && scoreDerivedTier !== 'urgent' && scoreDerivedTier !== 'emergent') {
    return {
      tier: 'urgent',
      display: formatTierDisplay('urgent', true),
      weightedScore,
    }
  }

  // 5. Map score to tier
  const tier = scoreDerivedTier
  return {
    tier,
    display: formatTierDisplay(tier),
    weightedScore,
  }
}
