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
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildHistorianSystemPrompt, getHistorianToolsForProvider } from '../src/lib/historianPrompts'
import { NovaSonicSession } from '../services/nova-sonic-relay/src/novaSonicSession.js'
import { COMPREHENSIVE_AGE_NUDGE } from '../services/nova-sonic-relay/src/comprehensiveOpening.js'
import {
  COMPREHENSIVE_HARD_STOP_SAVE_NUDGE,
} from '../src/lib/historian/comprehensiveCompletionPolicy'
import {
  COMPREHENSIVE_SCENARIOS,
  runAllComprehensiveScenarios,
  runComprehensiveScenario,
} from '../src/lib/historian/comprehensiveScenarioContract'
import {
  LIVE_SYNTHETIC_SCENARIO_IDS,
  LIVE_SYNTHETIC_SCENARIOS,
  assessLiveSyntheticSave,
  safetyResponseHasRequiredResources,
  type LiveSyntheticScenario,
  type LiveSyntheticScenarioId,
} from '../src/lib/historian/liveSyntheticAcceptance'
import { isUnavailableLiveProviderFailure } from '../src/lib/historian/liveSmokeFailurePolicy'
import { HistorianRuntimeGuard } from '../src/lib/historian/runtimeGuard'

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
    onCompletionEnd: finalizeAssistantTurn,
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
      const decision = guard.patientTurn({
        interviewMode: 'comprehensive',
        exchange: scenario.logicalExchange,
        text: content,
      })
      if (decision.activateSafety) safetyLatchCount += 1
      if (decision.injectText) {
        softWrapCount += 1
        session.pushSystemText(decision.injectText)
      }
      if (decision.requestFinalization === 'hard_stop') {
        hardStopCount += 1
        session.pushSystemText(COMPREHENSIVE_HARD_STOP_SAVE_NUDGE)
      }
    },
    onToolUse: (tool) => {
      if (tool.toolName !== 'save_interview_output') {
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
