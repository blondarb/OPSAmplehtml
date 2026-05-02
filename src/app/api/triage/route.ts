import { NextResponse } from 'next/server'
import { invokeBedrockJSON, BEDROCK_MODEL } from '@/lib/bedrock'
import { calculateTriageTier, validateAIResponse } from '@/lib/triage/scoring'
import { TRIAGE_SYSTEM_PROMPT, buildTriageUserPrompt } from '@/lib/triage/systemPrompt'
import { AITriageResponse } from '@/lib/triage/types'
import { from } from '@/lib/db-query'
import { createConsult, linkTriageToConsult } from '@/lib/consult/pipeline'
import { deriveChiefComplaint, buildTriageSummaryForConsult } from '@/lib/consult/contextBuilder'
import { notifyTriageUrgent } from '@/lib/notifications'
import { autoScheduleFromTriage } from '@/lib/triage/autoSchedule'
import { runInBackground } from '@/lib/triage/asyncRunner'

const TRIAGE_MODEL = process.env.BEDROCK_TRIAGE_MODEL || BEDROCK_MODEL

// Lambda must stay alive for Bedrock + DB writes after the 202 is sent.
// 120s gives plenty of headroom for the typical 25-40s total work.
export const maxDuration = 120

interface TriageBackgroundParams {
  textForScoring: string
  patient_age?: number
  patient_sex?: string
  referring_provider_type?: string
  patient_id?: string
  referral_text: string
  temperature: number
  createConsultFlag: boolean
  existingConsultId?: string
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const referral_text = body.referral_text as string | undefined
  const patient_age = body.patient_age as number | undefined
  const patient_sex = body.patient_sex as string | undefined
  const referring_provider_type = body.referring_provider_type as string | undefined
  const patient_id = body.patient_id as string | undefined
  const extracted_summary = body.extracted_summary as string | undefined
  const source_type = body.source_type as string | undefined
  const source_filename = body.source_filename as string | undefined
  const extraction_confidence = body.extraction_confidence as string | undefined
  const note_type_detected = body.note_type_detected as string | undefined
  const batch_id = body.batch_id as string | undefined
  const fusion_group_id = body.fusion_group_id as string | undefined
  const requestedTemp = body.temperature as number | undefined
  const createConsultFlag = (body.create_consult as boolean | undefined) ?? false
  const existingConsultId = body.consult_id as string | undefined

  // Synchronous input validation — return 400 JSON for client errors.
  if (!referral_text || typeof referral_text !== 'string') {
    return NextResponse.json({ error: 'referral_text is required' }, { status: 400 })
  }
  if (referral_text.trim().length < 50) {
    return NextResponse.json(
      { error: 'Referral text must be at least 50 characters for meaningful triage.' },
      { status: 400 },
    )
  }
  if (referral_text.length > 50000) {
    return NextResponse.json(
      {
        error:
          'Referral text exceeds the maximum length of 50,000 characters. Please shorten the text or use the extraction pipeline for long documents.',
      },
      { status: 400 },
    )
  }

  const temperature =
    typeof requestedTemp === 'number' ? Math.max(0, Math.min(1, requestedTemp)) : 0

  // Insert pending session row. The id is the polling handle.
  const { data: inserted, error: insertError } = await from('triage_sessions')
    .insert({
      referral_text,
      patient_age: patient_age ?? null,
      patient_sex: patient_sex ?? null,
      referring_provider_type: referring_provider_type ?? null,
      patient_id: patient_id ?? null,
      source_type: source_type ?? 'paste',
      source_filename: source_filename ?? null,
      extracted_summary: extracted_summary ?? null,
      extraction_confidence: extraction_confidence ?? null,
      note_type_detected: note_type_detected ?? null,
      batch_id: batch_id ?? null,
      fusion_group_id: fusion_group_id ?? null,
      ai_model_used: TRIAGE_MODEL,
      processing_status: 'pending',
    })
    .select('id')
    .single()

  if (insertError || !inserted?.id) {
    console.error('Triage init insert failed:', insertError)
    return NextResponse.json(
      { error: 'Could not start triage. Please try again.' },
      { status: 500 },
    )
  }

  const sessionId = inserted.id as string

  // Fire-and-forget. Lambda keeps running until this resolves (or hits maxDuration).
  runInBackground(() =>
    processTriageInBackground(sessionId, {
      referral_text,
      textForScoring: extracted_summary || referral_text,
      patient_age,
      patient_sex,
      referring_provider_type,
      patient_id,
      temperature,
      createConsultFlag,
      existingConsultId,
    }),
  )

  return NextResponse.json(
    { session_id: sessionId, status: 'pending' },
    { status: 202 },
  )
}

async function processTriageInBackground(
  sessionId: string,
  params: TriageBackgroundParams,
): Promise<void> {
  try {
    const userPrompt = buildTriageUserPrompt(params.textForScoring, {
      patientAge: params.patient_age,
      patientSex: params.patient_sex,
      referringProviderType: params.referring_provider_type,
    })

    const result = await invokeBedrockJSON({
      system: TRIAGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 3000,
      temperature: params.temperature,
      model: TRIAGE_MODEL,
    })

    const validationError = validateAIResponse(result.parsed as Record<string, unknown>)
    if (validationError) {
      console.error('AI response validation failed:', validationError, result.parsed)
      await markError(
        sessionId,
        'The triage system returned an unexpected response format. Please try again.',
      )
      return
    }

    const aiResponse = result.parsed as unknown as AITriageResponse
    const scoring = calculateTriageTier(aiResponse)
    const toJSON = (v: unknown) => (v != null ? JSON.stringify(v) : null)

    // Write the AI result + scoring before kicking off downstream pipeline steps,
    // so the client can poll and read a complete row even if pipeline steps fail.
    await from('triage_sessions')
      .update({
        triage_tier: scoring.tier,
        confidence: aiResponse.confidence,
        dimension_scores: toJSON(aiResponse.dimension_scores),
        weighted_score: scoring.weightedScore,
        clinical_reasons: toJSON(aiResponse.clinical_reasons),
        red_flags: toJSON(aiResponse.red_flags),
        suggested_workup: toJSON(aiResponse.suggested_workup),
        failed_therapies: toJSON(aiResponse.failed_therapies),
        missing_information: toJSON(aiResponse.missing_information),
        subspecialty_recommendation: aiResponse.subspecialty_recommendation,
        subspecialty_rationale: aiResponse.subspecialty_rationale,
        ai_raw_response: toJSON(aiResponse),
        ai_input_tokens: result.inputTokens ?? null,
        ai_output_tokens: result.outputTokens ?? null,
        processing_status: 'complete',
        completed_at: new Date(),
      })
      .eq('id', sessionId)

    // ── Consult pipeline integration (non-fatal) ──────────────────
    let consultId: string | null = null
    try {
      const chiefComplaint = deriveChiefComplaint(
        aiResponse.clinical_reasons || [],
        params.referral_text,
        aiResponse.subspecialty_recommendation || '',
      )
      const triageSummary = buildTriageSummaryForConsult(
        scoring.display,
        aiResponse.clinical_reasons || [],
        aiResponse.suggested_workup || [],
        aiResponse.subspecialty_recommendation || '',
        aiResponse.subspecialty_rationale || '',
      )
      const triageConsultData = {
        triage_session_id: sessionId,
        triage_urgency: scoring.tier,
        triage_tier_display: scoring.display,
        triage_summary: triageSummary,
        triage_chief_complaint: chiefComplaint,
        triage_red_flags: aiResponse.red_flags || [],
        triage_subspecialty: aiResponse.subspecialty_recommendation || '',
      }

      if (params.existingConsultId) {
        await linkTriageToConsult(params.existingConsultId, triageConsultData)
        consultId = params.existingConsultId
      } else if (params.createConsultFlag) {
        const consultResult = await createConsult(
          params.referral_text,
          triageConsultData,
          params.patient_id || undefined,
        )
        consultId = consultResult.data?.id || null
      }
    } catch (consultErr) {
      console.error('Consult pipeline integration error (non-fatal):', consultErr)
    }

    // ── Urgent triage notification (non-fatal) ────────────────────
    try {
      await notifyTriageUrgent(
        sessionId,
        scoring.tier,
        scoring.display,
        deriveChiefComplaint(
          aiResponse.clinical_reasons || [],
          params.referral_text,
          aiResponse.subspecialty_recommendation || '',
        ),
        params.patient_id || null,
      )
    } catch (notifErr) {
      console.error('Triage notification error (non-fatal):', notifErr)
    }

    // ── Auto-schedule appointment (non-fatal) ─────────────────────
    let scheduledAppointmentId: string | null = null
    if (params.patient_id) {
      try {
        const appt = await autoScheduleFromTriage(
          sessionId,
          scoring.tier,
          params.patient_id,
          aiResponse.clinical_reasons || [],
          aiResponse.subspecialty_recommendation || '',
        )
        scheduledAppointmentId = appt?.id || null
      } catch (schedErr) {
        console.error('Triage auto-schedule error (non-fatal):', schedErr)
      }
    }

    // Persist the derived ids so the polling GET can return them.
    if (consultId || scheduledAppointmentId) {
      try {
        await from('triage_sessions')
          .update({
            consult_id: consultId,
            scheduled_appointment_id: scheduledAppointmentId,
          })
          .eq('id', sessionId)
      } catch (e) {
        console.error('Failed to persist consult_id/scheduled_appointment_id:', e)
      }
    }
  } catch (error: unknown) {
    console.error('Background triage failed:', error)
    let message = 'An error occurred while processing your request'
    if (error instanceof Error) {
      const raw = error.message
      if (
        raw.includes('credential') ||
        raw.includes('Could not load') ||
        raw.includes('AWS') ||
        raw.includes('Bedrock')
      ) {
        message =
          'The triage service is temporarily unavailable. Please try again shortly or triage this patient manually.'
      } else {
        message = raw
      }
    }
    await markError(sessionId, message)
  }
}

async function markError(sessionId: string, message: string): Promise<void> {
  try {
    await from('triage_sessions')
      .update({
        processing_status: 'error',
        error_message: message,
        completed_at: new Date(),
      })
      .eq('id', sessionId)
  } catch (e) {
    console.error('Failed to mark triage_sessions row as error:', e)
  }
}
