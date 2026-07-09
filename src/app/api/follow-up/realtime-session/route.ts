import { NextResponse } from 'next/server'
import { buildFollowUpVoicePrompt } from '@/lib/follow-up/systemPrompt'
import type { PatientScenario } from '@/lib/follow-up/types'
import { getOpenAIKey } from '@/lib/secrets'
import { buildWhisperBiasPrompt, isAsrBiasingEnabled } from '@/lib/asr/clinical-lexicon'
import { toNovaToolSpec } from '@/lib/historianPrompts'

// Follow-up tool definition for voice mode. Hoisted to module scope (was
// inline) so the Nova branch below can adapt the SAME schema via
// toNovaToolSpec instead of maintaining a second copy. Schema unchanged.
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
    // server-side VOICE_PROVIDER env var, else default to 'openai' — today's
    // production path (mirrors /api/ai/historian/session). Any other/missing
    // value falls back to openai.
    const requestedProvider = (body.provider ?? process.env.VOICE_PROVIDER ?? 'openai') as string
    const provider: 'nova' | 'openai' = requestedProvider === 'nova' ? 'nova' : 'openai'

    // Build voice prompt (needed by both branches)
    const voicePrompt = buildFollowUpVoicePrompt(patientContext)

    // ── Nova path: no OpenAI session call. Return relay config + the
    // Nova-adapted tool spec. useFollowUpRealtimeSession builds a
    // NovaSonicWsProvider from this — additive, does not touch the OpenAI
    // branch below.
    if (provider === 'nova') {
      return NextResponse.json({
        provider: 'nova',
        instructions: voicePrompt,
        tools: [toNovaToolSpec(FOLLOWUP_TOOL)],
        relayUrl: process.env.NOVA_SONIC_RELAY_URL,
        voiceId: process.env.NOVA_SONIC_VOICE_ID,
      })
    }

    // ── OpenAI path — UNCHANGED from before provider branching was added. ──

    // Get OpenAI API key
    const apiKey = await getOpenAIKey()
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured.' },
        { status: 500 }
      )
    }

    // Bias ASR toward neurology vocabulary, prioritizing this patient's own
    // high-stakes words (their name, provider, and medications) so they survive
    // the prompt token budget. Hot-revertable via ASR_VOCAB_BIASING.
    const transcription: { model: string; prompt?: string } = { model: 'whisper-1' }
    if (isAsrBiasingEnabled()) {
      const sessionTerms = [
        patientContext.name,
        patientContext.providerName,
        ...(patientContext.medications ?? []).map((m) => m.name),
      ].filter(Boolean)
      transcription.prompt = buildWhisperBiasPrompt(sessionTerms)
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
        input_audio_transcription: transcription,
        turn_detection: {
          type: 'server_vad',
          threshold: 0.7,
          prefix_padding_ms: 300,
          silence_duration_ms: 800,
        },
        tools: [FOLLOWUP_TOOL],
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
      // Added for the voice-provider abstraction so the hook knows which
      // VoiceProvider to instantiate; every other field is unchanged.
      provider: 'openai',
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
