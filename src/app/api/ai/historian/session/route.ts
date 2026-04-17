import { NextResponse } from 'next/server'
import { buildHistorianSystemPrompt, getHistorianToolDefinition } from '@/lib/historianPrompts'
import type { HistorianSessionType } from '@/lib/historianTypes'
import { getOpenAIKey } from '@/lib/secrets'
import { getConsult, markHistorianStarted } from '@/lib/consult/pipeline'
import { buildHistorianContextFromConsult } from '@/lib/consult/contextBuilder'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const sessionType: HistorianSessionType = body.sessionType || 'new_patient'
    let referralReason: string | undefined = body.referralReason
    let patientContext: string | undefined = body.patientContext

    // Phase 1 pipeline: if a consult_id is provided, enrich the historian
    // context with triage and intake data from the consult record.
    // Caller-provided referralReason/patientContext are overridden when a
    // consult is found — the pipeline data is more authoritative.
    const consultId: string | undefined = body.consult_id
    if (consultId) {
      try {
        const consult = await getConsult(consultId)
        if (consult) {
          const consultContext = buildHistorianContextFromConsult(consult)
          referralReason = consultContext.referralReason
          patientContext = consultContext.patientContext

          // Mark the consult as historian in progress (non-fatal)
          await markHistorianStarted(consultId)
        }
      } catch (pipelineErr) {
        // Non-fatal — historian still starts with whatever context was passed
        console.error('[historian/session] consult context build error (non-fatal):', pipelineErr)
      }
    }

    // Get OpenAI API key
    const apiKey = await getOpenAIKey()
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured.' },
        { status: 500 },
      )
    }

    // Build the system prompt
    const instructions = buildHistorianSystemPrompt(sessionType, referralReason, patientContext)
    const tool = getHistorianToolDefinition()

    // Request ephemeral token from OpenAI Realtime API
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-realtime',
        voice: 'verse',
        instructions,
        input_audio_transcription: {
          model: 'whisper-1',
        },
        // Tuned to reduce mid-sentence interruptions when users listen on
        // speakerphone (AI voice bleeds back into the mic) and to prevent
        // short pauses from being treated as end-of-turn.
        turn_detection: {
          type: 'server_vad',
          threshold: 0.65,
          prefix_padding_ms: 400,
          silence_duration_ms: 1200,
        },
        tools: [tool],
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('OpenAI Realtime session error:', response.status, errorBody)
      return NextResponse.json(
        { error: `Failed to create realtime session: ${response.status}` },
        { status: response.status },
      )
    }

    const data = await response.json()

    return NextResponse.json({
      ephemeralKey: data.client_secret?.value,
      sessionId: data.id,
      expiresAt: data.client_secret?.expires_at,
      // Echo back the consult_id so the client can pass it to /historian/save
      consult_id: consultId || null,
    })
  } catch (error: any) {
    console.error('Historian session API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to create historian session' },
      { status: 500 },
    )
  }
}
