import { describe, it, expect } from 'vitest'
import { calculateTriageTier, calculateWeightedScore, mapScoreToTier, formatTierDisplay } from '../../src/lib/triage/scoring'
import { AITriageResponse, DimensionScores } from '../../src/lib/triage/types'

// Helper to build a minimal AITriageResponse
function makeResponse(overrides: Partial<AITriageResponse> & { dimension_scores: DimensionScores }): AITriageResponse {
  return {
    emergent_override: false,
    emergent_reason: null,
    insufficient_data: false,
    missing_information: null,
    confidence: 'high',
    red_flag_override: false,
    clinical_reasons: ['Reason 1'],
    red_flags: [],
    suggested_workup: [],
    failed_therapies: [],
    subspecialty_recommendation: 'General Neurology',
    subspecialty_rationale: 'Default',
    ...overrides,
  }
}

function makeScores(acuity: number, concern: number, progression: number, impairment: number, redFlags: number): DimensionScores {
  return {
    symptom_acuity: { score: acuity, rationale: '' },
    diagnostic_concern: { score: concern, rationale: '' },
    rate_of_progression: { score: progression, rationale: '' },
    functional_impairment: { score: impairment, rationale: '' },
    red_flag_presence: { score: redFlags, rationale: '' },
  }
}

describe('calculateWeightedScore', () => {
  it('calculates correct weighted score for all 5s', () => {
    const scores = makeScores(5, 5, 5, 5, 5)
    expect(calculateWeightedScore(scores)).toBe(5.0)
  })

  it('calculates correct weighted score for all 1s', () => {
    const scores = makeScores(1, 1, 1, 1, 1)
    expect(calculateWeightedScore(scores)).toBe(1.0)
  })

  it('applies weights correctly: (4*0.30)+(3*0.25)+(4*0.20)+(2*0.15)+(4*0.10)', () => {
    // 1.20 + 0.75 + 0.80 + 0.30 + 0.40 = 3.45
    const scores = makeScores(4, 3, 4, 2, 4)
    expect(calculateWeightedScore(scores)).toBe(3.45)
  })

  it('handles mixed scores correctly', () => {
    // (5*0.30)+(4*0.25)+(5*0.20)+(3*0.15)+(4*0.10) = 1.50+1.00+1.00+0.45+0.40 = 4.35
    const scores = makeScores(5, 4, 5, 3, 4)
    expect(calculateWeightedScore(scores)).toBe(4.35)
  })
})

describe('mapScoreToTier', () => {
  it('maps 5.0 to urgent', () => expect(mapScoreToTier(5.0)).toBe('urgent'))
  it('maps 4.0 to urgent (boundary)', () => expect(mapScoreToTier(4.0)).toBe('urgent'))
  it('maps 3.99 to semi_urgent', () => expect(mapScoreToTier(3.99)).toBe('semi_urgent'))
  it('maps 3.0 to semi_urgent (boundary)', () => expect(mapScoreToTier(3.0)).toBe('semi_urgent'))
  it('maps 2.99 to routine_priority', () => expect(mapScoreToTier(2.99)).toBe('routine_priority'))
  it('maps 2.5 to routine_priority (boundary)', () => expect(mapScoreToTier(2.5)).toBe('routine_priority'))
  it('maps 2.49 to routine', () => expect(mapScoreToTier(2.49)).toBe('routine'))
  it('maps 1.5 to routine (boundary)', () => expect(mapScoreToTier(1.5)).toBe('routine'))
  it('maps 1.49 to non_urgent', () => expect(mapScoreToTier(1.49)).toBe('non_urgent'))
  it('maps 1.0 to non_urgent', () => expect(mapScoreToTier(1.0)).toBe('non_urgent'))
})

describe('calculateTriageTier', () => {
  it('returns emergent when emergent_override is true', () => {
    const resp = makeResponse({
      emergent_override: true,
      emergent_reason: 'Active stroke symptoms',
      dimension_scores: makeScores(5, 5, 5, 5, 5),
    })
    const result = calculateTriageTier(resp)
    expect(result.tier).toBe('emergent')
    expect(result.weightedScore).toBeNull()
    expect(result.display).toContain('EMERGENT')
  })

  it('returns insufficient_data when insufficient_data is true', () => {
    const resp = makeResponse({
      insufficient_data: true,
      missing_information: ['symptom onset date', 'severity'],
      dimension_scores: makeScores(1, 1, 1, 1, 1),
    })
    const result = calculateTriageTier(resp)
    expect(result.tier).toBe('insufficient_data')
    expect(result.weightedScore).toBeNull()
    expect(result.display).toContain('INSUFFICIENT DATA')
  })

  it('emergent takes precedence over insufficient_data', () => {
    const resp = makeResponse({
      emergent_override: true,
      emergent_reason: 'Active stroke',
      insufficient_data: true,
      dimension_scores: makeScores(5, 5, 5, 5, 5),
    })
    expect(calculateTriageTier(resp).tier).toBe('emergent')
  })

  it('red flag override escalates to urgent regardless of score', () => {
    // Score would be routine (2.0), but red flag override -> urgent
    const resp = makeResponse({
      red_flag_override: true,
      dimension_scores: makeScores(2, 2, 2, 2, 2),
    })
    const result = calculateTriageTier(resp)
    expect(result.tier).toBe('urgent')
    expect(result.weightedScore).toBe(2.0)
    expect(result.display).toContain('Red Flag Override')
  })

  it('new-onset seizure scenario scores urgent (~4.35)', () => {
    const resp = makeResponse({
      dimension_scores: makeScores(5, 4, 5, 3, 4),
    })
    const result = calculateTriageTier(resp)
    expect(result.tier).toBe('urgent')
    expect(result.weightedScore).toBe(4.35)
  })

  it('chronic migraine scenario scores routine (~2.3)', () => {
    const resp = makeResponse({
      dimension_scores: makeScores(2, 3, 2, 3, 1),
    })
    const result = calculateTriageTier(resp)
    expect(result.tier).toBe('routine')
    // (2*0.30)+(3*0.25)+(2*0.20)+(3*0.15)+(1*0.10) = 0.60+0.75+0.40+0.45+0.10 = 2.30
    expect(result.weightedScore).toBe(2.3)
  })

  it('stable neuropathy scenario scores non_urgent (~1.4)', () => {
    const resp = makeResponse({
      dimension_scores: makeScores(1, 2, 1, 2, 1),
    })
    const result = calculateTriageTier(resp)
    expect(result.tier).toBe('non_urgent')
    // (1*0.30)+(2*0.25)+(1*0.20)+(2*0.15)+(1*0.10) = 0.30+0.50+0.20+0.30+0.10 = 1.40
    expect(result.weightedScore).toBe(1.4)
  })
})

describe('formatTierDisplay', () => {
  it('formats urgent with timeframe', () => {
    expect(formatTierDisplay('urgent')).toBe('URGENT — Within 1 Week')
  })

  it('adds red flag override annotation', () => {
    expect(formatTierDisplay('urgent', true)).toBe('URGENT — Within 1 Week (Red Flag Override)')
  })

  it('formats emergent correctly', () => {
    expect(formatTierDisplay('emergent')).toBe('EMERGENT — Redirect to ED Immediately')
  })
})
