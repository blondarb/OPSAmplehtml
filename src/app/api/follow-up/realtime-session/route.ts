import { NextResponse } from 'next/server'
import { buildFollowUpVoicePrompt } from '@/lib/follow-up/systemPrompt'
import type { PatientScenario } from '@/lib/follow-up/types'
import { getNovaRelaySharedSecret, getOpenAIKey } from '@/lib/secrets'
import { buildWhisperBiasPrompt, isAsrBiasingEnabled } from '@/lib/asr/clinical-lexicon'
import { toNovaToolSpec } from '@/lib/historianPrompts'
import {
  mintNovaRelayToken,
  type NovaRelayStartConfig,
} from '@/lib/voice/novaRelayAuth'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { getPool } from '@/lib/db'
import { DEMO_SCENARIOS } from '@/lib/follow-up/demoScenarios'
import { loadSchedulingAuthorization } from '@/lib/triage/schedulingAuthorization'

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

interface FollowUpVoiceBinding {
  id: string
  patient_id: string | null
  patient_name: string | null
  patient_age: number | null
  patient_gender: string | null
  diagnosis: string | null
  visit_date: string | Date | null
  provider_name: string | null
  medications: unknown
  visit_summary: string | null
  tenant_patient_id: string | null
  consult_id: string | null
  triage_session_id: string | null
}

function parseMedications(value: unknown): PatientScenario['medications'] {
  if (Array.isArray(value)) return value as PatientScenario['medications']
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed)
        ? (parsed as PatientScenario['medications'])
        : []
    } catch {
      return []
    }
  }
  return []
}

function scenarioFromBinding(binding: FollowUpVoiceBinding): PatientScenario {
  if (!binding.patient_id) {
    throw new Error('Follow-up voice binding is missing patient identity')
  }
  const visitDate =
    binding.visit_date instanceof Date
      ? binding.visit_date.toISOString().split('T')[0]
      : binding.visit_date

  return {
    id: binding.patient_id,
    name: binding.patient_name || 'Patient',
    age:
      binding.patient_age != null && Number.isFinite(Number(binding.patient_age))
        ? Number(binding.patient_age)
        : 0,
    gender: binding.patient_gender || 'Unknown',
    diagnosis: binding.diagnosis || 'Not documented',
    visitDate: visitDate || new Date().toISOString().split('T')[0],
    providerName: binding.provider_name || 'Provider',
    medications: parseMedications(binding.medications),
    visitSummary: binding.visit_summary || 'Follow-up session',
  }
}

export async function POST(request: Request) {
  const access = await authorizeClinicalAccess({
    action: 'follow_up.message',
    allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Access denied', reason: access.reason },
      { status: access.status },
    )
  }

  try {
    const body = await request.json()
    const requestedSessionId =
      typeof body.session_id === 'string' ? body.session_id.trim() : ''
    if (requestedSessionId.length > 128) {
      return NextResponse.json({ error: 'session_id is invalid' }, { status: 400 })
    }

    let patientContext: PatientScenario
    let triageSessionId: string | null = null
    if (requestedSessionId) {
      const pool = await getPool()
      const { rows } = await pool.query(
        `SELECT fs.id,
                fs.patient_id,
                fs.patient_name,
                fs.patient_age,
                fs.patient_gender,
                fs.diagnosis,
                fs.visit_date,
                fs.provider_name,
                fs.medications,
                fs.visit_summary,
                p.id AS tenant_patient_id,
                nc.id AS consult_id,
                nc.triage_session_id
           FROM followup_sessions fs
           LEFT JOIN patients p
             ON p.id = fs.patient_id
            AND p.tenant_id = fs.tenant_id
           LEFT JOIN neurology_consults nc
             ON nc.intake_session_id = fs.id
            AND nc.tenant_id = fs.tenant_id
          WHERE fs.id = $1
            AND fs.tenant_id = $2
          LIMIT 2`,
        [requestedSessionId, access.context.tenantId],
      )
      if (rows.length === 0) {
        return NextResponse.json(
          { error: 'Follow-up session not found' },
          { status: 404 },
        )
      }
      if (rows.length !== 1) {
        return NextResponse.json(
          {
            error: 'Follow-up session binding is inconsistent',
            reason: 'follow_up_session_binding_conflict',
          },
          { status: 409 },
        )
      }

      const binding = rows[0] as FollowUpVoiceBinding
      if (!binding.patient_id || binding.tenant_patient_id !== binding.patient_id) {
        return NextResponse.json(
          {
            error: 'Follow-up session has no authoritative tenant patient binding',
            reason: 'follow_up_session_patient_unbound',
          },
          { status: 409 },
        )
      }
      if (binding.consult_id && !binding.triage_session_id) {
        return NextResponse.json(
          {
            error: 'Follow-up voice agent is blocked by triage safety state',
            reason: 'triage_authorization_missing',
          },
          { status: 409 },
        )
      }
      triageSessionId = binding.triage_session_id
      patientContext = scenarioFromBinding(binding)
    } else {
      const requestedScenarioId =
        typeof body.patient_context?.id === 'string'
          ? body.patient_context.id.trim()
          : ''
      const demoScenario = DEMO_SCENARIOS.find(
        (scenario) => scenario.id === requestedScenarioId,
      )
      if (!demoScenario) {
        return NextResponse.json(
          {
            error: 'A server-approved demo or follow-up session is required',
            reason: 'follow_up_context_not_authoritative',
          },
          { status: 409 },
        )
      }
      patientContext = demoScenario
    }

    if (triageSessionId) {
      const safety = await loadSchedulingAuthorization(
        triageSessionId,
        access.context.tenantId,
      )
      if (!safety.decision.allowed) {
        return NextResponse.json(
          {
            error: 'Follow-up voice agent is blocked by triage safety state',
            reason: safety.decision.reason,
          },
          { status: 409 },
        )
      }
    }

    // Provider selection: explicit client `provider` field wins, else the
    // server-side VOICE_PROVIDER env var, else default to 'openai' — today's
    // production path (mirrors /api/ai/historian/session). Any other/missing
    // value falls back to openai.
    const requestedProvider = body.provider ?? process.env.VOICE_PROVIDER ?? 'openai'
    if (requestedProvider !== 'nova' && requestedProvider !== 'openai') {
      return NextResponse.json({ error: 'provider is invalid' }, { status: 400 })
    }
    const provider: 'nova' | 'openai' = requestedProvider

    // Build voice prompt (needed by both branches)
    const voicePrompt = buildFollowUpVoicePrompt(patientContext)

    // ── Nova path: no OpenAI session call. Return relay config + the
    // Nova-adapted tool spec. useFollowUpRealtimeSession builds a
    // NovaSonicWsProvider from this — additive, does not touch the OpenAI
    // branch below.
    if (provider === 'nova') {
      const tools = [toNovaToolSpec(FOLLOWUP_TOOL)]
      const voiceId = process.env.NOVA_SONIC_VOICE_ID
      const sessionType = 'follow_up'
      const relayStartConfig: NovaRelayStartConfig = {
        instructions: voicePrompt,
        tools,
        voiceId,
        sessionType,
      }
      const relaySecret = await getNovaRelaySharedSecret()
      const relayUrl = process.env.NOVA_SONIC_RELAY_URL
      if (!relaySecret || !relayUrl) {
        return NextResponse.json(
          { error: 'Nova relay is not configured.' },
          { status: 503 },
        )
      }
      if (triageSessionId) {
        const currentSafety = await loadSchedulingAuthorization(
          triageSessionId,
          access.context.tenantId,
        )
        if (!currentSafety.decision.allowed) {
          return NextResponse.json(
            {
              error: 'Follow-up voice agent is blocked by triage safety state',
              reason: currentSafety.decision.reason,
            },
            { status: 409 },
          )
        }
      }
      return NextResponse.json({
        provider: 'nova',
        instructions: voicePrompt,
        tools,
        relayUrl,
        voiceId,
        sessionType,
        relayToken: mintNovaRelayToken(relayStartConfig, relaySecret),
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

    if (triageSessionId) {
      const currentSafety = await loadSchedulingAuthorization(
        triageSessionId,
        access.context.tenantId,
      )
      if (!currentSafety.decision.allowed) {
        return NextResponse.json(
          {
            error: 'Follow-up voice agent is blocked by triage safety state',
            reason: currentSafety.decision.reason,
          },
          { status: 409 },
        )
      }
    }

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
