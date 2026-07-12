import {
  AITriageResponse,
  CarePathway,
  DataQuality,
  NEURO_SUBSPECIALTIES,
  NON_NEURO_SPECIALTIES,
  NonNeuroSpecialtyType,
  OutpatientTriageTier,
  ReviewRequirement,
  SubspecialtyType,
  TriageDecisionState,
  TriageTier,
  TIER_DISPLAY,
} from './types'

export interface ScoringResult {
  tier: TriageTier
  display: string
  weightedScore: number | null
}

export const TRIAGE_MODEL_OUTPUT_LIMITS = Object.freeze({
  clinicalReasons: 8,
  redFlags: 30,
  suggestedWorkup: 3,
  failedTherapies: 30,
  missingInformation: 30,
  listItemCharacters: 1_000,
  dimensionRationaleCharacters: 400,
  failedTherapyNameCharacters: 500,
  failedTherapyReasonCharacters: 1_000,
  rationaleCharacters: 1_000,
  safetyFieldCharacters: 1_000,
})

export const SCORING_EMERGENCY_REASON_FALLBACK =
  'The scoring model marked this referral as emergent; immediately review the source evidence and emergency workflow.'

export interface ScoringEmergencyEnvelope {
  emergentOverride: boolean
  emergentReason: string | null
}

const DIMENSIONS = [
  'symptom_acuity',
  'diagnostic_concern',
  'rate_of_progression',
  'functional_impairment',
  'red_flag_presence',
] as const

const SAFETY_FIELDS = [
  'safety_anticoagulation',
  'safety_symptom_onset_time',
  'safety_allergies',
  'safety_implanted_devices',
  'safety_pregnancy_status',
  'safety_recent_procedures',
  'safety_renal_function',
] as const

const MODEL_OUTPUT_FIELDS = [
  'emergent_override',
  'emergent_reason',
  'insufficient_data',
  'missing_information',
  'confidence',
  'dimension_scores',
  'red_flag_override',
  'clinical_reasons',
  'red_flags',
  'suggested_workup',
  'failed_therapies',
  'subspecialty_recommendation',
  'subspecialty_rationale',
  'redirect_to_non_neuro',
  'redirect_specialty',
  'redirect_rationale',
  ...SAFETY_FIELDS,
] as const

const CONFIDENCE_LEVELS = new Set(['high', 'moderate', 'low'] as const)
const NEUROLOGY_SERVICES = new Set<SubspecialtyType>(
  NEURO_SUBSPECIALTIES,
)
const NON_NEUROLOGY_SERVICES = new Set<NonNeuroSpecialtyType>(
  NON_NEURO_SPECIALTIES,
)

export class AITriageResponseValidationError extends Error {
  readonly name = 'AITriageResponseValidationError'

  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(`Invalid outpatient scoring response at ${field}: ${message}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedKeys = new Set(allowed)
  const unknownKey = Object.keys(value).find((key) => !allowedKeys.has(key))
  if (unknownKey) {
    throw new AITriageResponseValidationError(
      path === '$' ? unknownKey : `${path}.${unknownKey}`,
      'is not allowed by the clinical output schema',
    )
  }
}

function requireBoolean(
  value: Record<string, unknown>,
  field: string,
): boolean {
  if (typeof value[field] !== 'boolean') {
    throw new AITriageResponseValidationError(field, 'must be a boolean')
  }
  return value[field] as boolean
}

function boundedString(
  value: unknown,
  field: string,
  maxCharacters: number,
  options: { allowEmpty?: boolean } = {},
): string {
  if (typeof value !== 'string') {
    throw new AITriageResponseValidationError(field, 'must be a string')
  }
  const normalized = value.trim()
  if (!options.allowEmpty && !normalized) {
    throw new AITriageResponseValidationError(field, 'must not be blank')
  }
  if (normalized.length > maxCharacters) {
    throw new AITriageResponseValidationError(
      field,
      `must be at most ${maxCharacters} characters`,
    )
  }
  return normalized
}

function nullableBoundedString(
  value: unknown,
  field: string,
  maxCharacters: number,
): string | null {
  if (value === null) return null
  return boundedString(value, field, maxCharacters)
}

function boundedStringArray(
  value: unknown,
  field: string,
  options: { maximum: number; minimum?: number },
): string[] {
  if (!Array.isArray(value)) {
    throw new AITriageResponseValidationError(field, 'must be an array')
  }
  const minimum = options.minimum ?? 0
  if (value.length < minimum || value.length > options.maximum) {
    throw new AITriageResponseValidationError(
      field,
      `must contain ${minimum} to ${options.maximum} items`,
    )
  }
  return value.map((item, index) =>
    boundedString(
      item,
      `${field}[${index}]`,
      TRIAGE_MODEL_OUTPUT_LIMITS.listItemCharacters,
    ),
  )
}

function nullableBoundedStringArray(
  value: unknown,
  field: string,
): string[] | null {
  if (value === null) return null
  const normalized = boundedStringArray(value, field, {
    maximum: TRIAGE_MODEL_OUTPUT_LIMITS.missingInformation,
  })
  return normalized.length > 0 ? normalized : null
}

/**
 * Independently preserve a literal positive emergency marker before the
 * lower-stakes outpatient payload is validated. No truthy coercion is used,
 * and an absent/malformed reason is replaced only with a non-clinical review
 * instruction. This envelope may escalate safety but can never clear it.
 */
export function extractScoringEmergencyEnvelope(
  parsed: unknown,
): ScoringEmergencyEnvelope {
  if (!isRecord(parsed) || parsed.emergent_override !== true) {
    return { emergentOverride: false, emergentReason: null }
  }
  const rawReason = parsed.emergent_reason
  const normalizedReason =
    typeof rawReason === 'string' ? rawReason.trim() : ''
  return {
    emergentOverride: true,
    emergentReason:
      normalizedReason &&
      normalizedReason.length <= TRIAGE_MODEL_OUTPUT_LIMITS.rationaleCharacters
        ? normalizedReason
        : SCORING_EMERGENCY_REASON_FALLBACK,
  }
}

function normalizedDimensionScore(
  dimensionScores: Record<string, unknown>,
  dimension: (typeof DIMENSIONS)[number],
): AITriageResponse['dimension_scores'][typeof dimension] {
  const value = dimensionScores[dimension]
  const path = `dimension_scores.${dimension}`
  if (!isRecord(value)) {
    throw new AITriageResponseValidationError(path, 'must be an object')
  }
  rejectUnknownKeys(value, ['score', 'rationale'], path)
  const score = value.score
  if (
    typeof score !== 'number' ||
    !Number.isInteger(score) ||
    score < 1 ||
    score > 5
  ) {
    throw new AITriageResponseValidationError(
      `${path}.score`,
      'must be an integer from 1 through 5',
    )
  }
  return {
    score,
    rationale: boundedString(
      value.rationale,
      `${path}.rationale`,
      TRIAGE_MODEL_OUTPUT_LIMITS.dimensionRationaleCharacters,
    ),
  }
}

/**
 * Convert untrusted model JSON into the only AITriageResponse shape permitted
 * to reach scoring, persistence, rendering, or copy. Validation is strict and
 * fails closed; normalization is limited to outer whitespace and canonical
 * null/empty representations, never clinical inference.
 */
export function parseAndNormalizeAIResponse(parsed: unknown): AITriageResponse {
  if (!isRecord(parsed)) {
    throw new AITriageResponseValidationError('$', 'must be an object')
  }
  rejectUnknownKeys(parsed, MODEL_OUTPUT_FIELDS, '$')

  const emergentOverride = requireBoolean(parsed, 'emergent_override')
  const suppliedEmergentReason = nullableBoundedString(
    parsed.emergent_reason,
    'emergent_reason',
    TRIAGE_MODEL_OUTPUT_LIMITS.rationaleCharacters,
  )
  if (!emergentOverride && suppliedEmergentReason !== null) {
    throw new AITriageResponseValidationError(
      'emergent_reason',
      'must be null when emergent_override is false',
    )
  }
  const emergentReason = emergentOverride
    ? suppliedEmergentReason ?? SCORING_EMERGENCY_REASON_FALLBACK
    : null

  const insufficientData = requireBoolean(parsed, 'insufficient_data')
  const missingInformation = nullableBoundedStringArray(
    parsed.missing_information,
    'missing_information',
  )
  if (insufficientData && !missingInformation?.length) {
    throw new AITriageResponseValidationError(
      'missing_information',
      'must name at least one gap when insufficient_data is true',
    )
  }

  const confidence = parsed.confidence
  if (
    typeof confidence !== 'string' ||
    !CONFIDENCE_LEVELS.has(confidence as 'high' | 'moderate' | 'low')
  ) {
    throw new AITriageResponseValidationError(
      'confidence',
      'must be high, moderate, or low',
    )
  }

  const dimensionScores = parsed.dimension_scores
  if (!isRecord(dimensionScores)) {
    throw new AITriageResponseValidationError(
      'dimension_scores',
      'must be an object',
    )
  }
  rejectUnknownKeys(dimensionScores, DIMENSIONS, 'dimension_scores')
  const normalizedDimensions: AITriageResponse['dimension_scores'] = {
    symptom_acuity: normalizedDimensionScore(
      dimensionScores,
      'symptom_acuity',
    ),
    diagnostic_concern: normalizedDimensionScore(
      dimensionScores,
      'diagnostic_concern',
    ),
    rate_of_progression: normalizedDimensionScore(
      dimensionScores,
      'rate_of_progression',
    ),
    functional_impairment: normalizedDimensionScore(
      dimensionScores,
      'functional_impairment',
    ),
    red_flag_presence: normalizedDimensionScore(
      dimensionScores,
      'red_flag_presence',
    ),
  }

  const failedTherapiesRaw = parsed.failed_therapies
  if (
    !Array.isArray(failedTherapiesRaw) ||
    failedTherapiesRaw.length > TRIAGE_MODEL_OUTPUT_LIMITS.failedTherapies
  ) {
    throw new AITriageResponseValidationError(
      'failed_therapies',
      `must be an array of at most ${TRIAGE_MODEL_OUTPUT_LIMITS.failedTherapies} items`,
    )
  }
  const failedTherapies = failedTherapiesRaw.map((item, index) => {
    const path = `failed_therapies[${index}]`
    if (!isRecord(item)) {
      throw new AITriageResponseValidationError(path, 'must be an object')
    }
    rejectUnknownKeys(item, ['therapy', 'reason_stopped'], path)
    return {
      therapy: boundedString(
        item.therapy,
        `${path}.therapy`,
        TRIAGE_MODEL_OUTPUT_LIMITS.failedTherapyNameCharacters,
      ),
      // An empty reason is canonical when the source names a failed therapy
      // without documenting why. Requiring prose here would invite invention.
      reason_stopped: boundedString(
        item.reason_stopped,
        `${path}.reason_stopped`,
        TRIAGE_MODEL_OUTPUT_LIMITS.failedTherapyReasonCharacters,
        { allowEmpty: true },
      ),
    }
  })

  const suggestedWorkup = boundedStringArray(
    parsed.suggested_workup,
    'suggested_workup',
    { maximum: TRIAGE_MODEL_OUTPUT_LIMITS.suggestedWorkup },
  )
  const workupMustBeSuppressed = emergentOverride || insufficientData
  if (workupMustBeSuppressed && suggestedWorkup.length !== 0) {
    throw new AITriageResponseValidationError(
      'suggested_workup',
      'must be empty for emergent or insufficient-data responses',
    )
  }

  const subspecialtyRecommendation = parsed.subspecialty_recommendation
  if (
    typeof subspecialtyRecommendation !== 'string' ||
    !NEUROLOGY_SERVICES.has(subspecialtyRecommendation as SubspecialtyType)
  ) {
    throw new AITriageResponseValidationError(
      'subspecialty_recommendation',
      'must be a governed neurology service',
    )
  }
  const subspecialtyRationale = boundedString(
    parsed.subspecialty_rationale,
    'subspecialty_rationale',
    TRIAGE_MODEL_OUTPUT_LIMITS.rationaleCharacters,
  )

  const redirectToNonNeuro = requireBoolean(
    parsed,
    'redirect_to_non_neuro',
  )
  const redirectSpecialtyRaw = parsed.redirect_specialty
  const redirectRationale = nullableBoundedString(
    parsed.redirect_rationale,
    'redirect_rationale',
    TRIAGE_MODEL_OUTPUT_LIMITS.rationaleCharacters,
  )
  let redirectSpecialty: NonNeuroSpecialtyType | null = null
  if (redirectToNonNeuro) {
    if (
      typeof redirectSpecialtyRaw !== 'string' ||
      !NON_NEUROLOGY_SERVICES.has(
        redirectSpecialtyRaw as NonNeuroSpecialtyType,
      )
    ) {
      throw new AITriageResponseValidationError(
        'redirect_specialty',
        'must be a governed non-neurology service when redirect is true',
      )
    }
    if (!redirectRationale) {
      throw new AITriageResponseValidationError(
        'redirect_rationale',
        'is required when redirect_to_non_neuro is true',
      )
    }
    redirectSpecialty = redirectSpecialtyRaw as NonNeuroSpecialtyType
  } else if (redirectSpecialtyRaw !== null) {
    throw new AITriageResponseValidationError(
      'redirect_specialty',
      'must be null when redirect_to_non_neuro is false',
    )
  } else if (redirectRationale !== null) {
    throw new AITriageResponseValidationError(
      'redirect_rationale',
      'must be null when redirect_to_non_neuro is false',
    )
  }

  return {
    emergent_override: emergentOverride,
    emergent_reason: emergentReason,
    insufficient_data: insufficientData,
    missing_information: missingInformation,
    confidence: confidence as AITriageResponse['confidence'],
    dimension_scores: normalizedDimensions,
    red_flag_override: requireBoolean(parsed, 'red_flag_override'),
    clinical_reasons: boundedStringArray(
      parsed.clinical_reasons,
      'clinical_reasons',
      {
        minimum: 1,
        maximum: TRIAGE_MODEL_OUTPUT_LIMITS.clinicalReasons,
      },
    ),
    red_flags: boundedStringArray(parsed.red_flags, 'red_flags', {
      maximum: TRIAGE_MODEL_OUTPUT_LIMITS.redFlags,
    }),
    suggested_workup: suggestedWorkup,
    failed_therapies: failedTherapies,
    subspecialty_recommendation:
      subspecialtyRecommendation as SubspecialtyType,
    subspecialty_rationale: subspecialtyRationale,
    redirect_to_non_neuro: redirectToNonNeuro,
    redirect_specialty: redirectSpecialty,
    redirect_rationale: redirectToNonNeuro ? redirectRationale : null,
    safety_anticoagulation: nullableBoundedString(
      parsed.safety_anticoagulation,
      'safety_anticoagulation',
      TRIAGE_MODEL_OUTPUT_LIMITS.safetyFieldCharacters,
    ),
    safety_symptom_onset_time: nullableBoundedString(
      parsed.safety_symptom_onset_time,
      'safety_symptom_onset_time',
      TRIAGE_MODEL_OUTPUT_LIMITS.safetyFieldCharacters,
    ),
    safety_allergies: nullableBoundedString(
      parsed.safety_allergies,
      'safety_allergies',
      TRIAGE_MODEL_OUTPUT_LIMITS.safetyFieldCharacters,
    ),
    safety_implanted_devices: nullableBoundedString(
      parsed.safety_implanted_devices,
      'safety_implanted_devices',
      TRIAGE_MODEL_OUTPUT_LIMITS.safetyFieldCharacters,
    ),
    safety_pregnancy_status: nullableBoundedString(
      parsed.safety_pregnancy_status,
      'safety_pregnancy_status',
      TRIAGE_MODEL_OUTPUT_LIMITS.safetyFieldCharacters,
    ),
    safety_recent_procedures: nullableBoundedString(
      parsed.safety_recent_procedures,
      'safety_recent_procedures',
      TRIAGE_MODEL_OUTPUT_LIMITS.safetyFieldCharacters,
    ),
    safety_renal_function: nullableBoundedString(
      parsed.safety_renal_function,
      'safety_renal_function',
      TRIAGE_MODEL_OUTPUT_LIMITS.safetyFieldCharacters,
    ),
  }
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

export function mapScoreToTier(weightedScore: number): OutpatientTriageTier {
  if (weightedScore >= 4.0) return 'urgent'
  if (weightedScore >= 3.0) return 'semi_urgent'
  if (weightedScore >= 2.5) return 'routine_priority'
  if (weightedScore >= 1.5) return 'routine'
  return 'non_urgent'
}

const OUTPATIENT_ORDER: OutpatientTriageTier[] = [
  'urgent',
  'semi_urgent',
  'routine_priority',
  'routine',
  'non_urgent',
]

function moreUrgentOutpatientTier(
  a: OutpatientTriageTier,
  b: OutpatientTriageTier,
): OutpatientTriageTier {
  return OUTPATIENT_ORDER.indexOf(a) <= OUTPATIENT_ORDER.indexOf(b) ? a : b
}

export function calculateTriageDecision(aiResponse: AITriageResponse): TriageDecisionState {
  const weightedScore = calculateWeightedScore(aiResponse.dimension_scores)
  let outpatientPriority = mapScoreToTier(weightedScore)
  const appliedFloors: string[] = []
  const scores = aiResponse.dimension_scores

  if (aiResponse.red_flag_override) {
    appliedFloors.push('red_flag_override')
  }
  if (scores.red_flag_presence.score >= 4) {
    appliedFloors.push('red_flag_presence_urgent')
  }
  if (scores.symptom_acuity.score === 5) {
    appliedFloors.push('symptom_acuity_5_urgent')
  }
  if (scores.diagnostic_concern.score === 5) {
    appliedFloors.push('diagnostic_concern_5_urgent')
  }
  if (scores.rate_of_progression.score === 5) {
    appliedFloors.push('rate_of_progression_5_urgent')
  }

  const urgentFloorCount = appliedFloors.length

  if (scores.symptom_acuity.score >= 4) {
    appliedFloors.push('symptom_acuity_4_semi_urgent')
  }
  if (scores.diagnostic_concern.score >= 4) {
    appliedFloors.push('diagnostic_concern_4_semi_urgent')
  }

  const hasUrgentFloor = urgentFloorCount > 0
  const hasSemiUrgentFloor = appliedFloors.length > urgentFloorCount

  if (hasUrgentFloor) {
    outpatientPriority = moreUrgentOutpatientTier(outpatientPriority, 'urgent')
  } else if (hasSemiUrgentFloor) {
    outpatientPriority = moreUrgentOutpatientTier(outpatientPriority, 'semi_urgent')
  }

  const dataQuality: DataQuality = aiResponse.insufficient_data ? 'insufficient' : 'sufficient'
  const carePathway: CarePathway = aiResponse.emergent_override
    ? 'emergency_now'
    : outpatientPriority === 'urgent' || outpatientPriority === 'semi_urgent'
      ? 'expedited_outpatient'
      : 'routine_outpatient'
  const reviewRequirement: ReviewRequirement = aiResponse.emergent_override
    ? 'emergency_action'
    : 'clinician_confirmation'

  return {
    carePathway,
    outpatientPriority,
    dataQuality,
    reviewRequirement,
    schedulingLocked: true,
    weightedScore,
    appliedFloors,
  }
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
  try {
    parseAndNormalizeAIResponse(parsed)
    return null
  } catch (error) {
    return error instanceof Error
      ? error.message
      : 'Invalid outpatient scoring response'
  }
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

  const decision = calculateTriageDecision(aiResponse)

  // Missingness remains independent of urgency. Preserve a safety floor even
  // when the referral lacks enough information for ordinary score-only triage.
  if (aiResponse.insufficient_data && decision.appliedFloors.length === 0) {
    return {
      tier: 'insufficient_data',
      display: formatTierDisplay('insufficient_data'),
      weightedScore: null,
    }
  }

  const tier = decision.outpatientPriority
  return {
    tier,
    display: formatTierDisplay(tier, aiResponse.red_flag_override),
    weightedScore: decision.weightedScore,
  }
}
