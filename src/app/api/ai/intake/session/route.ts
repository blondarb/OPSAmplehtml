import { NextResponse } from 'next/server'
import { INTAKE_VOICE_SYSTEM_PROMPT, getIntakeToolDefinition } from '@/lib/intakePrompts'

export async function POST() {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured.' },
        { status: 500 },
      )
    }

    const instructions = INTAKE_VOICE_SYSTEM_PROMPT
    const tool = getIntakeToolDefinition()

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
    console.error('Intake session API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to create intake session' },
      { status: 500 },
    )
  }
}
