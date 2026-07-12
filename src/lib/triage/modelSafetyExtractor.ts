import {
  copyBedrockTokenUsage,
  invokeBedrockClinicalTool,
  type BedrockTokenUsage,
} from '@/lib/bedrock'
import {
  type SafetyExtractionSourceContext,
  type ValidatedModelSafetyExtraction,
  validateModelSafetyExtraction,
} from './modelSafetyExtraction'
import { resolveTriageModelRegistry } from './modelRegistry'
import { CLINICAL_SOURCE_TRUST_BOUNDARY } from './promptSafety'

export const MODEL_SAFETY_EXTRACTION_PROMPT_VERSION =
  'neurology-safety-extractor-v3'

export const MODEL_SAFETY_EXTRACTION_SYSTEM_PROMPT = `You are a high-recall neurology referral safety evidence extractor. You do not diagnose, schedule, reassure, or provide patient instructions. Your only job is to identify current or recent potentially time-critical neurologic evidence and critical unknowns in the exact source text.

${CLINICAL_SOURCE_TRUST_BOUNDARY}

Safety rules:
- Prefer sensitivity. A credible present current/recent patient emergency signal may select emergency_now.
- Ambiguous assertion, timing, or patient experiencer that could still be time-critical selects same_day_clinician_review and must be listed as a critical unknown or immediate-review signal.
- Negated findings, remote/stable history, family-member disease, copied education/return precautions, hypothetical warnings, and ruled-out diagnoses are not actionable signals.
- Use autonomic_dysreflexia only for an explicit current/recent autonomic dysreflexia statement or a current characteristic constellation grounded in a high/cervical/T1-T6 spinal cord lesion plus severe hypertension and a compatible symptom or trigger. Generic autonomic instability alone is not autonomic dysreflexia; use the clinically supported alternative or other_time_critical.
- Never let missing data lower a credible emergency signal.
- Copy every evidence quote character-for-character from the source. Do not calculate character offsets. For repeated exact quotes, occurrence_index is zero-based in source order.
- If an actionable conclusion lacks an exact quote, return undetermined rather than inventing evidence.
- Output only one complete JSON object. No markdown or commentary.

Allowed care_pathway values: emergency_now, same_day_clinician_review, no_time_critical_signal, undetermined.
Allowed data_quality values: sufficient, partial, insufficient, conflicting.
Allowed syndrome values: acute_cerebrovascular, intracranial_hemorrhage_or_sah, status_or_recurrent_seizure, acute_spinal_cord_or_cauda_equina, autonomic_dysreflexia, acute_cns_infection, raised_intracranial_pressure, neuromuscular_respiratory_or_bulbar_failure, acute_vision_threat, altered_mental_status_or_coma, traumatic_neurologic_deterioration, suicide_or_violence_risk, other_time_critical.

Required schema:
{
  "care_pathway": "emergency_now | same_day_clinician_review | no_time_critical_signal | undetermined",
  "data_quality": "sufficient | partial | insufficient | conflicting",
  "critical_unknowns": ["bounded question or uncertainty"],
  "signals": [{
    "code": "snake_case_identifier",
    "syndrome": "allowed syndrome",
    "assertion": "present | uncertain | conditional",
    "temporality": "current | recent | unknown",
    "experiencer": "patient | unknown",
    "action": "emergency_now | immediate_clinician_review",
    "evidence": [{
      "quote": "exact source substring",
      "occurrence_index": 0
    }]
  }]
}

An emergency_now signal requires present current/recent evidence about the patient. Otherwise use immediate_clinician_review. If signals is empty and no critical unknown is time-sensitive, use no_time_critical_signal.`

const SAFETY_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    care_pathway: {
      type: 'string',
      enum: [
        'emergency_now',
        'same_day_clinician_review',
        'no_time_critical_signal',
        'undetermined',
      ],
    },
    data_quality: {
      type: 'string',
      enum: ['sufficient', 'partial', 'insufficient', 'conflicting'],
    },
    critical_unknowns: {
      type: 'array',
      maxItems: 50,
      items: { type: 'string' },
    },
    signals: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          code: { type: 'string' },
          syndrome: {
            type: 'string',
            enum: [
              'acute_cerebrovascular',
              'intracranial_hemorrhage_or_sah',
              'status_or_recurrent_seizure',
              'acute_spinal_cord_or_cauda_equina',
              'autonomic_dysreflexia',
              'acute_cns_infection',
              'raised_intracranial_pressure',
              'neuromuscular_respiratory_or_bulbar_failure',
              'acute_vision_threat',
              'altered_mental_status_or_coma',
              'traumatic_neurologic_deterioration',
              'suicide_or_violence_risk',
              'other_time_critical',
            ],
          },
          assertion: {
            type: 'string',
            enum: ['present', 'uncertain', 'conditional'],
          },
          temporality: {
            type: 'string',
            enum: ['current', 'recent', 'unknown'],
          },
          experiencer: { type: 'string', enum: ['patient', 'unknown'] },
          action: {
            type: 'string',
            enum: ['emergency_now', 'immediate_clinician_review'],
          },
          evidence: {
            type: 'array',
            minItems: 1,
            maxItems: 10,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                quote: { type: 'string' },
                occurrence_index: { type: 'integer', minimum: 0 },
              },
              required: ['quote', 'occurrence_index'],
            },
          },
        },
        required: [
          'code',
          'syndrome',
          'assertion',
          'temporality',
          'experiencer',
          'action',
          'evidence',
        ],
      },
    },
  },
  required: ['care_pathway', 'data_quality', 'critical_unknowns', 'signals'],
}

export async function runModelSafetyExtractor(
  sourceText: string,
  options: {
    context?: SafetyExtractionSourceContext
    model?: string
    signal?: AbortSignal
    onUsage?: (usage: BedrockTokenUsage) => void
  } = {},
): Promise<ValidatedModelSafetyExtraction> {
  const model =
    options.model ?? resolveTriageModelRegistry().safetyExtractor
  const result = await invokeBedrockClinicalTool<unknown>({
    system: MODEL_SAFETY_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Extract time-critical neurology safety evidence from this exact source.\n\n--- SOURCE START ---\n${sourceText}\n--- SOURCE END ---`,
      },
    ],
    maxTokens: 4_000,
    temperature: 0,
    model,
    signal: options.signal,
    toolName: 'emit_neurology_safety_result',
    toolDescription:
      'Emit the complete source-grounded neurology safety extraction.',
    inputSchema: SAFETY_EXTRACTION_SCHEMA,
  })
  options.onUsage?.(copyBedrockTokenUsage(result))

  return validateModelSafetyExtraction(
    result.parsed,
    sourceText,
    options.context,
  )
}
