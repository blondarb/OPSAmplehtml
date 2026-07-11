/**
 * Clara voice test — OpenAI Realtime session bootstrap (SAME engine as the
 * historian's "Henry").
 *
 * Switched off Nova Sonic on 2026-07-11: in live testing the Nova relay's audio
 * was staticky / self-interrupting, while OpenAI Realtime (WebRTC, server-side
 * noise reduction) is clean — the historian's Henry has no static on the same
 * hardware. Voice transport only: triage classification still happens turn-by-
 * turn via POST /api/ai/clara/classify (Bedrock Gate-0 + rulebook), NOT an
 * in-session tool call, so the classification brain is unchanged. Mirrors the
 * OpenAI (client_secrets) path of src/app/api/ai/historian/session/route.ts.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { CLARA_GATE_COOKIE, verifyGateToken } from '@/lib/clara/testGate'
import { getOpenAIKey } from '@/lib/secrets'
import { getTurnDetectionConfig, getNoiseReductionConfig } from '@/lib/historianTypes'
import { buildWhisperBiasPrompt, isAsrBiasingEnabled } from '@/lib/asr/clinical-lexicon'

const CLARA_VOICE_INSTRUCTIONS = `You are "Clara," Sevaro's automated neuro-triage phone operator, running in an INTERNAL TEST HARNESS. Your callers are clinicians — ED physicians, hospitalists, nurses — requesting a neurology teleconsult. Talk to them peer-to-peer.

TONE — this matters most: concise, friendly, brisk. These are busy physicians. Warm but fast. Short acknowledgments ("Got it." "Okay.") then the next question. Never chatty, never over-reassuring, no soft bedside-manner filler, no long sentences. One short question at a time. Never read a checklist aloud and never repeat back everything they just said.

MANDATORY OPENING (say once, immediately, then stop and listen):
"This is Clara, Sevaro's automated triage line. Quick note — I'm an AI and this is a test line, not real patient care. Go ahead — what's the consult?"

EMERGENT / STROKE-ALERT FLOW — when the caller says it's a stroke alert, an active stroke, an active or prolonged seizure, a "worst headache of their life," or any actively emergent situation, do exactly this:
1. Immediately acknowledge and tell them the connection is happening: "Got it — stroke alert. I'm connecting you to the on-call neurologist right now."
2. Then use the ring time: "While that connects — patient's name and date of birth?" Then a couple of quick history points, one at a time: last known well, any blood thinners, and what they're seeing.
3. Keep it moving and remind them help is being connected ("Still connecting — one more thing..."). The goal: they hear the neurologist is being connected AND we capture the essentials while it rings, so nothing is lost when the neurologist picks up.

NON-EMERGENT: gather the reason for consult, symptoms, onset/timing, and relevant history — same concise, one-question-at-a-time style.

SAFETY: If anyone describes self-harm, tell them to get emergency help right now. A separate independent safety monitor classifies every turn on its own — you do NOT classify, diagnose, give medical advice, or state a STAT level. Just hold the conversation.

This is a test harness: the "I'm connecting you" language is the intended real-world script we are validating — say it. There is no live transfer or paging behind it here, so do not invent any other actions.`

export async function POST() {
  try {
    const cookieStore = await cookies()
    if (!verifyGateToken(cookieStore.get(CLARA_GATE_COOKIE)?.value)) {
      return NextResponse.json({ error: 'Not authorized for the Clara test surface.' }, { status: 401 })
    }

    const apiKey = await getOpenAIKey()
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured.' }, { status: 500 })
    }

    const model =
      process.env.OPENAI_CLARA_REALTIME_MODEL ||
      process.env.OPENAI_HISTORIAN_REALTIME_MODEL ||
      'gpt-realtime-2'
    const turnDetection = getTurnDetectionConfig(process.env.HISTORIAN_TURN_DETECTION_MODE)
    // Server-side noise reduction (far_field default) is the key reason Henry is
    // clean on laptop/speakerphone — OpenAI filters echo/noise before the VAD.
    const noiseReduction = getNoiseReductionConfig(process.env.HISTORIAN_NOISE_REDUCTION)
    const transcription: { model: string; prompt?: string } = { model: 'whisper-1' }
    if (isAsrBiasingEnabled()) {
      transcription.prompt = buildWhisperBiasPrompt()
    }

    const buildBody = (withNoiseReduction: boolean) =>
      JSON.stringify({
        session: {
          type: 'realtime',
          model,
          instructions: CLARA_VOICE_INSTRUCTIONS,
          audio: {
            input: {
              turn_detection: turnDetection,
              transcription,
              ...(withNoiseReduction && noiseReduction ? { noise_reduction: noiseReduction } : {}),
            },
            output: { voice: 'verse' },
          },
          // No in-session tools — Clara's triage classification is a separate
          // Bedrock call per turn (/api/ai/clara/classify).
          tools: [],
        },
      })

    const callOpenAI = (body: string) =>
      fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      })

    // Fail-open on noise_reduction, exactly like the historian route.
    let response = await callOpenAI(buildBody(true))
    if (!response.ok && noiseReduction) {
      const firstErr = await response.text()
      console.warn('[clara/session] retrying without noise_reduction:', response.status, firstErr.slice(0, 200))
      response = await callOpenAI(buildBody(false))
    }

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[clara/session] OpenAI client_secrets error:', response.status, errorBody)
      return NextResponse.json(
        { error: `OpenAI Realtime API returned ${response.status}`, openai_error: errorBody, status: response.status },
        { status: response.status },
      )
    }

    const data = await response.json()

    return NextResponse.json({
      provider: 'openai',
      instructions: CLARA_VOICE_INSTRUCTIONS,
      tools: [],
      ephemeralKey: data.value ?? data.client_secret?.value,
      sessionId: data.session_id ?? data.id,
      expiresAt: data.expires_at ?? data.client_secret?.expires_at,
      model,
    })
  } catch (error: unknown) {
    console.error('[clara/session] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create Clara test session' },
      { status: 500 },
    )
  }
}
