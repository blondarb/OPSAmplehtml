/**
 * POST /api/ai/historian/session-renew
 *
 * Mints a fresh ephemeral token for an in-progress Realtime session.
 * Called by useRealtimeSession ~90 s before the current token expires
 * so the client can swap the credential without tearing down the WebRTC
 * connection — the conversation continues uninterrupted past the ~8-min cap.
 *
 * Intentionally thin: no consult enrichment, no markHistorianStarted —
 * those already ran at session create. We only need a new client_secret
 * for the same model/config so OpenAI accepts continued use of the session.
 *
 * Body:   { sessionType?: HistorianSessionType }
 * Returns { ephemeralKey, expiresAt }
 */

import { NextResponse } from 'next/server'
import type { HistorianSessionType } from '@/lib/historianTypes'
import { getTurnDetectionConfig, getNoiseReductionConfig } from '@/lib/historianTypes'
import { getOpenAIKey } from '@/lib/secrets'
import { buildHistorianSystemPrompt, getHistorianToolDefinition } from '@/lib/historianPrompts'
import { buildWhisperBiasPrompt, isAsrBiasingEnabled } from '@/lib/asr/clinical-lexicon'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const sessionType: HistorianSessionType = body.sessionType || 'new_patient'

    const apiKey = await getOpenAIKey()
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured.' },
        { status: 500 },
      )
    }

    const model = process.env.OPENAI_HISTORIAN_REALTIME_MODEL || 'gpt-realtime-2'
    const turnDetection = getTurnDetectionConfig(process.env.HISTORIAN_TURN_DETECTION_MODE)
    const noiseReduction = getNoiseReductionConfig(process.env.HISTORIAN_NOISE_REDUCTION)
    const instructions = buildHistorianSystemPrompt(sessionType)
    const tools = getHistorianToolDefinition()

    const transcription: { model: string; prompt?: string } = { model: 'whisper-1' }
    if (isAsrBiasingEnabled()) {
      transcription.prompt = buildWhisperBiasPrompt()
    }

    const buildBody = (withNoiseReduction: boolean) =>
      JSON.stringify({
        session: {
          type: 'realtime',
          model,
          instructions,
          audio: {
            input: {
              turn_detection: turnDetection,
              transcription,
              ...(withNoiseReduction && noiseReduction
                ? { noise_reduction: noiseReduction }
                : {}),
            },
            output: { voice: 'verse' },
          },
          tools,
        },
      })

    let response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: buildBody(true),
    })

    if (!response.ok && noiseReduction) {
      console.warn('[historian/session-renew] retrying without noise_reduction')
      response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: buildBody(false),
      })
    }

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[historian/session-renew] OpenAI error:', response.status, errorBody)
      return NextResponse.json(
        { error: `OpenAI returned ${response.status}`, openai_error: errorBody },
        { status: response.status },
      )
    }

    const data = await response.json()

    return NextResponse.json({
      ephemeralKey: data.value ?? data.client_secret?.value,
      expiresAt: data.expires_at ?? data.client_secret?.expires_at,
    })
  } catch (error: any) {
    console.error('[historian/session-renew] error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to renew session' },
      { status: 500 },
    )
  }
}
