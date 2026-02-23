import { NextResponse } from 'next/server'
import { buildFollowUpVoicePrompt } from '@/lib/follow-up/systemPrompt'
import type { PatientScenario } from '@/lib/follow-up/types'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const patientContext: PatientScenario = body.patient_context

    if (!patientContext) {
      return NextResponse.json(
        { error: 'patient_context is required' },
        { status: 400 }
      )
    }

    // Get OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured.' },
        { status: 500 }
      )
    }

    // Build voice prompt
    const voicePrompt = buildFollowUpVoicePrompt(patientContext)

    // Follow-up tool definition for voice mode
    const followUpToolDefinition = {
      type: 'function',
      name: 'save_followup_output',
      description:
        'Save the follow-up conversation output including medication status, symptoms, escalation flags, and summary',
      parameters: {
        type: 'object',
        properties: {
          medication_status: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                medication: { type: 'string' },
                filled: { type: 'boolean' },
                taking: { type: 'boolean' },
                side_effects: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          new_symptoms: { type: 'array', items: { type: 'string' } },
          functional_status: {
            type: 'string',
            enum: ['better', 'worse', 'about_the_same'],
          },
          functional_details: { type: 'string' },
          patient_questions: { type: 'array', items: { type: 'string' } },
          escalation_triggered: { type: 'boolean' },
          escalation_tier: {
            type: 'string',
            enum: ['urgent', 'same_day', 'next_visit', 'informational'],
          },
          escalation_reason: { type: 'string' },
          caregiver_name: { type: 'string' },
          caregiver_relationship: { type: 'string' },
          narrative_summary: { type: 'string' },
        },
        required: ['medication_status', 'functional_status'],
      },
    }

    // Request ephemeral token from OpenAI Realtime API
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-realtime',
        voice: 'verse',
        instructions: voicePrompt,
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.7,
          prefix_padding_ms: 300,
          silence_duration_ms: 800,
        },
        tools: [followUpToolDefinition],
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('OpenAI Realtime session error:', response.status, errorBody)
      return NextResponse.json(
        { error: `Failed to create realtime session: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json({
      ephemeralKey: data.client_secret?.value,
      sessionId: data.id,
      expiresAt: data.client_secret?.expires_at,
    })
  } catch (error: unknown) {
    console.error('Follow-up realtime session API error:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to create follow-up realtime session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
