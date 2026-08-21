/**
 * PHI-free live smoke for the Comprehensive Historian on Nova 2 Sonic.
 *
 * Exercises the real Bedrock bidirectional stream through the same
 * NovaSonicSession class used by the relay, with the production prompt/tool
 * builders. It validates the content-filter/startup path plus the first two
 * clinical questions. A PHI-free synthesized patient reply is streamed through
 * the production audio path; no microphone, database write, transcript
 * persistence, or application deployment occurs.
 *
 * Usage:
 *   AWS_PROFILE=<authorized-profile> npm run historian:nova-smoke -- --patient-pcm /path/to/16khz-mono-s16le.pcm
 *   AWS_PROFILE=<authorized-profile> npm run historian:nova-smoke -- --patient-pcm /path/to/reply.pcm --verbose
 */

import { readFileSync } from 'node:fs'

import { buildHistorianSystemPrompt, getHistorianToolsForProvider } from '../src/lib/historianPrompts'
import { NovaSonicSession } from '../services/nova-sonic-relay/src/novaSonicSession.js'
import { COMPREHENSIVE_AGE_NUDGE } from '../services/nova-sonic-relay/src/comprehensiveOpening.js'

const VERBOSE = process.argv.includes('--verbose')
const TURN_TIMEOUT_MS = 45_000
const AUDIO_CHUNK_MS = 100
const TEXT_QUIET_MS = 5_000
const AUDIO_QUIET_MS = 750
const AUDIO_CHUNK_BYTES = (16_000 * 2 * AUDIO_CHUNK_MS) / 1000
const SILENCE_PCM_BASE64 = Buffer.alloc(AUDIO_CHUNK_BYTES, 0).toString('base64')
const SYNTHETIC_REFERRAL = 'progressive balance difficulty and several recent falls'

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function streamPatientAudio(session: NovaSonicSession, pcm: Buffer): Promise<void> {
  if (pcm.length === 0) throw new Error('Synthetic patient PCM file is empty')
  for (let offset = 0; offset < pcm.length; offset += AUDIO_CHUNK_BYTES) {
    const chunk = pcm.subarray(offset, Math.min(offset + AUDIO_CHUNK_BYTES, pcm.length))
    session.pushAudio(chunk.toString('base64'))
    await sleep(AUDIO_CHUNK_MS)
  }
}

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  if (/not authorized to perform: bedrock:(InvokeModel|InvokeModelWithBidirectionalStream)/i.test(raw)) {
    return 'AWS authorization denied for Nova Sonic streaming on the selected profile'
  }
  if (/content.?filter|blocked.*content|modelStreamErrorException/i.test(raw)) {
    return 'Nova rejected the Comprehensive prompt or turn through its content-safety path'
  }
  // Keep structural diagnostics while redacting AWS identities/account IDs if
  // an SDK error includes them. The harness must never print credential or
  // principal details into logs/CI artifacts.
  return raw
    .replace(/arn:aws:[^\s]+/gi, '[AWS_PRINCIPAL_REDACTED]')
    .replace(/\b\d{12}\b/g, '[AWS_ACCOUNT_REDACTED]')
    .slice(0, 500)
}

function waitForAssistantTurn(
  assistantTurns: string[],
  targetCount: number,
  errors: string[],
): Promise<string> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const check = () => {
      if (errors.length > 0) {
        reject(new Error(`Nova stream error: ${errors[0]}`))
        return
      }
      if (assistantTurns.length >= targetCount) {
        resolve(assistantTurns[targetCount - 1])
        return
      }
      if (Date.now() - started >= TURN_TIMEOUT_MS) {
        reject(new Error(`Timed out waiting for assistant turn ${targetCount}`))
        return
      }
      setTimeout(check, 100)
    }
    check()
  })
}

function waitForAudioQuiet(lastAudioAt: () => number, errors: string[]): Promise<void> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const check = () => {
      if (errors.length > 0) {
        reject(new Error(`Nova stream error: ${errors[0]}`))
        return
      }
      const last = lastAudioAt()
      if (last > 0 && Date.now() - last >= AUDIO_QUIET_MS) {
        resolve()
        return
      }
      if (Date.now() - started >= TURN_TIMEOUT_MS) {
        reject(new Error('Timed out waiting for Nova audio to finish'))
        return
      }
      setTimeout(check, 100)
    }
    check()
  })
}

async function main(): Promise<void> {
  const patientPcmPath = argumentValue('--patient-pcm')
  if (!patientPcmPath) {
    throw new Error('Missing --patient-pcm path to PHI-free 16 kHz mono signed 16-bit little-endian audio')
  }
  const patientPcm = readFileSync(patientPcmPath)
  const instructions = buildHistorianSystemPrompt(
    'new_patient',
    SYNTHETIC_REFERRAL,
    undefined,
    undefined,
    SYNTHETIC_REFERRAL,
    'comprehensive',
  )
  const tools = getHistorianToolsForProvider('nova', 'new_patient')
  const assistantTurns: string[] = []
  let assistantFragments: string[] = []
  let lastAudioAt = 0
  let fragmentTimer: ReturnType<typeof setTimeout> | null = null
  const errors: string[] = []
  const prematureTools: string[] = []
  let silenceTimer: ReturnType<typeof setInterval> | null = null
  let openingNudgeSent = false
  let session: NovaSonicSession

  const finalizeAssistantTurn = () => {
    if (assistantFragments.length === 0) return
    const completedTurn = assistantFragments.join(' ').replace(/\s+/g, ' ').trim()
    assistantFragments = []
    assistantTurns.push(completedTurn)
    if (VERBOSE) console.log(`[assistant turn ${assistantTurns.length}] ${completedTurn}`)
  }

  session = new NovaSonicSession({
    onTextOutput: (role, content) => {
      if (role.toUpperCase() === 'USER') {
        if (VERBOSE) console.log(`[synthetic patient transcript] ${content}`)
        if (!openingNudgeSent) {
          openingNudgeSent = true
          session.pushSystemText(COMPREHENSIVE_AGE_NUDGE)
        }
      }
      if (role.toUpperCase() !== 'ASSISTANT') return
      assistantFragments.push(content)
      if (VERBOSE) console.log(`[assistant fragment] ${content}`)
      if (fragmentTimer) clearTimeout(fragmentTimer)
      if (assistantFragments.join(' ').includes('?')) {
        fragmentTimer = null
        finalizeAssistantTurn()
        return
      }
      fragmentTimer = setTimeout(() => {
        fragmentTimer = null
        finalizeAssistantTurn()
      }, TEXT_QUIET_MS)
    },
    onCompletionEnd: () => {
      if (fragmentTimer) {
        clearTimeout(fragmentTimer)
        fragmentTimer = null
      }
      finalizeAssistantTurn()
    },
    onAudioOutput: () => {
      lastAudioAt = Date.now()
    },
    onToolUse: (tool) => {
      prematureTools.push(tool.toolName)
      // Return an explicit failure so the live stream never hangs waiting for
      // a tool result during this two-turn smoke. A save call this early is a
      // test failure regardless of the result.
      session.pushToolResult(
        tool.toolUseId,
        JSON.stringify({ status: 'error', message: 'synthetic smoke does not execute tools' }),
      )
    },
    onError: (error) => errors.push(errorMessage(error)),
  })

  try {
    await session.start(instructions, tools)
    // Nova Sonic's production path always has an open microphone stream. Send
    // deterministic PCM silence at real-time cadence so the smoke exercises
    // the same audio clock/VAD behavior without recording or persisting audio.
    silenceTimer = setInterval(() => session.pushAudio(SILENCE_PCM_BASE64), AUDIO_CHUNK_MS)

    const first = await waitForAssistantTurn(assistantTurns, 1, errors)
    const firstPass = /refer|sent|neurolog|balance|fall/i.test(first) && /\?/.test(first)
    if (!firstPass) {
      throw new Error('First Nova turn did not ask about the symptom-based referral reason')
    }
    console.log('PASS nova_start_and_referral_first')

    await waitForAudioQuiet(() => lastAudioAt, errors)
    if (silenceTimer) {
      clearInterval(silenceTimer)
      silenceTimer = null
    }
    await streamPatientAudio(session, patientPcm)
    silenceTimer = setInterval(() => session.pushAudio(SILENCE_PCM_BASE64), AUDIO_CHUNK_MS)
    const second = await waitForAssistantTurn(assistantTurns, 2, errors)
    const secondPass = /how old|your age|age are you/i.test(second) && /\?/.test(second)
    if (!secondPass) {
      throw new Error('Second Nova turn did not ask the patient-reported age question')
    }
    console.log('PASS nova_age_second')

    if (prematureTools.length > 0) {
      throw new Error(`Nova called tool(s) before the first two questions completed: ${prematureTools.join(', ')}`)
    }
    console.log('PASS nova_no_premature_tool_call')
  } finally {
    if (silenceTimer) clearInterval(silenceTimer)
    if (fragmentTimer) clearTimeout(fragmentTimer)
    await session.stop()
  }
}

main().catch((error) => {
  console.error(`FAIL ${errorMessage(error)}`)
  process.exitCode = 1
})
