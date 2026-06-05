import { NextResponse } from 'next/server'
import { buildFollowUpVoicePrompt } from '@/lib/follow-up/systemPrompt'
import type { PatientScenario } from '@/lib/follow-up/types'
import { toNovaToolSpec } from '@/lib/historianPrompts'
import { getOpenAIKey } from '@/lib/secrets'

// Follow-up tool definition (OpenAI realtime tool shape). Reused for both the
// OpenAI branch (passed verbatim) and the Nova branch (adapted via
// toNovaToolSpec). Schema unchanged from the pre-migration inline definition.
const FOLLOWUP_TOOL = {
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

    // Provider selection: explicit client `provider` field wins, else the
    // server-side VOICE_PROVIDER env var, else default to Nova (the migration
    // target). Only 'openai' opts back into the legacy WebRTC/client_secrets path.
    const requestedProvider = (body.provider ?? process.env.VOICE_PROVIDER ?? 'nova') as string
    const provider: 'nova' | 'openai' = requestedProvider === 'openai' ? 'openai' : 'nova'

    // Build the follow-up voice prompt for the given patient scenario.
    const voicePrompt = buildFollowUpVoicePrompt(patientContext)

    // ── Nova path: no OpenAI client_secrets call. Return relay config + the
    // Nova-native tool spec. The hook builds a NovaSonicWsProvider from this.
    if (provider === 'nova') {
      return NextResponse.json({
        provider: 'nova',
        instructions: voicePrompt,
        tools: [toNovaToolSpec(FOLLOWUP_TOOL)],
        relayUrl: process.env.NOVA_SONIC_RELAY_URL,
        voiceId: process.env.NOVA_SONIC_VOICE_ID,
      })
    }

    // ── OpenAI path: GA client_secrets flow (unified with the historian route
    // + the shared openaiWebrtcProvider which POSTs to /v1/realtime/calls).
    const apiKey = await getOpenAIKey()
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured.' },
        { status: 500 }
      )
    }

    const model = process.env.OPENAI_FOLLOWUP_REALTIME_MODEL || 'gpt-realtime-2'

    // Request an ephemeral client_secret from OpenAI's current GA endpoint.
    // Replaces the deprecated POST /v1/realtime/sessions flow.
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model,
          instructions: voicePrompt,
          audio: {
            input: {
              turn_detection: {
                type: 'server_vad',
                threshold: 0.7,
                prefix_padding_ms: 300,
                silence_duration_ms: 800,
              },
              transcription: { model: 'whisper-1' },
            },
            output: { voice: 'verse' },
          },
          tools: [FOLLOWUP_TOOL],
        },
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[follow-up/session] OpenAI client_secrets error:', response.status, errorBody)
      return NextResponse.json(
        {
          error: `OpenAI Realtime API returned ${response.status}`,
          openai_error: errorBody,
          status: response.status,
        },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json({
      provider: 'openai',
      ephemeralKey: data.value ?? data.client_secret?.value,
      model,
      instructions: voicePrompt,
      tools: [FOLLOWUP_TOOL],
      sessionId: data.session_id ?? data.id,
      expiresAt: data.expires_at ?? data.client_secret?.expires_at,
    })
  } catch (error: unknown) {
    console.error('Follow-up realtime session API error:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to create follow-up realtime session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
