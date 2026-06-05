import { NextResponse } from 'next/server'
import { buildHistorianSystemPrompt, getHistorianToolsForProvider } from '@/lib/historianPrompts'
import type { HistorianSessionType } from '@/lib/historianTypes'
import { getTurnDetectionConfig } from '@/lib/historianTypes'
import { getOpenAIKey } from '@/lib/secrets'
import { getConsult, markHistorianStarted } from '@/lib/consult/pipeline'
import { buildHistorianContextFromConsult } from '@/lib/consult/contextBuilder'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const sessionType: HistorianSessionType = body.sessionType || 'new_patient'
    let referralReason: string | undefined = body.referralReason
    let patientContext: string | undefined = body.patientContext

    // Provider selection: explicit client `provider` field wins, else the
    // server-side VOICE_PROVIDER env var, else default to Nova (the migration
    // target). Only 'openai' opts back into the legacy WebRTC/client_secrets path.
    const requestedProvider = (body.provider ?? process.env.VOICE_PROVIDER ?? 'nova') as string
    const provider: 'nova' | 'openai' = requestedProvider === 'openai' ? 'openai' : 'nova'

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

    const instructions = buildHistorianSystemPrompt(sessionType, referralReason, patientContext)
    const model = process.env.OPENAI_HISTORIAN_REALTIME_MODEL || 'gpt-realtime-2'
    const turnDetection = getTurnDetectionConfig(process.env.HISTORIAN_TURN_DETECTION_MODE)

    // ── Nova path: no OpenAI client_secrets call. Return relay config + the
    // Nova-native tool specs. The hook builds a NovaSonicWsProvider from this.
    if (provider === 'nova') {
      return NextResponse.json({
        provider: 'nova',
        instructions,
        tools: getHistorianToolsForProvider('nova'),
        relayUrl: process.env.NOVA_SONIC_RELAY_URL,
        voiceId: process.env.NOVA_SONIC_VOICE_ID,
        // base_instructions kept for client parity (localizer push channel).
        base_instructions: instructions,
        consult_id: consultId || null,
      })
    }

    // ── OpenAI path (unchanged client_secrets flow, plus tools/provider hints).
    const apiKey = await getOpenAIKey()
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured.' },
        { status: 500 },
      )
    }

    const tools = getHistorianToolsForProvider('openai')

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
              transcription: { model: 'whisper-1' },
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
      // Tell the client which provider/tools are active so the hook picks the
      // matching VoiceProvider and passes provider-native tools into start().
      provider: 'openai',
      tools,
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
