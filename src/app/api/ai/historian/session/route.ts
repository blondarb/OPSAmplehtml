import { NextResponse } from 'next/server'
import { buildHistorianSystemPrompt, getHistorianToolDefinition } from '@/lib/historianPrompts'
import type { HistorianSessionType } from '@/lib/historianTypes'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const sessionType: HistorianSessionType = body.sessionType || 'new_patient'
    const referralReason: string | undefined = body.referralReason
    const patientContext: string | undefined = body.patientContext

    // Get OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY
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
        model: 'gpt-4o-realtime-preview',
        voice: 'verse',
        instructions,
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
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
    })
  } catch (error: any) {
    console.error('Historian session API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to create historian session' },
      { status: 500 },
    )
  }
}
