import { NextResponse } from 'next/server'
import { invokeBedrockJSON, BEDROCK_MODEL } from '@/lib/bedrock'
import { calculateTriageTier, validateAIResponse } from '@/lib/triage/scoring'
import { TRIAGE_SYSTEM_PROMPT, buildTriageUserPrompt } from '@/lib/triage/systemPrompt'
import { AITriageResponse, DISCLAIMER_TEXT } from '@/lib/triage/types'
import { from } from '@/lib/db-query'

const TRIAGE_MODEL = process.env.BEDROCK_TRIAGE_MODEL || BEDROCK_MODEL


export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      referral_text, patient_age, patient_sex, referring_provider_type, patient_id,
      // Phase 2 optional fields
      extracted_summary, source_type, source_filename, extraction_confidence,
      note_type_detected, batch_id, fusion_group_id,
      // Validation: optional temperature override (default 0.2)
      temperature: requestedTemp,
    } = body

    // Clamp temperature to [0, 1] range
    const temperature = typeof requestedTemp === 'number'
      ? Math.max(0, Math.min(1, requestedTemp))
      : 0.2

    // Validate input
    if (!referral_text || typeof referral_text !== 'string') {
      return NextResponse.json(
        { error: 'referral_text is required' },
        { status: 400 }
      )
    }

    if (referral_text.trim().length < 50) {
      return NextResponse.json(
        { error: 'Referral text must be at least 50 characters for meaningful triage.' },
        { status: 400 }
      )
    }

    // Cap input length to prevent excessive token usage
    if (referral_text.length > 50000) {
      return NextResponse.json(
        { error: 'Referral text exceeds the maximum length of 50,000 characters. Please shorten the text or use the extraction pipeline for long documents.' },
        { status: 400 }
      )
    }

    // Use extracted summary for scoring if provided (Phase 2 two-stage pipeline)
    const textForScoring = extracted_summary || referral_text

    // Build prompt
    const userPrompt = buildTriageUserPrompt(textForScoring, {
      patientAge: patient_age,
      patientSex: patient_sex,
      referringProviderType: referring_provider_type,
    })

    // Call Bedrock with 45-second timeout (Amplify SSR compute limit is 60s)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45000)

    let parsed: Record<string, unknown>
    try {
      const result = await invokeBedrockJSON({
        system: TRIAGE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 2500,
        temperature,
        signal: controller.signal,
        model: TRIAGE_MODEL,
      })
      parsed = result.parsed as Record<string, unknown>
    } finally {
      clearTimeout(timeout)
    }

    // Validate structure before trusting the cast
    const validationError = validateAIResponse(parsed)
    if (validationError) {
      console.error('AI response validation failed:', validationError, parsed)
      return NextResponse.json(
        { error: 'The triage system returned an unexpected response format. Please try again.' },
        { status: 500 }
      )
    }

    const aiResponse = parsed as unknown as AITriageResponse

    // Deterministic scoring — application code calculates tier
    const scoring = calculateTriageTier(aiResponse)

    // Store in Supabase
    let sessionId = crypto.randomUUID()
    try {
      const { data: inserted, error: insertError } = await from('triage_sessions')
        .insert({
          referral_text,
          patient_age: patient_age || null,
          patient_sex: patient_sex || null,
          referring_provider_type: referring_provider_type || null,
          triage_tier: scoring.tier,
          confidence: aiResponse.confidence,
          dimension_scores: aiResponse.dimension_scores,
          weighted_score: scoring.weightedScore,
          clinical_reasons: aiResponse.clinical_reasons,
          red_flags: aiResponse.red_flags,
          suggested_workup: aiResponse.suggested_workup,
          failed_therapies: aiResponse.failed_therapies,
          missing_information: aiResponse.missing_information,
          subspecialty_recommendation: aiResponse.subspecialty_recommendation,
          subspecialty_rationale: aiResponse.subspecialty_rationale,
          ai_model_used: TRIAGE_MODEL,
          ai_raw_response: aiResponse,
          patient_id: patient_id || null,
          // Phase 2 fields
          source_type: source_type || 'paste',
          source_filename: source_filename || null,
          extracted_summary: extracted_summary || null,
          extraction_confidence: extraction_confidence || null,
          note_type_detected: note_type_detected || null,
          batch_id: batch_id || null,
          fusion_group_id: fusion_group_id || null,
        })
        .select('id')
        .single()

      if (!insertError && inserted) {
        sessionId = inserted.id
      } else if (insertError) {
        console.error('Supabase insert error (non-fatal):', insertError)
      }
    } catch (err) {
      // Non-fatal — triage still works without DB storage in demo mode
      console.error('Supabase storage error (non-fatal):', err)
    }

    // Build response per playbook Section 5.3
    return NextResponse.json({
      session_id: sessionId,
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
    })
  } catch (error: unknown) {
    console.error('Triage API Error:', error)

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Processing is taking longer than expected. Please try again.' },
        { status: 504 }
      )
    }

    // Sanitize infrastructure errors — never expose AWS SDK / credential details to client
    let message = 'An error occurred while processing your request'
    if (error instanceof Error) {
      const raw = error.message
      if (raw.includes('credential') || raw.includes('Could not load') || raw.includes('AWS') || raw.includes('Bedrock')) {
        message = 'The triage service is temporarily unavailable. Please try again shortly or triage this patient manually.'
      } else {
        message = raw
      }
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
