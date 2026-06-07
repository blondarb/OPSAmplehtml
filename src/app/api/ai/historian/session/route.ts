import { NextResponse } from 'next/server'
import { buildHistorianSystemPrompt, getHistorianToolDefinition } from '@/lib/historianPrompts'
import type { HistorianSessionType } from '@/lib/historianTypes'
import { getTurnDetectionConfig } from '@/lib/historianTypes'
import { getOpenAIKey } from '@/lib/secrets'
import { getConsult, markHistorianStarted } from '@/lib/consult/pipeline'
import { buildHistorianContextFromConsult } from '@/lib/consult/contextBuilder'
import { buildWhisperBiasPrompt, isAsrBiasingEnabled } from '@/lib/asr/clinical-lexicon'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const sessionType: HistorianSessionType = body.sessionType || 'new_patient'
    let referralReason: string | undefined = body.referralReason
    let patientContext: string | undefined = body.patientContext

    // Phase 1 pipeline: enrich the historian context with triage + intake from
    // the consult record. Caller-provided values are overridden when a consult
    // is found — the pipeline data is more authoritative.
    const consultId: string | undefined = body.consult_id
    if (consultId) {
      try {
        const consult = await getConsult(consultId)
        if (consult) {
          const consultContext = buildHistorianContextFromConsult(consult)
          referralReason = consultContext.referralReason
          patientContext = consultContext.patientContext
          await markHistorianStarted(consultId)
        }
      } catch (pipelineErr) {
        console.error('[historian/session] consult context build error (non-fatal):', pipelineErr)
      }
    }

    const apiKey = await getOpenAIKey()
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured.' },
        { status: 500 },
      )
    }

    const instructions = buildHistorianSystemPrompt(sessionType, referralReason, patientContext)
    const tools = getHistorianToolDefinition()
    const model = process.env.OPENAI_HISTORIAN_REALTIME_MODEL || 'gpt-realtime-2'
    const turnDetection = getTurnDetectionConfig(process.env.HISTORIAN_TURN_DETECTION_MODE)

    // Bias ASR toward neurology vocabulary (drug names, anatomy, scales) so the
    // high-stakes words general ASR misses transcribe correctly. Hot-revertable
    // via ASR_VOCAB_BIASING. See docs/plans/2026-06-07-asr-vocabulary-biasing-spec.md
    const transcription: { model: string; prompt?: string } = { model: 'whisper-1' }
    if (isAsrBiasingEnabled()) {
      transcription.prompt = buildWhisperBiasPrompt()
    }

    // Request an ephemeral client_secret from OpenAI's current GA endpoint.
    // Replaces the deprecated POST /v1/realtime/sessions flow.
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model,
          instructions,
          audio: {
            input: {
              turn_detection: turnDetection,
              transcription,
            },
            output: { voice: 'verse' },
          },
          tools,
        },
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[historian/session] OpenAI client_secrets error:', response.status, errorBody)
      // Pass the raw OpenAI error body through — do NOT collapse to a generic
      // string. Today's "Failed to create realtime session: 400" hides root causes.
      return NextResponse.json(
        {
          error: `OpenAI Realtime API returned ${response.status}`,
          openai_error: errorBody,
          status: response.status,
        },
        { status: response.status },
      )
    }

    const data = await response.json()

    return NextResponse.json({
      // Shape unchanged from client's perspective
      ephemeralKey: data.value ?? data.client_secret?.value,
      sessionId: data.session_id ?? data.id,
      expiresAt: data.expires_at ?? data.client_secret?.expires_at,
      consult_id: consultId || null,
      // Pass the resolved model + turn detection mode back so the client knows
      // exactly which configuration is active (for debugging + analytics)
      model,
      turn_detection_mode: turnDetection.type,
      // Phase 5 of 2026-05-27 historian upgrade: expose the resolved
      // instructions so the client can re-serialize them when pushing
      // Localizer context updates (BASE_PROMPT + delta).
      base_instructions: instructions,
    })
  } catch (error: any) {
    console.error('[historian/session] API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to create historian session' },
      { status: 500 },
    )
  }
}
