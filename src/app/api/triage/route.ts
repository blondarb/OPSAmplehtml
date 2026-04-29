import { NextResponse } from 'next/server'
import { invokeBedrockJSONStreaming, BEDROCK_MODEL } from '@/lib/bedrock'
import { calculateTriageTier, validateAIResponse } from '@/lib/triage/scoring'
import { TRIAGE_SYSTEM_PROMPT, buildTriageUserPrompt } from '@/lib/triage/systemPrompt'
import { AITriageResponse, DISCLAIMER_TEXT } from '@/lib/triage/types'
import { from } from '@/lib/db-query'
import { createConsult, linkTriageToConsult } from '@/lib/consult/pipeline'
import { deriveChiefComplaint, buildTriageSummaryForConsult } from '@/lib/consult/contextBuilder'
import { notifyTriageUrgent } from '@/lib/notifications'
import { autoScheduleFromTriage } from '@/lib/triage/autoSchedule'

const TRIAGE_MODEL = process.env.BEDROCK_TRIAGE_MODEL || BEDROCK_MODEL

// Streaming response avoids the ~28s Amplify Hosting Compute / CloudFront
// gateway timeout. We don't need a route-level abort because the gateway
// is no longer the limiting factor — Lambda's hard cap is maxDuration.
export const maxDuration = 120

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
  const createConsultFlag = body.create_consult as boolean | undefined
  const existingConsultId = body.consult_id as string | undefined

  // Synchronous input validation — return regular JSON so callers using
  // streamPostJSON fall back to the JSON path on 400.
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
      { error: 'Referral text exceeds the maximum length of 50,000 characters. Please shorten the text or use the extraction pipeline for long documents.' },
      { status: 400 },
    )
  }

  const temperature =
    typeof requestedTemp === 'number' ? Math.max(0, Math.min(1, requestedTemp)) : 0
  const textForScoring = extracted_summary || referral_text
  const userPrompt = buildTriageUserPrompt(textForScoring, {
    patientAge: patient_age,
    patientSex: patient_sex,
    referringProviderType: referring_provider_type,
  })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      let closed = false

      const sendEvent = (event: string, data: unknown) => {
        if (closed) return
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      const sendComment = (msg: string) => {
        if (closed) return
        controller.enqueue(encoder.encode(`: ${msg}\n\n`))
      }

      // Heartbeat every 5s — SSE comment lines keep CloudFront/Amplify from
      // declaring the connection idle while Bedrock generates.
      const heartbeat = setInterval(() => sendComment(`hb ${Date.now()}`), 5000)

      // Propagate client disconnects to Bedrock.
      const bedrockAbort = new AbortController()
      const onClientAbort = () => bedrockAbort.abort()
      request.signal.addEventListener('abort', onClientAbort)

      try {
        sendEvent('progress', { stage: 'started' })

        const result = await invokeBedrockJSONStreaming({
          system: TRIAGE_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
          maxTokens: 3000,
          temperature,
          signal: bedrockAbort.signal,
          model: TRIAGE_MODEL,
        })
        const parsed = result.parsed as Record<string, unknown>
        const inputTokens = result.inputTokens
        const outputTokens = result.outputTokens

        const validationError = validateAIResponse(parsed)
        if (validationError) {
          console.error('AI response validation failed:', validationError, parsed)
          sendEvent('error', {
            error: 'The triage system returned an unexpected response format. Please try again.',
          })
          return
        }

        const aiResponse = parsed as unknown as AITriageResponse
        const scoring = calculateTriageTier(aiResponse)

        sendEvent('progress', { stage: 'persisting' })

        // ── Persist triage session ─────────────────────────────────────
        let sessionId = crypto.randomUUID()
        try {
          const toJSON = (v: unknown) => (v != null ? JSON.stringify(v) : null)

          const { data: inserted, error: insertError } = await from('triage_sessions')
            .insert({
              referral_text,
              patient_age: patient_age || null,
              patient_sex: patient_sex || null,
              referring_provider_type: referring_provider_type || null,
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
              ai_model_used: TRIAGE_MODEL,
              ai_raw_response: toJSON(aiResponse),
              patient_id: patient_id || null,
              source_type: source_type || 'paste',
              source_filename: source_filename || null,
              extracted_summary: extracted_summary || null,
              extraction_confidence: extraction_confidence || null,
              note_type_detected: note_type_detected || null,
              batch_id: batch_id || null,
              fusion_group_id: fusion_group_id || null,
              ai_input_tokens: inputTokens || null,
              ai_output_tokens: outputTokens || null,
            })
            .select('id')
            .single()

          if (!insertError && inserted) {
            sessionId = inserted.id
          } else if (insertError) {
            console.error('DB insert error (non-fatal):', insertError)
          }
        } catch (err) {
          console.error('DB storage error (non-fatal):', err)
        }

        // ── Consult pipeline integration (non-fatal) ──────────────────
        let consultId: string | null = null
        try {
          const chiefComplaint = deriveChiefComplaint(
            aiResponse.clinical_reasons || [],
            referral_text,
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

          if (existingConsultId) {
            await linkTriageToConsult(existingConsultId, triageConsultData)
            consultId = existingConsultId
          } else if (createConsultFlag) {
            const consultResult = await createConsult(referral_text, triageConsultData, patient_id || undefined)
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
              referral_text,
              aiResponse.subspecialty_recommendation || '',
            ),
            patient_id || null,
          )
        } catch (notifErr) {
          console.error('Triage notification error (non-fatal):', notifErr)
        }

        // ── Auto-schedule appointment (non-fatal) ─────────────────────
        let scheduledAppointmentId: string | null = null
        if (patient_id) {
          try {
            const appt = await autoScheduleFromTriage(
              sessionId,
              scoring.tier,
              patient_id,
              aiResponse.clinical_reasons || [],
              aiResponse.subspecialty_recommendation || '',
            )
            scheduledAppointmentId = appt?.id || null
          } catch (schedErr) {
            console.error('Triage auto-schedule error (non-fatal):', schedErr)
          }
        }

        sendEvent('result', {
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
          safety_anticoagulation: aiResponse.safety_anticoagulation ?? null,
          safety_symptom_onset_time: aiResponse.safety_symptom_onset_time ?? null,
          safety_allergies: aiResponse.safety_allergies ?? null,
          safety_implanted_devices: aiResponse.safety_implanted_devices ?? null,
          safety_pregnancy_status: aiResponse.safety_pregnancy_status ?? null,
          safety_recent_procedures: aiResponse.safety_recent_procedures ?? null,
          safety_renal_function: aiResponse.safety_renal_function ?? null,
          disclaimer: DISCLAIMER_TEXT,
          consult_id: consultId,
          scheduled_appointment_id: scheduledAppointmentId,
        })
      } catch (error: unknown) {
        console.error('Triage API Error:', error)

        let message = 'An error occurred while processing your request'
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            message = 'Processing was cancelled.'
          } else {
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
        }

        sendEvent('error', { error: message })
      } finally {
        clearInterval(heartbeat)
        request.signal.removeEventListener('abort', onClientAbort)
        closed = true
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
