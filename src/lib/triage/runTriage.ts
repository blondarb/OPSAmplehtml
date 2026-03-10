/**
 * Core triage execution — shared between the main triage API and the
 * consistency-test rerun route. Calls AWS Bedrock directly without HTTP
 * self-fetch so it works reliably on Vercel serverless.
 */

import { invokeBedrockJSON } from '@/lib/bedrock'
import { calculateTriageTier, validateAIResponse } from './scoring'
import { TRIAGE_SYSTEM_PROMPT, buildTriageUserPrompt } from './systemPrompt'
import { AITriageResponse, DimensionScores, DISCLAIMER_TEXT } from './types'

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
  triage_tier: string
  triage_tier_display: string
  confidence: string
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
  failed_therapies: unknown[]
  subspecialty_recommendation: string
  subspecialty_rationale: string
  redirect_to_non_neuro: boolean
  redirect_specialty: string | null
  redirect_rationale: string | null
  disclaimer: string
}

/**
 * Run a single triage call against AWS Bedrock Claude and return structured results.
 * Does NOT persist to Supabase — callers handle storage.
 */
export async function runTriage(input: TriageInput): Promise<TriageResult> {
  const temperature = typeof input.temperature === 'number'
    ? Math.max(0, Math.min(1, input.temperature))
    : 0.2

  const textForScoring = input.referral_text

  const userPrompt = buildTriageUserPrompt(textForScoring, {
    patientAge: input.patient_age ?? undefined,
    patientSex: input.patient_sex ?? undefined,
    referringProviderType: input.referring_provider_type ?? undefined,
  })

  // 45-second timeout
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)

  let parsed: Record<string, unknown>
  try {
    const result = await invokeBedrockJSON({
      system: TRIAGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 4000,
      temperature,
      signal: controller.signal,
      model: input.model,
    })
    parsed = result.parsed as Record<string, unknown>
  } finally {
    clearTimeout(timeout)
  }

  const validationError = validateAIResponse(parsed)
  if (validationError) {
    throw new Error(`AI response validation failed: ${validationError}`)
  }

  const aiResponse = parsed as unknown as AITriageResponse
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
    redirect_to_non_neuro: aiResponse.redirect_to_non_neuro || false,
    redirect_specialty: aiResponse.redirect_specialty || null,
    redirect_rationale: aiResponse.redirect_rationale || null,
    disclaimer: DISCLAIMER_TEXT,
  }
}
