/**
 * PHI-free Comprehensive Historian contract runner and opt-in Nova acceptance.
 *
 * Default execution is local-only. `--live` sends only fixed, in-code macOS
 * TTS fixtures through the production NovaSonicSession audio path. Boundary
 * scenarios use explicit LIVE_STATE_INJECTED context so they prove the live
 * ASR/model/tool control path without pretending one connection carried the
 * omitted 25/44/59 turns. No microphone, database, application API, transcript
 * persistence, supplied text/audio, or deployment is used.
 *
 * Usage:
 *   npm run historian:nova-smoke
 *   npm run historian:nova-smoke -- --scenario emergency-at-26
 *   AWS_PROFILE=<authorized-profile> npm run historian:nova-smoke -- --live
 *   AWS_PROFILE=<authorized-profile> npm run historian:nova-smoke -- --live --live-scenario emergency-at-26
 *   AWS_PROFILE=<authorized-profile> npm run historian:nova-smoke -- --live --live-suite
 *   AWS_PROFILE=<authorized-profile> npm run historian:nova-smoke -- --live --live-continuation
 */

import { spawnSync } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'

import { buildHistorianSystemPrompt, getHistorianToolsForProvider } from '../src/lib/historianPrompts'
import { NovaSonicSession } from '../services/nova-sonic-relay/src/novaSonicSession.js'
import { COMPREHENSIVE_AGE_NUDGE } from '../services/nova-sonic-relay/src/comprehensiveOpening.js'
import type { ServerMsg } from '../services/nova-sonic-relay/src/wsProtocol.js'
import {
  COMPREHENSIVE_HARD_STOP_SAVE_NUDGE,
} from '../src/lib/historian/comprehensiveCompletionPolicy'
import {
  COMPREHENSIVE_SCENARIOS,
  runAllComprehensiveScenarios,
  runComprehensiveScenario,
} from '../src/lib/historian/comprehensiveScenarioContract'
import {
  LIVE_SYNTHETIC_COVERAGE_SAVE_NUDGE,
  LIVE_SYNTHETIC_SCENARIO_IDS,
  LIVE_SYNTHETIC_SCENARIOS,
  LIVE_SYNTHETIC_WRAP_SAVE_NUDGE,
  assessLiveSyntheticSave,
  safetyResponseHasRequiredResources,
  type LiveSyntheticScenario,
  type LiveSyntheticScenarioId,
} from '../src/lib/historian/liveSyntheticAcceptance'
import { isUnavailableLiveProviderFailure } from '../src/lib/historian/liveSmokeFailurePolicy'
import {
  assertHistorianContinuationCheckpoint,
  buildHistorianAnsweredQuestionPairs,
  conservativeHistorianContinuationCoverage,
  hashHistorianContinuationTranscript,
  type HistorianContinuationCheckpointV1,
} from '../src/lib/historian/continuationState'
import { HistorianRuntimeGuard } from '../src/lib/historian/runtimeGuard'
import type { HistorianTranscriptEntry } from '../src/lib/historianTypes'

const VERBOSE = process.argv.includes('--verbose')
const TURN_TIMEOUT_MS = 60_000
const AUDIO_CHUNK_MS = 100
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
  if (pcm.length === 0) throw new Error('Synthetic patient PCM fixture is empty')
  for (let offset = 0; offset < pcm.length; offset += AUDIO_CHUNK_BYTES) {
    const chunk = pcm.subarray(offset, Math.min(offset + AUDIO_CHUNK_BYTES, pcm.length))
    session.pushAudio(chunk.toString('base64'))
    await sleep(AUDIO_CHUNK_MS)
  }
}

/** Generates PCM from fixed in-code text only; no CLI/file/microphone input. */
function generateFixedSyntheticPatientPcm(text: string): Buffer {
  const directory = mkdtempSync(join(tmpdir(), 'historian-synthetic-pcm-'))
  const aiffPath = join(directory, 'reply.aiff')
  const pcmPath = join(directory, 'reply.pcm')
  try {
    const speech = spawnSync(
      '/usr/bin/say',
      ['-v', 'Samantha', '-r', '205', '-o', aiffPath, text],
      { encoding: 'utf8' },
    )
    if (speech.error || speech.status !== 0) {
      throw new Error('Unable to generate the fixed synthetic patient voice fixture')
    }
    const conversion = spawnSync(
      'ffmpeg',
      ['-loglevel', 'error', '-y', '-i', aiffPath, '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', '16000', pcmPath],
      { encoding: 'utf8' },
    )
    if (conversion.error || conversion.status !== 0) {
      throw new Error('Unable to convert the fixed synthetic patient voice fixture to Nova PCM')
    }
    return readFileSync(pcmPath)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function errorMessage(error: unknown): string {
  const candidate = error as { name?: unknown; message?: unknown } | null
  const raw =
    error instanceof Error
      ? error.message
      : candidate && typeof candidate === 'object' &&
          (typeof candidate.message === 'string' || typeof candidate.name === 'string')
        ? [candidate.name, candidate.message].filter((value) => typeof value === 'string').join(': ')
        : String(error)
  if (/not authorized to perform: bedrock:(InvokeModel|InvokeModelWithBidirectionalStream)/i.test(raw)) {
    return 'AWS authorization denied for Nova Sonic streaming on the selected profile'
  }
  if (/content.?filter|blocked.*content|modelStreamErrorException/i.test(raw)) {
    return 'Nova rejected the Comprehensive prompt or turn through its content-safety path'
  }
  return raw
    .replace(/arn:aws:[^\s]+/gi, '[AWS_PRINCIPAL_REDACTED]')
    .replace(/\b\d{12}\b/g, '[AWS_ACCOUNT_REDACTED]')
    .slice(0, 500)
}

function runLocalScenarioContract(): void {
  const requested = argumentValue('--scenario')
  if (requested && !COMPREHENSIVE_SCENARIOS[requested as keyof typeof COMPREHENSIVE_SCENARIOS]) {
    throw new Error(`Unknown PHI-free local scenario: ${requested}`)
  }
  const reports = requested
    ? [runComprehensiveScenario(COMPREHENSIVE_SCENARIOS[requested as keyof typeof COMPREHENSIVE_SCENARIOS])]
    : runAllComprehensiveScenarios()
  for (const report of reports) console.log(`PASS historian_scenario_${report.id}_exchange_${report.finalExchange}`)
}

function waitFor(
  condition: () => boolean,
  description: string,
  errors: string[],
): Promise<void> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const check = () => {
      if (errors.length > 0) {
        reject(new Error(errors[0]))
        return
      }
      if (condition()) {
        resolve()
        return
      }
      if (Date.now() - started >= TURN_TIMEOUT_MS) {
        reject(new Error(`Timed out waiting for ${description}`))
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
        reject(new Error(errors[0]))
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

async function runLiveOpeningSmoke(): Promise<void> {
  const patientPcm = generateFixedSyntheticPatientPcm(
    'I was referred for progressive balance difficulty and several recent falls.',
  )
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
  let userTranscriptCount = 0
  let openingNudgeSent = false
  let silenceTimer: ReturnType<typeof setInterval> | null = null
  const errors: string[] = []
  const prematureTools: string[] = []

  const finalizeAssistantTurn = () => {
    if (assistantFragments.length === 0) return
    const completed = assistantFragments.join(' ').replace(/\s+/g, ' ').trim()
    assistantFragments = []
    assistantTurns.push(completed)
    if (VERBOSE) console.log(`[assistant turn ${assistantTurns.length}] ${completed}`)
  }

  const session = new NovaSonicSession({
    onTextOutput: (role, content) => {
      if (role.toUpperCase() === 'USER') {
        userTranscriptCount += 1
        if (VERBOSE) console.log(`[synthetic patient transcript received] chars=${content.length}`)
        if (!openingNudgeSent) {
          openingNudgeSent = true
          session.pushSystemText(COMPREHENSIVE_AGE_NUDGE)
        }
        return
      }
      assistantFragments.push(content)
    },
    onAssistantAudioEnd: finalizeAssistantTurn,
    onAudioOutput: () => { lastAudioAt = Date.now() },
    onToolUse: (tool) => {
      prematureTools.push(tool.toolName)
      session.pushToolResult(tool.toolUseId, JSON.stringify({
        status: 'error',
        message: 'synthetic opening smoke does not execute tools',
      }))
    },
    onError: (error) => errors.push(`Nova stream error: ${errorMessage(error)}`),
    onUnexpectedStreamEnd: () => errors.push('Nova stream ended before opening acceptance completed'),
  })

  try {
    await session.start(instructions, tools)
    silenceTimer = setInterval(() => session.pushAudio(SILENCE_PCM_BASE64), AUDIO_CHUNK_MS)
    await waitFor(() => assistantTurns.length >= 1, 'assistant referral question', errors)
    const first = assistantTurns[0]
    if (!/refer|sent|neurolog|balance|fall/i.test(first) || !/\?/.test(first)) {
      throw new Error('First Nova turn did not ask about the symptom-based referral reason')
    }
    console.log('PASS nova_start_and_referral_first')

    await waitForAudioQuiet(() => lastAudioAt, errors)
    if (silenceTimer) clearInterval(silenceTimer)
    silenceTimer = null
    await streamPatientAudio(session, patientPcm)
    silenceTimer = setInterval(() => session.pushAudio(SILENCE_PCM_BASE64), AUDIO_CHUNK_MS)
    await waitFor(() => userTranscriptCount >= 1, 'synthetic patient ASR', errors)
    await waitFor(() => assistantTurns.length >= 2, 'assistant age question', errors)
    const second = assistantTurns[1]
    if (!/how old|your age|age are you/i.test(second) || !/\?/.test(second)) {
      throw new Error('Second Nova turn did not ask the patient-reported age question')
    }
    console.log('PASS nova_age_second')
    if (prematureTools.length > 0) {
      throw new Error(`Nova called tool(s) before the first two questions completed: ${prematureTools.join(', ')}`)
    }
    console.log('PASS nova_no_premature_tool_call')
  } finally {
    if (silenceTimer) clearInterval(silenceTimer)
    await session.stop()
  }
}

async function runLiveStateInjectedScenario(scenario: LiveSyntheticScenario): Promise<void> {
  if (!scenario.stateInjection || scenario.purpose === 'opening') {
    throw new Error(`Scenario ${scenario.id} is not a state-injected scenario`)
  }
  const patientPcm = generateFixedSyntheticPatientPcm(scenario.fixedPatientReply)
  const productionInstructions = buildHistorianSystemPrompt(
    'new_patient',
    SYNTHETIC_REFERRAL,
    undefined,
    undefined,
    SYNTHETIC_REFERRAL,
    'comprehensive',
  )
  const instructions = `${productionInstructions}\n\n${scenario.stateInjection}`
  const tools = getHistorianToolsForProvider('nova', 'new_patient')
  const guard = new HistorianRuntimeGuard()
  const errors: string[] = []
  const assistantText: string[] = []
  let userTranscriptCount = 0
  let silenceTimer: ReturnType<typeof setInterval> | null = null
  let acceptedSave: ReturnType<typeof assessLiveSyntheticSave> | null = null
  let coverageSaveNudgeSent = false
  let softWrapCount = 0
  let hardStopCount = 0
  let safetyLatchCount = 0

  const session = new NovaSonicSession({
    onTextOutput: (role, content) => {
      if (role.toUpperCase() === 'ASSISTANT') {
        assistantText.push(content)
        if (VERBOSE) console.log(`[assistant fragment] ${content}`)
        return
      }
      userTranscriptCount += 1
      if (VERBOSE) console.log(`[synthetic patient transcript received] chars=${content.length}`)
      if (scenario.purpose === 'coverage' && !coverageSaveNudgeSent) {
        coverageSaveNudgeSent = true
        session.pushSystemText(LIVE_SYNTHETIC_COVERAGE_SAVE_NUDGE)
      }
      const decision = guard.patientTurn({
        interviewMode: 'comprehensive',
        exchange: scenario.logicalExchange,
        text: content,
      })
      if (decision.activateSafety) safetyLatchCount += 1
      if (decision.injectText) {
        softWrapCount += 1
        session.pushSystemText(
          scenario.purpose === 'wrap'
            ? `${decision.injectText}\n${LIVE_SYNTHETIC_WRAP_SAVE_NUDGE}`
            : decision.injectText,
        )
      }
      if (decision.requestFinalization === 'hard_stop') {
        hardStopCount += 1
        session.pushSystemText(COMPREHENSIVE_HARD_STOP_SAVE_NUDGE)
      }
    },
    onToolUse: (tool) => {
      if (tool.toolName !== 'save_interview_output') {
        if (!guard.acceptsInterviewActivity()) {
          session.pushToolResult(tool.toolUseId, JSON.stringify({
            success: false,
            status: 'interview_terminal',
          }))
          return
        }
        errors.push(`Unexpected live tool call: ${tool.toolName}`)
        session.pushToolResult(tool.toolUseId, JSON.stringify({ status: 'error' }))
        return
      }
      let args: Record<string, unknown>
      try {
        const parsed = JSON.parse(tool.content)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('tool input was not an object')
        }
        args = parsed as Record<string, unknown>
      } catch {
        errors.push('Nova save_interview_output input was not valid JSON')
        session.pushToolResult(tool.toolUseId, JSON.stringify({ status: 'error' }))
        return
      }
      const toolSafetyEscalated = args.safety_escalated === true
      const toolPatientRequestedStop = args.patient_requested_stop === true
      const structured = { ...args }
      delete structured.narrative_summary
      delete structured.red_flags
      delete structured.safety_escalated
      delete structured.patient_requested_stop
      const assessment = assessLiveSyntheticSave({
        scenario,
        structured,
        toolSafetyEscalated,
        toolPatientRequestedStop,
      })
      if (!assessment.accepted) {
        errors.push(
          `Live save failed ${scenario.id}: ${assessment.reason}` +
          (assessment.remainingDomains?.length
            ? ` (${assessment.remainingDomains.join(', ')})`
            : ''),
        )
        session.pushToolResult(tool.toolUseId, JSON.stringify({
          success: false,
          status: assessment.reason,
          remaining_domains: assessment.remainingDomains ?? [],
        }))
        return
      }
      acceptedSave = assessment
      session.pushToolResult(tool.toolUseId, JSON.stringify({ success: true }))
    },
    onError: (error) => errors.push(`Nova stream error: ${errorMessage(error)}`),
    onUnexpectedStreamEnd: () => errors.push(`Nova stream ended before ${scenario.id} completed`),
  })

  try {
    // Disable the production greeting only for this explicitly labeled state
    // injection. All real application sessions keep the default greeting.
    await session.start(instructions, tools, undefined, { sendGreetingKickoff: false })
    silenceTimer = setInterval(() => session.pushAudio(SILENCE_PCM_BASE64), AUDIO_CHUNK_MS)
    await sleep(500)
    if (silenceTimer) clearInterval(silenceTimer)
    silenceTimer = null
    await streamPatientAudio(session, patientPcm)
    silenceTimer = setInterval(() => session.pushAudio(SILENCE_PCM_BASE64), AUDIO_CHUNK_MS)

    await waitFor(() => userTranscriptCount >= 1, `${scenario.id} ASR`, errors)
    await waitFor(() => acceptedSave?.accepted === true, `${scenario.id} accepted save`, errors)

    if (scenario.purpose === 'safety') {
      if (safetyLatchCount !== 1 || guard.terminalReason() !== 'safety_escalated') {
        throw new Error('State-injected emergency did not activate the deterministic transcript safety latch exactly once')
      }
      await waitFor(
        () => safetyResponseHasRequiredResources(assistantText.join(' ')),
        'Nova emergency response resources',
        errors,
      )
    }
    if (scenario.purpose === 'wrap' && softWrapCount !== 1) {
      throw new Error(`Expected one production soft-wrap injection, received ${softWrapCount}`)
    }
    if (scenario.purpose === 'hard_stop') {
      if (hardStopCount !== 1 || guard.terminalReason() !== 'hard_stop') {
        throw new Error(`Expected one production hard-stop injection, received ${hardStopCount}`)
      }
    }

    console.log(
      `PASS live_state_injected_${scenario.id}_exchange_${scenario.logicalExchange}_${acceptedSave?.reason}`,
    )
  } finally {
    if (silenceTimer) clearInterval(silenceTimer)
    await session.stop()
  }
}

type LiveRelayModule = typeof import('../services/nova-sonic-relay/src/server.js')

/**
 * Forced-short, PHI-free live continuation acceptance.
 *
 * This runs the real local relay and three real Bedrock Nova streams while
 * keeping one WebSocket, one synthetic application session id, one monotonic
 * transcript, and one audio sequence. Test-only relay timing forces two
 * between-turn rotations. It does not exercise the browser microphone/player,
 * application persistence, deployed infrastructure, or 45/60-turn endurance.
 */
async function runLiveRelayContinuationAcceptance(): Promise<void> {
  const fixedPcm = {
    referral: generateFixedSyntheticPatientPcm(
      'I was referred for progressive balance difficulty and several recent falls.',
    ),
    age: generateFixedSyntheticPatientPcm('I am fifty one years old.'),
    onset: generateFixedSyntheticPatientPcm(
      'The balance difficulty began gradually about six months ago.',
    ),
    frequency: generateFixedSyntheticPatientPcm(
      'It is present most days and is worse when I turn quickly.',
    ),
  }
  const instructions = buildHistorianSystemPrompt(
    'new_patient',
    SYNTHETIC_REFERRAL,
    undefined,
    undefined,
    SYNTHETIC_REFERRAL,
    'comprehensive',
  )
  const tools = getHistorianToolsForProvider('nova', 'new_patient')
  const appSessionId = '00000000-0000-4000-8000-00000000c003'
  const startedAt = Date.now()
  const transcript: HistorianTranscriptEntry[] = []
  const observedText: Array<{
    role: 'assistant' | 'user'
    text: string
    segmentId: number
  }> = []
  const audioFramesBySegment = new Map<number, number>()
  const checkpoints: HistorianContinuationCheckpointV1[] = []
  const inbox: ServerMsg[] = []
  const errors: string[] = []
  let nextAudioSeq = 0
  let relay: LiveRelayModule | null = null
  let client: WebSocket | null = null
  let clientClosing = false

  const envNames = [
    'NODE_ENV',
    'PORT',
    'NOVA_RELAY_SHARED_SECRET',
    'NOVA_RELAY_ALLOWED_ORIGINS',
    'NOVA_APP_CONTINUATION_V1',
    'NOVA_CONTINUATION_TEST_DUE_MS',
    'NOVA_CONTINUATION_TEST_BARRIER_MS',
    'NOVA_CONTINUATION_TEST_DEADLINE_MS',
    'TRANSCRIBE_MEDICAL_ENABLED',
  ] as const
  const priorEnv = new Map(envNames.map((name) => [name, process.env[name]]))
  const sharedSecret = randomBytes(32).toString('hex')
  const origin = 'http://synthetic-continuation.test'

  const sendRelay = (message: unknown) => {
    if (!client || client.readyState !== WebSocket.OPEN) {
      throw new Error('Live continuation relay WebSocket is not open')
    }
    client.send(JSON.stringify(message))
  }

  const appendTranscript = (
    role: 'assistant' | 'user',
    text: string,
    segmentId: number,
  ) => {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (!normalized) return
    observedText.push({ role, text: normalized, segmentId })
    const last = transcript.at(-1)
    if (role === 'assistant' && last?.role === 'assistant' && last.text === normalized) return
    transcript.push({
      role,
      text: normalized,
      timestamp: Math.floor((Date.now() - startedAt) / 1000),
      seq: transcript.length + 1,
    })
    if (VERBOSE) console.log(`[live relay segment ${segmentId} ${role}] ${normalized}`)
  }

  const waitForRelay = async <T extends ServerMsg['t']>(
    type: T,
    description: string,
    predicate?: (message: Extract<ServerMsg, { t: T }>) => boolean,
  ): Promise<Extract<ServerMsg, { t: T }>> => {
    const waitStarted = Date.now()
    while (Date.now() - waitStarted < TURN_TIMEOUT_MS) {
      if (errors.length > 0) throw new Error(errors[0])
      const index = inbox.findIndex((message) => {
        if (message.t !== type) return false
        return !predicate || predicate(message as Extract<ServerMsg, { t: T }>)
      })
      if (index >= 0) {
        return inbox.splice(index, 1)[0] as Extract<ServerMsg, { t: T }>
      }
      await sleep(50)
    }
    throw new Error(`Timed out waiting for ${description}`)
  }

  const waitForCondition = async (condition: () => boolean, description: string) => {
    const waitStarted = Date.now()
    while (Date.now() - waitStarted < TURN_TIMEOUT_MS) {
      if (errors.length > 0) throw new Error(errors[0])
      if (condition()) return
      await sleep(50)
    }
    throw new Error(`Timed out waiting for ${description}`)
  }

  const streamRelayAudio = async (
    pcm: Buffer,
    options: { sequenced: boolean; tailSilenceChunks?: number },
  ) => {
    for (let offset = 0; offset < pcm.length; offset += AUDIO_CHUNK_BYTES) {
      const chunk = pcm.subarray(offset, Math.min(offset + AUDIO_CHUNK_BYTES, pcm.length))
      sendRelay({
        t: 'audio',
        pcm: chunk.toString('base64'),
        ...(options.sequenced ? { audioSeq: ++nextAudioSeq } : {}),
      })
      await sleep(AUDIO_CHUNK_MS)
    }
    for (let index = 0; index < (options.tailSilenceChunks ?? 8); index += 1) {
      sendRelay({
        t: 'audio',
        pcm: SILENCE_PCM_BASE64,
        ...(options.sequenced ? { audioSeq: ++nextAudioSeq } : {}),
      })
      await sleep(AUDIO_CHUNK_MS)
    }
  }

  const exchangeCount = () => transcript.reduce((count, entry, index) => (
    entry.role === 'assistant' && (index === 0 || transcript[index - 1].role === 'user')
      ? count + 1
      : count
  ), 0)

  const rotate = async (
    barrier: Extract<ServerMsg, { t: 'continuationBarrier' }>,
  ): Promise<Extract<ServerMsg, { t: 'continuationReady' }>> => {
    const rotationStartedAt = Date.now()
    const snapshot = transcript.map((entry) => ({ ...entry }))
    const last = snapshot.at(-1)
    if (!last || last.role !== 'assistant' || last.seq !== snapshot.length) {
      throw new Error('Live relay checkpoint was not at a final assistant question')
    }
    const checkpoint = assertHistorianContinuationCheckpoint({
      version: 1,
      appSessionId,
      fromSegmentId: barrier.segmentId,
      transcriptThroughSeq: last.seq,
      transcriptHash: hashHistorianContinuationTranscript(snapshot),
      transcript: snapshot,
      exchangeCount: exchangeCount(),
      patientTurnCount: snapshot.filter((entry) => entry.role === 'user').length,
      elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
      awaitingAnswerTo: { seq: last.seq, text: last.text },
      answeredQuestionPairs: buildHistorianAnsweredQuestionPairs(snapshot),
      coverage: conservativeHistorianContinuationCoverage(),
      runtimeGuard: { softWrapIssued: false, terminalReason: null },
      safetyEscalated: false,
      terminationReason: null,
      administeredScaleIds: [],
      activeScale: null,
      pendingTools: [],
    })
    checkpoints.push(checkpoint)
    sendRelay({ t: 'continuationCommit', barrierId: barrier.barrierId, checkpoint })
    const ready = await waitForRelay(
      'continuationReady',
      `segment ${barrier.segmentId + 1} ready acknowledgement`,
      (message) => message.barrierId === barrier.barrierId,
    )
    if (
      ready.fromSegmentId !== barrier.segmentId ||
      ready.segmentId !== barrier.segmentId + 1 ||
      ready.lastAudioSeq !== barrier.lastAudioSeq ||
      ready.transcriptThroughSeq !== last.seq
    ) {
      throw new Error('Live relay continuation ready acknowledgement did not match its checkpoint')
    }
    if (Date.now() - rotationStartedAt > 30_000) {
      throw new Error('Live Nova continuation exceeded the production 30-second handoff window')
    }
    return ready
  }

  try {
    process.env.NODE_ENV = 'test'
    process.env.PORT = '0'
    process.env.NOVA_RELAY_SHARED_SECRET = sharedSecret
    process.env.NOVA_RELAY_ALLOWED_ORIGINS = origin
    process.env.NOVA_APP_CONTINUATION_V1 = 'true'
    process.env.NOVA_CONTINUATION_TEST_DUE_MS = '10'
    process.env.NOVA_CONTINUATION_TEST_BARRIER_MS = '20'
    // The forced first barrier occurs after the opening sequence, well after
    // segment start. Give the test relay a wider absolute clock, then enforce
    // the real production 30-second barrier-to-ready budget in rotate().
    process.env.NOVA_CONTINUATION_TEST_DEADLINE_MS = '60000'
    process.env.TRANSCRIBE_MEDICAL_ENABLED = 'false'

    relay = await import('../services/nova-sonic-relay/src/server.js')
    if (!relay.server.listening) await once(relay.server, 'listening')
    const address = relay.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Live continuation relay did not bind a local TCP port')
    }
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 300 }))
      .toString('base64url')
    const signature = createHmac('sha256', sharedSecret).update(payload).digest('base64url')
    client = new WebSocket(
      `ws://127.0.0.1:${address.port}`,
      ['nova.v1', `${payload}.${signature}`],
      { origin },
    )
    client.on('message', (raw) => {
      let message: ServerMsg
      try {
        message = JSON.parse(raw.toString()) as ServerMsg
      } catch {
        errors.push('Live continuation relay returned malformed JSON')
        return
      }
      if (message.t === 'assistantTranscript') {
        appendTranscript('assistant', message.text, message.segmentId ?? 1)
      } else if (message.t === 'userTranscript') {
        appendTranscript('user', message.text, message.segmentId ?? 1)
      } else if (message.t === 'audio') {
        const segmentId = message.segmentId ?? 1
        audioFramesBySegment.set(segmentId, (audioFramesBySegment.get(segmentId) ?? 0) + 1)
      } else if (message.t === 'error') {
        errors.push(`Nova relay error: ${message.message}`)
      } else if (message.t === 'continuationFailed') {
        errors.push(`Nova continuation failed: ${message.reason}`)
      } else if (message.t === 'continuationRecovered') {
        errors.push(
          `Nova continuation candidate rolled back before promotion: ${message.reason}`,
        )
      } else if (message.t === 'sessionEnded' && !clientClosing) {
        errors.push(`Nova relay ended unexpectedly: ${message.reason}`)
      } else if (message.t === 'toolCall') {
        sendRelay({
          t: 'toolResult',
          toolUseId: message.toolUseId,
          output: JSON.stringify({ status: 'error', message: 'unexpected live acceptance tool' }),
          segmentId: message.segmentId,
        })
        errors.push(`Unexpected live continuation tool call: ${message.toolName}`)
      }
      inbox.push(message)
    })
    client.on('close', (code) => {
      if (!clientClosing) errors.push(`Live continuation relay WebSocket closed (${code})`)
    })
    await once(client, 'open')
    sendRelay({
      t: 'start',
      instructions,
      tools,
      interviewMode: 'comprehensive',
    })

    const initialSilence = setInterval(() => {
      try { sendRelay({ t: 'audio', pcm: SILENCE_PCM_BASE64 }) } catch {}
    }, AUDIO_CHUNK_MS)
    try {
      await waitForCondition(
        () => observedText.some((entry) => entry.segmentId === 1 && entry.role === 'assistant'),
        'initial live Nova referral question',
      )
      await waitForRelay('aiSpeechStop', 'initial assistant audio end', (message) => message.segmentId === 1)
    } finally {
      clearInterval(initialSilence)
    }

    await streamRelayAudio(fixedPcm.referral, { sequenced: false })
    await waitForCondition(
      () => observedText.some((entry) => entry.segmentId === 1 && entry.role === 'user'),
      'segment one synthetic referral ASR',
    )
    await waitForCondition(
      () => observedText.some((entry) =>
        entry.segmentId === 1 && entry.role === 'assistant' &&
        /how old|your age|age are you/i.test(entry.text),
      ),
      'segment one patient-reported age question',
    )
    await waitForRelay('aiSpeechStop', 'age question audio end', (message) => message.segmentId === 1)

    sendRelay({ t: 'audio', pcm: SILENCE_PCM_BASE64, audioSeq: ++nextAudioSeq })
    await waitForRelay('continuationDue', 'segment one continuation due', (message) => message.segmentId === 1)
    await streamRelayAudio(fixedPcm.age, { sequenced: true })
    const barrier1 = await waitForRelay(
      'continuationBarrier',
      'segment one between-turn barrier',
      (message) => message.segmentId === 1,
    )
    const pendingQuestion1 = transcript.at(-1)?.text
    const bufferedOnset = streamRelayAudio(fixedPcm.onset, { sequenced: true })
    const [rotationResult, bufferedOnsetResult] = await Promise.allSettled([
      rotate(barrier1),
      bufferedOnset,
    ])
    if (rotationResult.status === 'rejected') throw rotationResult.reason
    if (bufferedOnsetResult.status === 'rejected') throw bufferedOnsetResult.reason
    const ready2 = rotationResult.value

    const barrier2 = await waitForRelay(
      'continuationBarrier',
      'segment two between-turn barrier after buffered PCM',
      (message) => message.segmentId === 2,
    )
    await waitForCondition(
      () => observedText.some((entry) => entry.segmentId === 2 && entry.role === 'user') &&
        observedText.some((entry) => entry.segmentId === 2 && entry.role === 'assistant'),
      'segment two ASR and assistant response',
    )
    const pendingQuestion2 = transcript.at(-1)?.text
    const ready3 = await rotate(barrier2)

    const segment3TextBeforeInput = observedText.filter((entry) => entry.segmentId === 3).length
    const segment3AudioBeforeInput = audioFramesBySegment.get(3) ?? 0
    await sleep(1000)
    if (
      observedText.filter((entry) => entry.segmentId === 3).length !== segment3TextBeforeInput ||
      (audioFramesBySegment.get(3) ?? 0) !== segment3AudioBeforeInput
    ) {
      throw new Error('Replacement Nova segment spoke before receiving the pending answer')
    }

    await streamRelayAudio(fixedPcm.frequency, { sequenced: true })
    await waitForCondition(
      () => observedText.some((entry) => entry.segmentId === 3 && entry.role === 'user') &&
        observedText.some((entry) => entry.segmentId === 3 && entry.role === 'assistant'),
      'segment three ASR and assistant response',
    )
    await waitForRelay('aiSpeechStop', 'segment three assistant audio end', (message) => message.segmentId === 3)

    const segment2Text = observedText.filter((entry) => entry.segmentId === 2)
    const segment3Text = observedText.filter((entry) => entry.segmentId === 3)
    if (segment2Text[0]?.role !== 'user' || segment3Text[0]?.role !== 'user') {
      throw new Error('A replacement Nova segment emitted a duplicate greeting before patient ASR')
    }
    if (
      !pendingQuestion1 ||
      !pendingQuestion2 ||
      segment2Text.some((entry) => entry.role === 'assistant' && entry.text === pendingQuestion1) ||
      segment3Text.some((entry) => entry.role === 'assistant' && entry.text === pendingQuestion2)
    ) {
      throw new Error('A replacement Nova segment repeated the already-heard pending question')
    }
    if (
      ready2.segmentId !== 2 ||
      ready3.segmentId !== 3 ||
      checkpoints.length !== 2 ||
      checkpoints.some((checkpoint) => checkpoint.appSessionId !== appSessionId) ||
      transcript.some((entry, index) => entry.seq !== index + 1)
    ) {
      throw new Error('Live continuation did not preserve one monotonic application session')
    }

    console.log('PASS live_forced_short_relay_continuation_three_segments')
    console.log('PASS live_forced_short_relay_continuation_each_handoff_within_30s')
    console.log('PASS live_forced_short_relay_continuation_one_greeting_monotonic_transcript')
    console.log('PASS live_forced_short_relay_continuation_buffered_pcm_after_ready')
    console.log('PASS LIVE_CONTINUATION_CONSERVATIVE_REPLAY')
    console.log('LIMIT live_forced_short_not_endurance_not_persistence_not_deployed')
  } finally {
    clientClosing = true
    if (client?.readyState === WebSocket.OPEN) {
      try { client.send(JSON.stringify({ t: 'stop' })) } catch {}
      await Promise.race([once(client, 'close').catch(() => undefined), sleep(1500)])
    }
    if (client && client.readyState !== WebSocket.CLOSED) client.terminate()
    if (relay) {
      await new Promise<void>((resolve) => relay!.wss.close(() => resolve()))
      await new Promise<void>((resolve) => relay!.server.close(() => resolve()))
    }
    for (const name of envNames) {
      const previous = priorEnv.get(name)
      if (previous === undefined) delete process.env[name]
      else process.env[name] = previous
    }
  }
}

function requestedLiveScenarios(): LiveSyntheticScenario[] {
  if (process.argv.includes('--live-suite')) {
    return LIVE_SYNTHETIC_SCENARIO_IDS.map((id) => LIVE_SYNTHETIC_SCENARIOS[id])
  }
  const requested = (argumentValue('--live-scenario') ?? 'opening') as LiveSyntheticScenarioId
  if (!LIVE_SYNTHETIC_SCENARIO_IDS.includes(requested)) {
    throw new Error(`Unknown PHI-free live scenario: ${requested}`)
  }
  return [LIVE_SYNTHETIC_SCENARIOS[requested]]
}

async function main(): Promise<void> {
  if (!process.argv.includes('--live')) {
    runLocalScenarioContract()
    return
  }

  if (process.argv.includes('--live-continuation')) {
    try {
      await runLiveRelayContinuationAcceptance()
    } catch (error) {
      if (isUnavailableLiveProviderFailure(error)) {
        console.log(`NOT_RUN continuation nova_live_provider_or_iam ${errorMessage(error)}`)
        return
      }
      throw error
    }
    return
  }

  for (const scenario of requestedLiveScenarios()) {
    try {
      if (scenario.purpose === 'opening') await runLiveOpeningSmoke()
      else await runLiveStateInjectedScenario(scenario)
    } catch (error) {
      if (isUnavailableLiveProviderFailure(error)) {
        console.log(`NOT_RUN ${scenario.id} nova_live_provider_or_iam ${errorMessage(error)}`)
        return
      }
      throw error
    }
  }
}

main().catch((error) => {
  console.error(`FAIL ${errorMessage(error)}`)
  process.exitCode = 1
})
