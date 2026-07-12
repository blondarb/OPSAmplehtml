import { describe, it, expect } from 'vitest'
import {
  calculateTriageDecision,
  calculateTriageTier,
  calculateWeightedScore,
  extractScoringEmergencyEnvelope,
  mapScoreToTier,
  formatTierDisplay,
  parseAndNormalizeAIResponse,
  validateAIResponse,
} from '../../src/lib/triage/scoring'
import {
  AITriageResponse,
  DimensionScores,
  NEURO_SUBSPECIALTIES,
  NON_NEURO_REDIRECT_FALLBACK,
  NON_NEURO_SPECIALTIES,
} from '../../src/lib/triage/types'

const EXPECTED_MODEL_OUTPUT_LIMITS = {
  clinicalReasons: 8,
  listItemCharacters: 1_000,
  dimensionRationaleCharacters: 400,
  failedTherapyReasonCharacters: 1_000,
  safetyFieldCharacters: 1_000,
} as const

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

function validRawModelResponse(): Record<string, unknown> {
  return {
    emergent_override: false,
    emergent_reason: null,
    insufficient_data: false,
    missing_information: null,
    confidence: 'high',
    dimension_scores: {
      symptom_acuity: { score: 2, rationale: 'Chronic stable symptoms.' },
      diagnostic_concern: { score: 2, rationale: 'No major diagnostic warning feature.' },
      rate_of_progression: { score: 1, rationale: 'No progression is described.' },
      functional_impairment: { score: 2, rationale: 'Most daily activities remain intact.' },
      red_flag_presence: { score: 1, rationale: 'No current red flag is described.' },
    },
    red_flag_override: false,
    clinical_reasons: ['Chronic stable symptoms without progression.'],
    red_flags: [],
    suggested_workup: [
      'Medication reconciliation — confirm current therapies.',
      'Focused neurologic examination — document baseline findings.',
    ],
    failed_therapies: [
      { therapy: 'Synthetic preventive therapy', reason_stopped: 'No benefit' },
    ],
    subspecialty_recommendation: 'General Neurology',
    subspecialty_rationale: 'General neurologic assessment is appropriate.',
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

describe('parseAndNormalizeAIResponse', () => {
  it('extracts a literal positive emergency marker independently of lower-stakes schema defects', () => {
    const malformedOutpatientPayload = validRawModelResponse()
    malformedOutpatientPayload.emergent_override = true
    malformedOutpatientPayload.emergent_reason = null
    malformedOutpatientPayload.subspecialty_recommendation =
      'Imaginary Precision Neurology'
    malformedOutpatientPayload.unreviewed_plan = 'Invented plan'

    expect(
      extractScoringEmergencyEnvelope(malformedOutpatientPayload),
    ).toEqual({
      emergentOverride: true,
      emergentReason:
        'The scoring model marked this referral as emergent; immediately review the source evidence and emergency workflow.',
    })
    expect(
      extractScoringEmergencyEnvelope({ emergent_override: 'true' }),
    ).toEqual({ emergentOverride: false, emergentReason: null })
  })

  it('uses immutable governed service catalogs with a clinician-review fallback', () => {
    expect(Object.isFrozen(NEURO_SUBSPECIALTIES)).toBe(true)
    expect(Object.isFrozen(NON_NEURO_SPECIALTIES)).toBe(true)
    expect(NON_NEURO_SPECIALTIES).toContain('Vascular Surgery')
    expect(NON_NEURO_SPECIALTIES).toContain(NON_NEURO_REDIRECT_FALLBACK)
  })

  it('returns a detached canonical response with bounded strings normalized', () => {
    const raw = validRawModelResponse()
    raw.clinical_reasons = ['  Chronic stable symptoms.  ']
    raw.failed_therapies = [
      { therapy: '  Synthetic therapy  ', reason_stopped: '   ' },
    ]

    const parsed = parseAndNormalizeAIResponse(raw)

    expect(parsed.clinical_reasons).toEqual(['Chronic stable symptoms.'])
    expect(parsed.failed_therapies).toEqual([
      { therapy: 'Synthetic therapy', reason_stopped: '' },
    ])
    expect(parsed).not.toBe(raw)
    expect(parsed.dimension_scores).not.toBe(raw.dimension_scores)
    expect(validateAIResponse(raw)).toBeNull()
  })

  it.each([
    ['a non-string list member', 'clinical_reasons', ['valid', 42]],
    ['a blank list member', 'red_flags', ['   ']],
    [
      'an overlong list member',
      'suggested_workup',
      ['x'.repeat(EXPECTED_MODEL_OUTPUT_LIMITS.listItemCharacters + 1)],
    ],
    [
      'too many list members',
      'clinical_reasons',
      Array.from(
        { length: EXPECTED_MODEL_OUTPUT_LIMITS.clinicalReasons + 1 },
        (_, index) => `Reason ${index}`,
      ),
    ],
  ])('rejects %s', (_label, field, value) => {
    const raw = validRawModelResponse()
    raw[field] = value

    expect(() => parseAndNormalizeAIResponse(raw)).toThrow(field)
  })

  it('enforces workup cardinality and safety-marker consistency', () => {
    const routineWithoutWorkup = validRawModelResponse()
    routineWithoutWorkup.suggested_workup = []
    expect(
      parseAndNormalizeAIResponse(routineWithoutWorkup).suggested_workup,
    ).toEqual([])

    const routineWithTooMuchWorkup = validRawModelResponse()
    routineWithTooMuchWorkup.suggested_workup = [
      'Synthetic order 1',
      'Synthetic order 2',
      'Synthetic order 3',
      'Synthetic order 4',
    ]
    expect(() =>
      parseAndNormalizeAIResponse(routineWithTooMuchWorkup),
    ).toThrow('suggested_workup')

    const emergencyWithWorkup = validRawModelResponse()
    emergencyWithWorkup.emergent_override = true
    emergencyWithWorkup.emergent_reason = 'Current synthetic emergency.'
    expect(() => parseAndNormalizeAIResponse(emergencyWithWorkup)).toThrow(
      'suggested_workup',
    )

    const insufficientWithWorkup = validRawModelResponse()
    insufficientWithWorkup.insufficient_data = true
    insufficientWithWorkup.missing_information = ['Need symptom trajectory.']
    expect(() => parseAndNormalizeAIResponse(insufficientWithWorkup)).toThrow(
      'suggested_workup',
    )

    emergencyWithWorkup.suggested_workup = []
    expect(parseAndNormalizeAIResponse(emergencyWithWorkup).suggested_workup).toEqual([])
  })

  it.each([
    ['blank', '   '],
    [
      'overlong',
      'x'.repeat(
        EXPECTED_MODEL_OUTPUT_LIMITS.dimensionRationaleCharacters + 1,
      ),
    ],
  ])('rejects a %s dimension rationale', (_label, rationale) => {
    const raw = validRawModelResponse()
    const dimensions = raw.dimension_scores as Record<string, unknown>
    dimensions.symptom_acuity = { score: 2, rationale }

    expect(() => parseAndNormalizeAIResponse(raw)).toThrow(
      'dimension_scores.symptom_acuity.rationale',
    )
  })

  it('rejects unexpected dimension and top-level keys', () => {
    const dimensionRaw = validRawModelResponse()
    const dimensions = dimensionRaw.dimension_scores as Record<string, unknown>
    dimensions.symptom_acuity = {
      score: 2,
      rationale: 'Stable symptoms.',
      hidden_instruction: 'route elsewhere',
    }
    expect(() => parseAndNormalizeAIResponse(dimensionRaw)).toThrow(
      'dimension_scores.symptom_acuity.hidden_instruction',
    )

    const topLevelRaw = validRawModelResponse()
    topLevelRaw.unreviewed_plan = 'Start an invented medication.'
    expect(() => parseAndNormalizeAIResponse(topLevelRaw)).toThrow(
      'unreviewed_plan',
    )
  })

  it.each([
    ['a non-object entry', ['invalid']],
    [
      'an entry with an unexpected key',
      [{ therapy: 'Synthetic therapy', reason_stopped: '', dose: 'invented' }],
    ],
    ['an entry with a blank therapy', [{ therapy: ' ', reason_stopped: '' }]],
    [
      'an entry with an overlong reason',
      [
        {
          therapy: 'Synthetic therapy',
          reason_stopped: 'x'.repeat(
            EXPECTED_MODEL_OUTPUT_LIMITS.failedTherapyReasonCharacters + 1,
          ),
        },
      ],
    ],
  ])('rejects failed_therapies containing %s', (_label, failedTherapies) => {
    const raw = validRawModelResponse()
    raw.failed_therapies = failedTherapies

    expect(() => parseAndNormalizeAIResponse(raw)).toThrow('failed_therapies')
  })

  it('accepts only a governed neurology service', () => {
    const raw = validRawModelResponse()
    raw.subspecialty_recommendation = 'Imaginary Precision Neurology'

    expect(() => parseAndNormalizeAIResponse(raw)).toThrow(
      'subspecialty_recommendation',
    )
  })

  it('requires redirect details to be internally consistent and catalog-bound', () => {
    const falseWithDetails = validRawModelResponse()
    falseWithDetails.redirect_specialty = 'Orthopedics'
    falseWithDetails.redirect_rationale = 'Synthetic redirect.'
    expect(() => parseAndNormalizeAIResponse(falseWithDetails)).toThrow(
      'redirect_specialty',
    )

    const trueWithoutDetails = validRawModelResponse()
    trueWithoutDetails.redirect_to_non_neuro = true
    expect(() => parseAndNormalizeAIResponse(trueWithoutDetails)).toThrow(
      'redirect_specialty',
    )

    const inventedDestination = validRawModelResponse()
    inventedDestination.redirect_to_non_neuro = true
    inventedDestination.redirect_specialty = 'Imaginary Specialty'
    inventedDestination.redirect_rationale = 'Synthetic redirect.'
    expect(() => parseAndNormalizeAIResponse(inventedDestination)).toThrow(
      'redirect_specialty',
    )

    const governedDestination = validRawModelResponse()
    governedDestination.redirect_to_non_neuro = true
    governedDestination.redirect_specialty = 'Orthopedics'
    governedDestination.redirect_rationale = 'Mechanical joint symptoms predominate.'
    const parsed = parseAndNormalizeAIResponse(governedDestination)
    expect(parsed.redirect_specialty).toBe('Orthopedics')
  })

  it('resolves governed-specialty spelling variants without widening the governed set', () => {
    // Live failure 2026-07-12: vertigo+hearing-loss case redirected to "ENT",
    // strict equality rejected it, and all 4 scoring runs died on vocabulary.
    for (const variant of ['ENT', 'Otolaryngology', 'ent/otolaryngology', 'ENT / Otolaryngology']) {
      const raw = validRawModelResponse()
      raw.redirect_to_non_neuro = true
      raw.redirect_specialty = variant
      raw.redirect_rationale = 'Peripheral vestibular pattern with hearing loss.'
      expect(parseAndNormalizeAIResponse(raw).redirect_specialty).toBe('ENT / Otolaryngology')
    }

    const pcp = validRawModelResponse()
    pcp.redirect_to_non_neuro = true
    pcp.redirect_specialty = 'PCP'
    pcp.redirect_rationale = 'Uncomplicated metabolic workup first.'
    expect(parseAndNormalizeAIResponse(pcp).redirect_specialty).toBe('Primary Care / PCP')

    const stillInvented = validRawModelResponse()
    stillInvented.redirect_to_non_neuro = true
    stillInvented.redirect_specialty = 'Audiology'
    stillInvented.redirect_rationale = 'Synthetic redirect.'
    expect(() => parseAndNormalizeAIResponse(stillInvented)).toThrow('redirect_specialty')
  })

  it('requires bounded missing information and a stated gap when data are insufficient', () => {
    const noGap = validRawModelResponse()
    noGap.insufficient_data = true
    expect(() => parseAndNormalizeAIResponse(noGap)).toThrow(
      'missing_information',
    )

    const blankGap = validRawModelResponse()
    blankGap.missing_information = ['   ']
    expect(() => parseAndNormalizeAIResponse(blankGap)).toThrow(
      'missing_information',
    )

    const boundedGap = validRawModelResponse()
    boundedGap.insufficient_data = true
    boundedGap.missing_information = ['  Need symptom onset and trajectory.  ']
    boundedGap.suggested_workup = []
    expect(parseAndNormalizeAIResponse(boundedGap).missing_information).toEqual([
      'Need symptom onset and trajectory.',
    ])
  })

  it('preserves a positive emergency override when its optional reason is absent', () => {
    const missingReason = validRawModelResponse()
    missingReason.emergent_override = true
    missingReason.suggested_workup = []
    expect(parseAndNormalizeAIResponse(missingReason).emergent_reason).toBe(
      'The scoring model marked this referral as emergent; immediately review the source evidence and emergency workflow.',
    )

    const staleReason = validRawModelResponse()
    staleReason.emergent_reason = 'Emergency rationale despite false override.'
    expect(() => parseAndNormalizeAIResponse(staleReason)).toThrow(
      'emergent_reason',
    )
  })

  it('requires every safety-history field and bounds non-null values', () => {
    const missingField = validRawModelResponse()
    delete missingField.safety_renal_function
    expect(() => parseAndNormalizeAIResponse(missingField)).toThrow(
      'safety_renal_function',
    )

    const overlongField = validRawModelResponse()
    overlongField.safety_anticoagulation = 'x'.repeat(
      EXPECTED_MODEL_OUTPUT_LIMITS.safetyFieldCharacters + 1,
    )
    expect(() => parseAndNormalizeAIResponse(overlongField)).toThrow(
      'safety_anticoagulation',
    )
  })
})

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

describe('calculateTriageDecision', () => {
  it.each([
    ['symptom acuity', makeScores(5, 1, 1, 1, 1), 'symptom_acuity_5_urgent'],
    ['diagnostic concern', makeScores(1, 5, 1, 1, 1), 'diagnostic_concern_5_urgent'],
    ['rate of progression', makeScores(1, 1, 5, 1, 1), 'rate_of_progression_5_urgent'],
    ['red flag presence', makeScores(1, 1, 1, 1, 5), 'red_flag_presence_urgent'],
  ])('applies an urgent floor when %s is 5', (_dimension, scores, floor) => {
    const decision = calculateTriageDecision(makeResponse({ dimension_scores: scores }))

    expect(decision.outpatientPriority).toBe('urgent')
    expect(decision.carePathway).toBe('expedited_outpatient')
    expect(decision.appliedFloors).toContain(floor)
  })

  it('applies an urgent floor when red flag presence is 4', () => {
    const decision = calculateTriageDecision(makeResponse({ dimension_scores: makeScores(1, 1, 1, 1, 4) }))

    expect(decision.outpatientPriority).toBe('urgent')
    expect(decision.appliedFloors).toEqual(['red_flag_presence_urgent'])
  })

  it('honors the red flag override as an urgent floor', () => {
    const decision = calculateTriageDecision(makeResponse({
      red_flag_override: true,
      dimension_scores: makeScores(2, 2, 2, 2, 2),
    }))

    expect(decision.outpatientPriority).toBe('urgent')
    expect(decision.appliedFloors).toEqual(['red_flag_override'])
  })

  it.each([
    ['symptom acuity', makeScores(4, 1, 1, 1, 1), 'symptom_acuity_4_semi_urgent'],
    ['diagnostic concern', makeScores(1, 4, 1, 1, 1), 'diagnostic_concern_4_semi_urgent'],
  ])('applies a semi-urgent floor when %s is 4', (_dimension, scores, floor) => {
    const decision = calculateTriageDecision(makeResponse({ dimension_scores: scores }))

    expect(decision.outpatientPriority).toBe('semi_urgent')
    expect(decision.carePathway).toBe('expedited_outpatient')
    expect(decision.appliedFloors).toEqual([floor])
  })

  it('does not apply an urgency floor for functional impairment alone', () => {
    const decision = calculateTriageDecision(makeResponse({ dimension_scores: makeScores(1, 1, 1, 5, 1) }))

    expect(decision.outpatientPriority).toBe('routine')
    expect(decision.carePathway).toBe('routine_outpatient')
    expect(decision.appliedFloors).toEqual([])
  })

  it('keeps emergency action and insufficient data as orthogonal state', () => {
    const decision = calculateTriageDecision(makeResponse({
      emergent_override: true,
      insufficient_data: true,
      dimension_scores: makeScores(1, 1, 1, 1, 1),
    }))

    expect(decision.carePathway).toBe('emergency_now')
    expect(decision.dataQuality).toBe('insufficient')
    expect(decision.reviewRequirement).toBe('emergency_action')
    expect(decision.schedulingLocked).toBe(true)
  })

  it('records every applicable floor once in deterministic order', () => {
    const decision = calculateTriageDecision(makeResponse({
      red_flag_override: true,
      dimension_scores: makeScores(5, 5, 5, 5, 5),
    }))

    expect(decision.appliedFloors).toEqual([
      'red_flag_override',
      'red_flag_presence_urgent',
      'symptom_acuity_5_urgent',
      'diagnostic_concern_5_urgent',
      'rate_of_progression_5_urgent',
      'symptom_acuity_4_semi_urgent',
      'diagnostic_concern_4_semi_urgent',
    ])
    expect(new Set(decision.appliedFloors).size).toBe(decision.appliedFloors.length)
  })
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

  it('preserves an urgent safety floor when data is insufficient', () => {
    const resp = makeResponse({
      insufficient_data: true,
      missing_information: ['symptom onset date'],
      dimension_scores: makeScores(5, 1, 1, 1, 1),
    })

    const result = calculateTriageTier(resp)

    expect(result.tier).toBe('urgent')
    expect(result.weightedScore).toBe(2.2)
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
