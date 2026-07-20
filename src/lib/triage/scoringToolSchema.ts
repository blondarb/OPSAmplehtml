/**
 * JSON Schema for the outpatient triage scorer's structured output, used with
 * the strict Bedrock tool path (`invokeBedrockClinicalTool`).
 *
 * Purpose: force the model to emit a single well-formed JSON object instead of
 * the text-JSON path, whose strict `JSON.parse` fails whenever Sonnet wraps the
 * payload in markdown fences or preamble (the root cause of intermittent
 * outpatient-scoring "invalid JSON" holds / false-holds).
 *
 * Scope: this schema enforces STRUCTURE (field presence, primitive types,
 * array/object shapes) only. Enum membership, the 1–5 dimension range, unknown
 * keys, and every other clinical constraint are still validated — unchanged —
 * by `parseAndNormalizeAIResponse` downstream. Enum-valued fields are typed as
 * `string` here on purpose, so a valid-but-unlisted model value is never
 * rejected at the tool boundary (which would create a NEW hold); the existing
 * validator owns that decision. Keep this schema in lockstep with the
 * `AITriageResponse` interface in `./types`.
 */

const NULLABLE_STRING = { type: ['string', 'null'] } as const

const DIMENSION_SCORE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    score: { type: 'integer', minimum: 1, maximum: 5 },
    rationale: { type: 'string' },
  },
  required: ['score', 'rationale'],
} as const

export const TRIAGE_SCORING_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    emergent_override: { type: 'boolean' },
    emergent_reason: NULLABLE_STRING,
    insufficient_data: { type: 'boolean' },
    missing_information: {
      type: ['array', 'null'],
      items: { type: 'string' },
    },
    confidence: { type: 'string' },
    dimension_scores: {
      type: 'object',
      additionalProperties: false,
      properties: {
        symptom_acuity: DIMENSION_SCORE,
        diagnostic_concern: DIMENSION_SCORE,
        rate_of_progression: DIMENSION_SCORE,
        functional_impairment: DIMENSION_SCORE,
        red_flag_presence: DIMENSION_SCORE,
      },
      required: [
        'symptom_acuity',
        'diagnostic_concern',
        'rate_of_progression',
        'functional_impairment',
        'red_flag_presence',
      ],
    },
    red_flag_override: { type: 'boolean' },
    clinical_reasons: { type: 'array', items: { type: 'string' } },
    red_flags: { type: 'array', items: { type: 'string' } },
    suggested_workup: { type: 'array', items: { type: 'string' } },
    failed_therapies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          therapy: { type: 'string' },
          reason_stopped: { type: 'string' },
        },
        required: ['therapy', 'reason_stopped'],
      },
    },
    subspecialty_recommendation: { type: 'string' },
    subspecialty_rationale: { type: 'string' },
    redirect_to_non_neuro: { type: 'boolean' },
    redirect_specialty: NULLABLE_STRING,
    redirect_rationale: NULLABLE_STRING,
    safety_anticoagulation: NULLABLE_STRING,
    safety_symptom_onset_time: NULLABLE_STRING,
    safety_allergies: NULLABLE_STRING,
    safety_implanted_devices: NULLABLE_STRING,
    safety_pregnancy_status: NULLABLE_STRING,
    safety_recent_procedures: NULLABLE_STRING,
    safety_renal_function: NULLABLE_STRING,
  },
  required: [
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
    'safety_anticoagulation',
    'safety_symptom_onset_time',
    'safety_allergies',
    'safety_implanted_devices',
    'safety_pregnancy_status',
    'safety_recent_procedures',
    'safety_renal_function',
  ],
}
