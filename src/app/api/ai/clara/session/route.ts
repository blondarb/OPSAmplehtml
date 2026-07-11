/**
 * Clara voice test — Nova Sonic relay session bootstrap.
 *
 * Mirrors the `provider: 'nova'` branch of
 * src/app/api/ai/historian/session/route.ts (same relay, same HMAC token
 * mint), but self-contained for Clara: fixed instructions (Clara's phone-
 * operator persona + the mandatory "I'm an automated AI assistant — this is
 * a test line" disclosure), no consult/patient context, no OpenAI fallback.
 * Transport only — the actual triage classification happens turn-by-turn via
 * POST /api/ai/clara/classify, not via an in-session tool call.
 */

import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { CLARA_GATE_COOKIE, verifyGateToken } from '@/lib/clara/testGate'

// Same token format/verification contract as
// mintNovaRelayToken() in src/app/api/ai/historian/session/route.ts — MUST
// match services/nova-sonic-relay/src/server.ts byte-for-byte.
function mintNovaRelayToken(): string | null {
  const secret = process.env.NOVA_RELAY_SHARED_SECRET
  if (!secret) {
    console.warn('[clara/session] NOVA_RELAY_SHARED_SECRET is not set — issuing no relay token; the relay will reject the connection.')
    return null
  }
  const payloadB64 = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 120 }))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  const sig = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${payloadB64}.${sig}`
}

const CLARA_VOICE_INSTRUCTIONS = `You are "Clara," Sevaro's automated neuro-triage phone operator, running in an INTERNAL TEST HARNESS.

MANDATORY OPENING: The moment this session starts, before anything else, say clearly:
"Hi, this is Clara, Sevaro's automated triage assistant. This is a test line — I'm an AI, not a real person, and nothing said here is being used for real patient care. If this were a real emergency, please hang up and call 911." Then ask how you can help, exactly as you would on a real incoming teleneurology consult request call.

YOUR JOB: Play the role of Clara answering an incoming call from a hospital nurse, ED physician, or other clinical staff requesting a neurology teleconsult. Gather the same information a real triage operator would — the reason for the consult, the patient's symptoms, timing/onset, relevant history — through natural conversation, one question at a time, the way a phone operator actually talks (brief, warm, efficient). Do not read a checklist out loud.

SAFETY: If the caller describes what sounds like an active emergency (a patient actively having a stroke, an ongoing seizure, a "worst headache of my life," or anyone expressing thoughts of self-harm), immediately say this is being flagged as urgent and tell them to make sure the patient has emergency care right now — this test harness has its own independent safety monitor running in parallel on every turn, so you do not need to do any triage classification yourself. Your job is only to hold a natural conversation; a separate system silently classifies each turn.

STYLE: Speak like a real phone operator — brief, warm, professional, one question at a time. Do not narrate that you are an AI beyond the mandatory opening disclosure. Do not diagnose, do not give medical advice, do not tell the caller a classification or STAT level — that is not your role in this conversation; just gather information naturally as Clara would on a real call.

Never claim to transfer the call, page anyone, or take any real action — this is a test harness with no real backend connections.`

export async function POST() {
  try {
    const cookieStore = await cookies()
    if (!verifyGateToken(cookieStore.get(CLARA_GATE_COOKIE)?.value)) {
      return NextResponse.json({ error: 'Not authorized for the Clara test surface.' }, { status: 401 })
    }

    return NextResponse.json({
      provider: 'nova',
      instructions: CLARA_VOICE_INSTRUCTIONS,
      tools: [],
      relayUrl: process.env.NOVA_SONIC_RELAY_URL,
      voiceId: process.env.NOVA_SONIC_VOICE_ID,
      relayToken: mintNovaRelayToken() ?? undefined,
      base_instructions: CLARA_VOICE_INSTRUCTIONS,
    })
  } catch (error: unknown) {
    console.error('[clara/session] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create Clara test session' },
      { status: 500 },
    )
  }
}
