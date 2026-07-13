/**
 * Core triage execution — shared between the main triage API and the
 * consistency-test rerun route. Calls AWS Bedrock directly without HTTP
 * self-fetch so it works reliably on serverless (AWS Amplify / Lambda).
 */

import {
  copyBedrockTokenUsage,
  invokeBedrockClinicalJSON,
  type BedrockTokenUsage,
} from '@/lib/bedrock'
import {
  calculateTriageTier,
  extractScoringEmergencyEnvelope,
  parseAndNormalizeAIResponse,
  type ScoringEmergencyEnvelope,
} from './scoring'
import { TRIAGE_SYSTEM_PROMPT, buildTriageUserPrompt } from './systemPrompt'
import {
  AITriageResponse,
  DimensionScores,
  DISCLAIMER_TEXT,
  type FailedTherapy,
  type NonNeuroSpecialtyType,
  type SubspecialtyType,
  type TriageConfidence,
  type TriageTier,
} from './types'

export interface TriageInput {
  referral_text: string
  patient_age?: number | null
  patient_sex?: string | null
  referring_provider_type?: string | null
  temperature?: number
  /** Override the default Bedrock model ID for this triage call. */
  model?: string
}

export interface TriageResult {
  session_id: string
  triage_tier: TriageTier
  triage_tier_display: string
  confidence: TriageConfidence
  dimension_scores: DimensionScores
  weighted_score: number | null
  red_flag_override: boolean
  emergent_override: boolean
  emergent_reason: string | null
  insufficient_data: boolean
  missing_information: string[] | null
  clinical_reasons: string[]
  red_flags: string[]
  suggested_workup: string[]
  failed_therapies: FailedTherapy[]
  subspecialty_recommendation: SubspecialtyType
  subspecialty_rationale: string
  redirect_to_non_neuro: boolean
  redirect_specialty: NonNeuroSpecialtyType | null
  redirect_rationale: string | null
  disclaimer: string
}

export class AITriageModelOutputError extends Error {
  readonly name = 'AITriageModelOutputError'

  constructor(
    public readonly emergencyEnvelope: ScoringEmergencyEnvelope,
    validationMessage: string,
  ) {
    super(
      `AI response validation failed${emergencyEnvelope.emergentOverride ? ' (emergency_override=true preserved)' : ''}: ${validationMessage}`,
    )
  }
}

/**
 * Run a single triage call against AWS Bedrock Claude and return structured results.
 * Does NOT persist to DB — callers handle storage.
 */
export async function runTriage(
  input: TriageInput,
  options: { onUsage?: (usage: BedrockTokenUsage) => void } = {},
): Promise<TriageResult> {
  const temperature = typeof input.temperature === 'number'
    ? Math.max(0, Math.min(1, input.temperature))
    : 0

  const textForScoring = input.referral_text

  const userPrompt = buildTriageUserPrompt(textForScoring, {
    patientAge: input.patient_age ?? undefined,
    patientSex: input.patient_sex ?? undefined,
    referringProviderType: input.referring_provider_type ?? undefined,
  })

  // 45-second timeout
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)

  let parsed: unknown
  try {
    const result = await invokeBedrockClinicalJSON<unknown>({
      system: TRIAGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 3000,
      temperature,
      signal: controller.signal,
      model: input.model,
      cacheSystem: true,
    })
    options.onUsage?.(copyBedrockTokenUsage(result))
    parsed = result.parsed
  } finally {
    clearTimeout(timeout)
  }

  let aiResponse: AITriageResponse
  try {
    aiResponse = parseAndNormalizeAIResponse(parsed)
  } catch (error) {
    throw new AITriageModelOutputError(
      extractScoringEmergencyEnvelope(parsed),
      error instanceof Error ? error.message : 'unknown schema error',
    )
  }
  const scoring = calculateTriageTier(aiResponse)

  return {
    session_id: crypto.randomUUID(),
    triage_tier: scoring.tier,
    triage_tier_display: scoring.display,
    confidence: aiResponse.confidence,
    dimension_scores: aiResponse.dimension_scores,
    weighted_score: scoring.weightedScore,
    red_flag_override: aiResponse.red_flag_override,
    emergent_override: aiResponse.emergent_override,
    emergent_reason: aiResponse.emergent_reason,
    insufficient_data: aiResponse.insufficient_data,
    missing_information: aiResponse.missing_information,
    clinical_reasons: aiResponse.clinical_reasons,
    red_flags: aiResponse.red_flags,
    suggested_workup: aiResponse.suggested_workup,
    failed_therapies: aiResponse.failed_therapies,
    subspecialty_recommendation: aiResponse.subspecialty_recommendation,
    subspecialty_rationale: aiResponse.subspecialty_rationale,
    redirect_to_non_neuro: aiResponse.redirect_to_non_neuro,
    redirect_specialty: aiResponse.redirect_specialty,
    redirect_rationale: aiResponse.redirect_rationale,
    disclaimer: DISCLAIMER_TEXT,
  }
}
