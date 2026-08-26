/**
 * PHI-free, opt-in Comprehensive Historian Nova rollover acceptance.
 *
 * Every patient utterance is fixed in code and synthesized locally. The live
 * modes use one local relay WebSocket and real Bedrock Nova streams, but no
 * browser microphone/player, application API, database, migration, worker,
 * deployment, or patient data. NODE_ENV=test-only assistant boundaries force
 * deterministic rollovers without adding a remotely callable test command.
 *
 * Usage (one mode per process):
 *   AWS_PROFILE=<authorized> npm run historian:nova-mvp -- --live --live-rollover-emergency
 *   AWS_PROFILE=<authorized> npm run historian:nova-mvp -- --live --live-active-scale
 *   AWS_PROFILE=<authorized> npm run historian:nova-mvp -- --live --live-max-replay
 *   AWS_PROFILE=<authorized> npm run historian:nova-mvp -- --live --live-endurance-60
 */

import { spawnSync } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'

import { buildHistorianSystemPrompt, getHistorianToolsForProvider } from '../src/lib/historianPrompts'
import {
  MAX_CONTINUATION_HISTORY_BYTES,
  MAX_CONTINUATION_HISTORY_MESSAGE_BYTES,
  assertHistorianContinuationCheckpoint,
  buildHistorianAnsweredQuestionPairs,
  buildNovaHistorianContinuationHistory,
  conservativeHistorianContinuationCoverage,
  hashHistorianContinuationTranscript,
  type HistorianContinuationCheckpointV1,
} from '../src/lib/historian/continuationState'
import { safetyResponseHasRequiredResources } from '../src/lib/historian/liveSyntheticAcceptance'
import { isUnavailableLiveProviderFailure } from '../src/lib/historian/liveSmokeFailurePolicy'
import { HistorianRuntimeGuard, type HistorianRuntimeGuardSnapshot } from '../src/lib/historian/runtimeGuard'
import type { HistorianTranscriptEntry } from '../src/lib/historianTypes'
import type { ServerMsg } from '../services/nova-sonic-relay/src/wsProtocol.js'

const AUDIO_CHUNK_MS = 100
const AUDIO_CHUNK_BYTES = (16_000 * 2 * AUDIO_CHUNK_MS) / 1000
const SILENCE_PCM_BASE64 = Buffer.alloc(AUDIO_CHUNK_BYTES, 0).toString('base64')
const TURN_TIMEOUT_MS = 60_000
const SYNTHETIC_REFERRAL = 'progressive balance difficulty and several recent falls'
const VERBOSE = process.argv.includes('--verbose')

type LiveMode =
  | 'rollover-emergency'
  | 'active-scale'
  | 'max-replay'
  | 'endurance-60'

type RelayModule = typeof import('../services/nova-sonic-relay/src/server.js')
type ToolCall = Extract<ServerMsg, { t: 'toolCall' }>
type Barrier = Extract<ServerMsg, { t: 'continuationBarrier' }>
type Ready = Extract<ServerMsg, { t: 'continuationReady' }>

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function errorMessage(error: unknown): string {
  const candidate = error as { name?: unknown; message?: unknown } | null
  const raw = error instanceof Error
    ? error.message
    : candidate && typeof candidate === 'object' &&
        (typeof candidate.message === 'string' || typeof candidate.name === 'string')
      ? [candidate.name, candidate.message].filter((value) => typeof value === 'string').join(': ')
      : String(error)
  if (/not authorized to perform: bedrock:(InvokeModel|InvokeModelWithBidirectionalStream)/i.test(raw)) {
    return 'AWS authorization denied for Nova Sonic streaming on the selected profile'
  }
  if (/content.?filter|blocked.*content|modelStreamErrorException/i.test(raw)) {
    return 'Nova rejected the fixed synthetic acceptance through its content-safety path'
  }
  return raw
    .replace(/arn:aws:[^\s]+/gi, '[AWS_PRINCIPAL_REDACTED]')
    .replace(/\b\d{12}\b/g, '[AWS_ACCOUNT_REDACTED]')
    .slice(0, 500)
}

/** Fixed in-code text only; never accepts a path, microphone, or supplied text. */
function generateFixedSyntheticPcm(text: string): Buffer {
  const directory = mkdtempSync(join(tmpdir(), 'historian-mvp-synthetic-pcm-'))
  const aiffPath = join(directory, 'reply.aiff')
  const pcmPath = join(directory, 'reply.pcm')
  try {
    const speech = spawnSync(
      '/usr/bin/say',
      ['-v', 'Samantha', '-r', '225', '-o', aiffPath, text],
      { encoding: 'utf8' },
    )
    if (speech.error || speech.status !== 0) {
      throw new Error('Unable to generate fixed synthetic patient speech')
    }
    const conversion = spawnSync(
      'ffmpeg',
      ['-loglevel', 'error', '-y', '-i', aiffPath, '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', '16000', pcmPath],
      { encoding: 'utf8' },
    )
    if (conversion.error || conversion.status !== 0) {
      throw new Error('Unable to convert fixed synthetic speech to Nova PCM')
    }
    return readFileSync(pcmPath)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function productionInstructions(extra: string): string {
  return `${buildHistorianSystemPrompt(
    'new_patient',
    SYNTHETIC_REFERRAL,
    undefined,
    undefined,
    SYNTHETIC_REFERRAL,
    'comprehensive',
  )}\n\n${extra}`
}

function exactAsciiText(label: string, bytes: number, suffix = ''): string {
  const unit = `${label} synthetic neutral history. `
  const bodyBytes = bytes - Buffer.byteLength(suffix)
  if (bodyBytes < 1) throw new Error('Synthetic maximum-history target is too small')
  return unit.repeat(Math.ceil(bodyBytes / unit.length)).slice(0, bodyBytes) + suffix
}

function maximumHistoryTranscript(): HistorianTranscriptEntry[] {
  return [
    { seq: 1, role: 'assistant', text: 'Synthetic opening?', timestamp: 0 },
    { seq: 2, role: 'user', text: exactAsciiText('U1', 45_000), timestamp: 1 },
    { seq: 3, role: 'assistant', text: exactAsciiText('A1', 45_000), timestamp: 2 },
    { seq: 4, role: 'user', text: exactAsciiText('U2', 45_000), timestamp: 3 },
    { seq: 5, role: 'assistant', text: exactAsciiText('A2', 45_000), timestamp: 4 },
    { seq: 6, role: 'user', text: exactAsciiText('U3', 5_000), timestamp: 5 },
    {
      seq: 7,
      role: 'assistant',
      text: exactAsciiText('A3', 5_000, ' What is the fixed synthetic answer?'),
      timestamp: 6,
    },
  ]
}

function exchangeCount(transcript: readonly HistorianTranscriptEntry[]): number {
  return transcript.reduce((count, entry, index) => (
    entry.role === 'assistant' && (index === 0 || transcript[index - 1].role === 'user')
      ? count + 1
      : count
  ), 0)
}

class LiveRelayHarness {
  readonly transcript: HistorianTranscriptEntry[] = []
  readonly observedText: Array<{ role: 'assistant' | 'user'; text: string; segmentId: number }> = []
  readonly checkpoints: HistorianContinuationCheckpointV1[] = []
  readonly handoffDurationsMs: number[] = []
  readonly audioFramesBySegment = new Map<number, number>()
  readonly errors: string[] = []
  private readonly inbox: ServerMsg[] = []
  private readonly barrierReceivedAt = new Map<string, number>()
  private readonly startedAt = Date.now()
  private readonly sharedSecret = randomBytes(32).toString('hex')
  private readonly origin = 'http://synthetic-historian-mvp.test'
  private readonly envNames = [
    'NODE_ENV',
    'PORT',
    'NOVA_RELAY_SHARED_SECRET',
    'NOVA_RELAY_ALLOWED_ORIGINS',
    'NOVA_APP_CONTINUATION_V1',
    'NOVA_CONTINUATION_TEST_BOUNDARY_EXCHANGES',
    'NOVA_CONTINUATION_TEST_BOUNDARY_AFTER_TOOL',
    'NOVA_CONTINUATION_TEST_DEADLINE_MS',
    'NOVA_CONTINUATION_TEST_STABILITY_MS',
    'TRANSCRIBE_MEDICAL_ENABLED',
  ] as const
  private readonly priorEnv = new Map(this.envNames.map((name) => [name, process.env[name]]))
  private relay: RelayModule | null = null
  private client: WebSocket | null = null
  private closing = false
  private nextAudioSeq = 0
  private assistantAudioStops = 0

  constructor(private readonly options: {
    instructions: string
    tools: unknown[]
    appSessionId: string
    boundaryExchanges: number[]
    boundaryAfterTool?: 'scale_step'
    onToolCall?: (tool: ToolCall) => void
  }) {}

  async open(): Promise<void> {
    process.env.NODE_ENV = 'test'
    process.env.PORT = '0'
    process.env.NOVA_RELAY_SHARED_SECRET = this.sharedSecret
    process.env.NOVA_RELAY_ALLOWED_ORIGINS = this.origin
    process.env.NOVA_APP_CONTINUATION_V1 = 'true'
    process.env.NOVA_CONTINUATION_TEST_BOUNDARY_EXCHANGES = this.options.boundaryExchanges.join(',')
    if (this.options.boundaryAfterTool) {
      process.env.NOVA_CONTINUATION_TEST_BOUNDARY_AFTER_TOOL = this.options.boundaryAfterTool
    } else {
      delete process.env.NOVA_CONTINUATION_TEST_BOUNDARY_AFTER_TOOL
    }
    process.env.NOVA_CONTINUATION_TEST_DEADLINE_MS = '30000'
    process.env.NOVA_CONTINUATION_TEST_STABILITY_MS = '1000'
    process.env.TRANSCRIBE_MEDICAL_ENABLED = 'false'

    this.relay = await import('../services/nova-sonic-relay/src/server.js')
    if (!this.relay.server.listening) await once(this.relay.server, 'listening')
    const address = this.relay.server.address()
    if (!address || typeof address === 'string') throw new Error('Synthetic MVP relay did not bind a local port')
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 }))
      .toString('base64url')
    const signature = createHmac('sha256', this.sharedSecret).update(payload).digest('base64url')
    this.client = new WebSocket(
      `ws://127.0.0.1:${address.port}`,
      ['nova.v1', `${payload}.${signature}`],
      { origin: this.origin },
    )
    this.client.on('message', (raw) => this.handleMessage(raw.toString()))
    this.client.on('close', (code) => {
      if (!this.closing) this.errors.push(`Nova relay WebSocket closed unexpectedly (${code})`)
    })
    await once(this.client, 'open')
    this.send({
      t: 'start',
      instructions: this.options.instructions,
      tools: this.options.tools,
      interviewMode: 'comprehensive',
    })
  }

  private handleMessage(raw: string): void {
    let message: ServerMsg
    try {
      message = JSON.parse(raw) as ServerMsg
    } catch {
      this.errors.push('Nova relay returned malformed JSON')
      return
    }
    if (message.t === 'assistantTranscript') {
      this.appendTranscript('assistant', message.text, message.segmentId ?? 1)
    } else if (message.t === 'userTranscript') {
      this.appendTranscript('user', message.text, message.segmentId ?? 1)
    } else if (message.t === 'aiSpeechStop') {
      this.assistantAudioStops += 1
    } else if (message.t === 'audio') {
      const segmentId = message.segmentId ?? 1
      this.audioFramesBySegment.set(segmentId, (this.audioFramesBySegment.get(segmentId) ?? 0) + 1)
    } else if (message.t === 'toolCall') {
      try {
        if (this.options.onToolCall) this.options.onToolCall(message)
        else {
          this.sendToolResult(message, { status: 'error', message: 'unexpected synthetic acceptance tool' })
          this.fail(`Unexpected live tool call: ${message.toolName}`)
        }
      } catch (error) {
        this.sendToolResult(message, { status: 'error', message: 'synthetic tool handler failed' })
        this.fail(errorMessage(error))
      }
    } else if (message.t === 'error') {
      this.errors.push(`Nova relay error: ${message.message}`)
    } else if (message.t === 'continuationFailed') {
      this.errors.push(`Nova continuation failed: ${message.reason}`)
    } else if (message.t === 'continuationRecovered') {
      this.errors.push(`Nova continuation candidate rolled back: ${message.reason}`)
    } else if (message.t === 'sessionEnded' && !this.closing) {
      this.errors.push(`Nova relay ended unexpectedly: ${message.reason}`)
    }
    if (message.t === 'continuationBarrier') {
      this.barrierReceivedAt.set(message.barrierId, Date.now())
    }
    this.inbox.push(message)
  }

  private appendTranscript(role: 'assistant' | 'user', text: string, segmentId: number): void {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (!normalized) return
    if (role === 'assistant') {
      const lastAssistant = [...this.transcript].reverse().find((entry) => entry.role === 'assistant')
      if (lastAssistant?.text === normalized) return
    }
    this.observedText.push({ role, text: normalized, segmentId })
    this.transcript.push({
      role,
      text: normalized,
      timestamp: Math.floor((Date.now() - this.startedAt) / 1000),
      seq: this.transcript.length + 1,
    })
    if (VERBOSE) console.log(`[segment ${segmentId} ${role}] chars=${normalized.length}`)
  }

  private send(message: unknown): void {
    if (!this.client || this.client.readyState !== WebSocket.OPEN) {
      throw new Error('Synthetic MVP relay WebSocket is not open')
    }
    this.client.send(JSON.stringify(message))
  }

  sendToolResult(tool: ToolCall, output: unknown): void {
    this.send({
      t: 'toolResult',
      toolUseId: tool.toolUseId,
      output: JSON.stringify(output),
      segmentId: tool.segmentId,
    })
  }

  sendSystemText(text: string): void {
    this.send({ t: 'systemText', text })
  }

  fail(message: string): void {
    this.errors.push(message)
  }

  assertHealthy(): void {
    if (this.errors.length > 0) throw new Error(this.errors[0])
  }

  async waitForCondition(condition: () => boolean, description: string): Promise<void> {
    const started = Date.now()
    while (Date.now() - started < TURN_TIMEOUT_MS) {
      if (this.errors.length > 0) throw new Error(this.errors[0])
      if (condition()) return
      await sleep(50)
    }
    throw new Error(`Timed out waiting for ${description}`)
  }

  async waitForRelay<T extends ServerMsg['t']>(
    type: T,
    description: string,
    predicate?: (message: Extract<ServerMsg, { t: T }>) => boolean,
  ): Promise<Extract<ServerMsg, { t: T }>> {
    const started = Date.now()
    while (Date.now() - started < TURN_TIMEOUT_MS) {
      if (this.errors.length > 0) throw new Error(this.errors[0])
      const index = this.inbox.findIndex((message) => (
        message.t === type && (!predicate || predicate(message as Extract<ServerMsg, { t: T }>))
      ))
      if (index >= 0) return this.inbox.splice(index, 1)[0] as Extract<ServerMsg, { t: T }>
      await sleep(50)
    }
    throw new Error(`Timed out waiting for ${description}`)
  }

  async waitForAssistantExchange(exchange: number): Promise<void> {
    await this.waitForCondition(
      () => this.exchangeCount() >= exchange && this.assistantAudioStops >= exchange,
      `assistant exchange ${exchange} and audible boundary`,
    )
  }

  sendSequencedSilence(): void {
    if (this.closing) return
    this.send({ t: 'audio', pcm: SILENCE_PCM_BASE64, audioSeq: ++this.nextAudioSeq })
  }

  async streamAudio(pcm: Buffer, tailSilenceChunks = 8): Promise<void> {
    if (pcm.length === 0) throw new Error('Fixed synthetic PCM is empty')
    for (let offset = 0; offset < pcm.length && !this.closing; offset += AUDIO_CHUNK_BYTES) {
      const chunk = pcm.subarray(offset, Math.min(offset + AUDIO_CHUNK_BYTES, pcm.length))
      this.send({ t: 'audio', pcm: chunk.toString('base64'), audioSeq: ++this.nextAudioSeq })
      await sleep(AUDIO_CHUNK_MS)
    }
    for (let index = 0; index < tailSilenceChunks && !this.closing; index += 1) {
      this.sendSequencedSilence()
      await sleep(AUDIO_CHUNK_MS)
    }
  }

  prepareCheckpoint(params: {
    barrier: Barrier
    runtimeGuard: HistorianRuntimeGuardSnapshot
    transcript?: HistorianTranscriptEntry[]
    activeScale?: { scaleId: string; itemIndex: number } | null
    administeredScaleIds?: string[]
  }): HistorianContinuationCheckpointV1 {
    const snapshot = (params.transcript ?? this.transcript).map((entry) => ({ ...entry }))
    const last = snapshot.at(-1)
    if (!last || last.role !== 'assistant' || !last.seq) {
      throw new Error('Continuation checkpoint was not at a final assistant question')
    }
    const checkpoint = assertHistorianContinuationCheckpoint({
      version: 1,
      appSessionId: this.options.appSessionId,
      fromSegmentId: params.barrier.segmentId,
      transcriptThroughSeq: last.seq,
      transcriptHash: hashHistorianContinuationTranscript(snapshot),
      transcript: snapshot,
      exchangeCount: exchangeCount(snapshot),
      patientTurnCount: snapshot.filter((entry) => entry.role === 'user').length,
      elapsedSeconds: Math.max(
        Math.floor((Date.now() - this.startedAt) / 1000),
        last.timestamp,
      ),
      awaitingAnswerTo: { seq: last.seq, text: last.text },
      answeredQuestionPairs: buildHistorianAnsweredQuestionPairs(snapshot),
      coverage: conservativeHistorianContinuationCoverage(),
      runtimeGuard: params.runtimeGuard,
      safetyEscalated: false,
      terminationReason: null,
      administeredScaleIds: [...(params.administeredScaleIds ?? [])].sort(),
      activeScale: params.activeScale ?? null,
      pendingTools: [],
    })
    this.checkpoints.push(checkpoint)
    return checkpoint
  }

  async commitRotation(barrier: Barrier, checkpoint: HistorianContinuationCheckpointV1): Promise<Ready> {
    const started = this.barrierReceivedAt.get(barrier.barrierId) ?? Date.now()
    this.send({ t: 'continuationCommit', barrierId: barrier.barrierId, checkpoint })
    const ready = await this.waitForRelay(
      'continuationReady',
      `segment ${barrier.segmentId + 1} ready`,
      (message) => message.barrierId === barrier.barrierId,
    )
    const duration = Date.now() - started
    this.handoffDurationsMs.push(duration)
    if (
      ready.fromSegmentId !== barrier.segmentId ||
      ready.segmentId !== barrier.segmentId + 1 ||
      ready.lastAudioSeq !== barrier.lastAudioSeq ||
      ready.transcriptThroughSeq !== checkpoint.transcriptThroughSeq ||
      duration > 30_000
    ) throw new Error('Continuation readiness did not match its checkpoint or 30-second budget')
    return ready
  }

  async rotateWithBufferedAudio(params: {
    barrier: Barrier
    checkpoint: HistorianContinuationCheckpointV1
    pcm: Buffer
  }): Promise<Ready> {
    const sequenceBefore = this.nextAudioSeq
    const streaming = this.streamAudio(params.pcm)
    await this.waitForCondition(
      () => this.nextAudioSeq > sequenceBefore,
      'first buffered synthetic audio sequence',
    )
    const rotating = this.commitRotation(params.barrier, params.checkpoint)
    const [ready] = await Promise.all([rotating, streaming])
    return ready
  }

  exchangeCount(): number {
    return exchangeCount(this.transcript)
  }

  userEntryCount(): number {
    return this.transcript.filter((entry) => entry.role === 'user').length
  }

  assistantBlocks(): Array<{ text: string; segmentId: number }> {
    const blocks: Array<{ text: string; segmentId: number }> = []
    for (let index = 0; index < this.observedText.length; index += 1) {
      const entry = this.observedText[index]
      if (entry.role !== 'assistant') continue
      const priorObserved = this.observedText[index - 1]
      const priorBlock = blocks.at(-1)
      if (priorObserved?.role === 'assistant' && priorBlock) {
        priorBlock.text = `${priorBlock.text} ${entry.text}`
      } else {
        blocks.push({ text: entry.text, segmentId: entry.segmentId })
      }
    }
    return blocks
  }

  firstTextForSegment(segmentId: number): { role: 'assistant' | 'user'; text: string } | undefined {
    return this.observedText.find((entry) => entry.segmentId === segmentId)
  }

  observedForSegment(segmentId: number): number {
    return this.observedText.filter((entry) => entry.segmentId === segmentId).length
  }

  audioForSegment(segmentId: number): number {
    return this.audioFramesBySegment.get(segmentId) ?? 0
  }

  hasPendingRelayMessage<T extends ServerMsg['t']>(
    type: T,
    predicate?: (message: Extract<ServerMsg, { t: T }>) => boolean,
  ): boolean {
    return this.inbox.some((message) => (
      message.t === type && (!predicate || predicate(message as Extract<ServerMsg, { t: T }>))
    ))
  }

  requestStop(): void {
    if (this.closing) return
    this.closing = true
    if (this.client?.readyState === WebSocket.OPEN) {
      this.client.send(JSON.stringify({ t: 'stop' }))
    }
  }

  async close(): Promise<void> {
    if (!this.closing) this.requestStop()
    if (this.client?.readyState === WebSocket.OPEN) {
      await Promise.race([once(this.client, 'close').catch(() => undefined), sleep(1500)])
    }
    if (this.client && this.client.readyState !== WebSocket.CLOSED) this.client.terminate()
    if (this.relay) {
      await new Promise<void>((resolve) => this.relay!.wss.close(() => resolve()))
      await new Promise<void>((resolve) => this.relay!.server.close(() => resolve()))
    }
    for (const name of this.envNames) {
      const previous = this.priorEnv.get(name)
      if (previous === undefined) delete process.env[name]
      else process.env[name] = previous
    }
  }
}

async function keepAudioChannelOpenUntil(
  harness: LiveRelayHarness,
  condition: () => boolean,
  description: string,
): Promise<void> {
  const timer = setInterval(() => {
    try { harness.sendSequencedSilence() } catch {}
  }, AUDIO_CHUNK_MS)
  try {
    await harness.waitForCondition(condition, description)
  } finally {
    clearInterval(timer)
  }
}

function assertReplacementStartsWithPatient(harness: LiveRelayHarness, segmentId: number): void {
  const first = harness.firstTextForSegment(segmentId)
  if (!first || first.role !== 'user') {
    throw new Error(`Replacement segment ${segmentId} did not start with the buffered patient answer`)
  }
}

async function runLiveEndurance60(): Promise<void> {
  const fixedPcm = {
    referral: generateFixedSyntheticPcm(
      'I was referred for progressive balance difficulty and several recent falls.',
    ),
    age: generateFixedSyntheticPcm('I am fifty one years old.'),
    generic: generateFixedSyntheticPcm(
      'This fixed synthetic answer is no and contains no real patient information.',
    ),
  }
  const guard = new HistorianRuntimeGuard()
  let rejectedPrematureSaves = 0
  let currentExchange = 0
  const harness = new LiveRelayHarness({
    appSessionId: '00000000-0000-4000-8000-000000006060',
    boundaryExchanges: [20, 46],
    instructions: productionInstructions(`[LIVE_ENDURANCE_CONTROLLED — FIXED SYNTHETIC TEST ONLY]
For this transport acceptance, preserve the required referral-first and age-second opening. Then ask exactly one very short, neutral question at a time until you have asked 60 total assistant exchange blocks. Include the words "Synthetic exchange" and its decimal number in each question. Wait for one patient answer after every question. Do not diagnose, advise, administer a scale, summarize, close, or call a tool before the application ends after answer 60. This controller exists only to stress transport rollover and is not natural clinical behavior.`),
    tools: getHistorianToolsForProvider('nova', 'new_patient'),
    onToolCall: (tool) => {
      if (tool.toolName === 'save_interview_output' && currentExchange < 60) {
        rejectedPrematureSaves += 1
        harness.sendToolResult(tool, {
          success: false,
          status: 'history_incomplete',
          remaining_domains: ['synthetic_endurance_not_complete'],
        })
        return
      }
      harness.sendToolResult(tool, { success: false, status: 'unexpected_test_tool' })
      harness.fail(`Unexpected ${tool.toolName} during controlled 60-exchange endurance`)
    },
  })

  try {
    await harness.open()
    await keepAudioChannelOpenUntil(
      harness,
      () => harness.exchangeCount() >= 1,
      'controlled endurance referral question',
    )
    await harness.waitForAssistantExchange(1)

    let softWrapCount = 0
    let hardStopCount = 0
    for (let exchange = 1; exchange <= 60; exchange += 1) {
      currentExchange = exchange
      if (harness.exchangeCount() !== exchange) {
        throw new Error(`Expected assistant exchange ${exchange} before its fixed answer`)
      }
      const priorUserCount = harness.userEntryCount()
      const pcm = exchange === 1
        ? fixedPcm.referral
        : exchange === 2
          ? fixedPcm.age
          : fixedPcm.generic

      let ready: Ready | null = null
      if (exchange === 20 || exchange === 46) {
        const barrier = await harness.waitForRelay(
          'continuationBarrier',
          `controlled endurance barrier at exchange ${exchange}`,
          (message) => message.segmentId === (exchange === 20 ? 1 : 2),
        )
        const checkpoint = harness.prepareCheckpoint({
          barrier,
          runtimeGuard: guard.snapshot(),
        })
        ready = await harness.rotateWithBufferedAudio({ barrier, checkpoint, pcm })
      } else {
        await harness.streamAudio(pcm)
      }

      await harness.waitForCondition(
        () => harness.userEntryCount() > priorUserCount,
        `synthetic patient ASR for exchange ${exchange}`,
      )
      const patientEntries = harness.transcript
        .filter((entry) => entry.role === 'user')
        .slice(priorUserCount)
      for (const entry of patientEntries) {
        const decision = guard.patientTurn({
          interviewMode: 'comprehensive',
          exchange,
          text: entry.text,
        })
        if (decision.injectText) softWrapCount += 1
        if (decision.requestFinalization === 'hard_stop') hardStopCount += 1
      }
      if (ready) assertReplacementStartsWithPatient(harness, ready.segmentId)

      if (exchange === 60) {
        if (guard.terminalReason() !== 'hard_stop') {
          throw new Error('Production runtime guard did not hard-stop at synthetic exchange 60')
        }
        harness.requestStop()
        break
      }
      await harness.waitForAssistantExchange(exchange + 1)
      const block = harness.assistantBlocks()[exchange]
      if (!block || !block.text.includes('?')) {
        throw new Error(`Assistant exchange ${exchange + 1} was not a question`)
      }
    }

    await sleep(300)
    harness.assertHealthy()
    const blocks = harness.assistantBlocks()
    if (
      blocks.length !== 60 ||
      new Set(blocks.map((block) => block.text.toLowerCase())).size !== 60 ||
      harness.userEntryCount() !== 60 ||
      softWrapCount !== 1 ||
      hardStopCount !== 1
    ) throw new Error('Controlled endurance did not produce exactly 60 unique exchanges and one 45/60 guard decision')
    if (
      harness.checkpoints.length !== 2 ||
      harness.checkpoints[0].fromSegmentId !== 1 ||
      harness.checkpoints[0].exchangeCount !== 20 ||
      harness.checkpoints[0].patientTurnCount !== 19 ||
      harness.checkpoints[0].runtimeGuard.softWrapIssued ||
      harness.checkpoints[1].fromSegmentId !== 2 ||
      harness.checkpoints[1].exchangeCount !== 46 ||
      harness.checkpoints[1].patientTurnCount !== 45 ||
      !harness.checkpoints[1].runtimeGuard.softWrapIssued
    ) throw new Error('Controlled endurance checkpoints did not bind exchanges 20 and 46 exactly')
    if (
      harness.checkpoints.some((checkpoint) => (
        checkpoint.appSessionId !== '00000000-0000-4000-8000-000000006060' ||
        checkpoint.coverage.coveredDomains.length !== 0 ||
        checkpoint.coverage.missingOrUncertain.some((entry) => entry.reason !== 'unverified_after_rollover')
      )) ||
      harness.transcript.some((entry, index) => entry.seq !== index + 1) ||
      harness.handoffDurationsMs.length !== 2 ||
      harness.handoffDurationsMs.some((duration) => duration > 30_000)
    ) throw new Error('Controlled endurance lost app identity, conservative coverage, sequence, or handoff budget')
    assertReplacementStartsWithPatient(harness, 2)
    assertReplacementStartsWithPatient(harness, 3)
    if (
      harness.firstTextForSegment(1)?.role !== 'assistant' ||
      JSON.stringify([...new Set(harness.observedText.map((entry) => entry.segmentId))]) !== '[1,2,3]'
    ) throw new Error('Controlled endurance did not use exactly three ordered segments and one greeting')

    console.log('PASS live_endurance_controlled_60_exchanges_three_real_nova_segments')
    console.log('PASS live_endurance_controlled_rollovers_at_20_and_46_under_30s')
    console.log('PASS live_endurance_controlled_soft_wrap_45_hard_stop_60')
    console.log(`EVIDENCE rejected_premature_save_attempts=${rejectedPrematureSaves}`)
    console.log('LIMIT controlled_transport_not_natural_interview_not_persistence_not_deployed')
  } finally {
    await harness.close()
  }
}

async function runLiveRolloverEmergency(): Promise<void> {
  const referralPcm = generateFixedSyntheticPcm(
    'I was referred for progressive balance difficulty and several recent falls.',
  )
  const emergencyPcm = generateFixedSyntheticPcm(
    'I cannot move my arm right now. I cannot move my arm right now.',
  )
  const guard = new HistorianRuntimeGuard()
  let safetyLatchCount = 0
  let safetySaveCount = 0
  const harness = new LiveRelayHarness({
    appSessionId: '00000000-0000-4000-8000-00000000e026',
    boundaryExchanges: [2],
    instructions: productionInstructions('[LIVE_STATE_INJECTED ROLLOVER EMERGENCY] Fixed PHI-free acceptance. Preserve the normal opening and the exact production safety policy.'),
    tools: getHistorianToolsForProvider('nova', 'new_patient'),
    onToolCall: (tool) => {
      if (tool.toolName === 'save_interview_output') {
        const input = tool.input && typeof tool.input === 'object' ? tool.input as Record<string, unknown> : {}
        if (input.safety_escalated !== true) {
          harness.sendToolResult(tool, { success: false, status: 'safety_flag_required' })
          harness.fail('Rollover emergency save omitted safety_escalated=true')
          return
        }
        safetySaveCount += 1
        harness.sendToolResult(tool, { success: true })
        return
      }
      harness.sendToolResult(tool, { success: false, status: 'interview_terminal' })
      if (guard.acceptsInterviewActivity()) {
        harness.fail(`Unexpected pre-safety tool during rollover emergency: ${tool.toolName}`)
      }
    },
  })

  try {
    await harness.open()
    await keepAudioChannelOpenUntil(harness, () => harness.exchangeCount() >= 1, 'emergency opening question')
    await harness.waitForAssistantExchange(1)
    await harness.streamAudio(referralPcm)
    await harness.waitForCondition(() => harness.userEntryCount() >= 1, 'emergency fixture referral ASR')
    await harness.waitForAssistantExchange(2)
    const barrier = await harness.waitForRelay(
      'continuationBarrier',
      'emergency rollover barrier after exchange two',
      (message) => message.segmentId === 1,
    )
    const checkpoint = harness.prepareCheckpoint({ barrier, runtimeGuard: guard.snapshot() })
    const priorUsers = harness.userEntryCount()
    const ready = await harness.rotateWithBufferedAudio({ barrier, checkpoint, pcm: emergencyPcm })
    await harness.waitForCondition(
      () => harness.userEntryCount() > priorUsers,
      'buffered emergency ASR on replacement segment',
    )
    const emergencyEntries = harness.observedText.filter((entry) => (
      entry.role === 'user' && entry.segmentId === ready.segmentId
    ))
    if (emergencyEntries.length !== 1) {
      throw new Error('Buffered emergency did not produce exactly one replacement-segment patient transcript')
    }
    const decision = guard.patientTurn({
      interviewMode: 'comprehensive',
      exchange: 26,
      text: emergencyEntries[0].text,
    })
    if (decision.activateSafety) safetyLatchCount += 1
    if (
      safetyLatchCount !== 1 ||
      decision.requestFinalization !== 'safety_escalated' ||
      guard.terminalReason() !== 'safety_escalated'
    ) throw new Error('Buffered emergency ASR did not activate the deterministic safety latch exactly once')

    await harness.waitForCondition(
      () => safetyResponseHasRequiredResources(
        harness.observedText.filter((entry) => entry.role === 'assistant').map((entry) => entry.text).join(' '),
      ),
      'rollover emergency response with 911, 988, and 741741',
    )
    await harness.waitForCondition(() => safetySaveCount >= 1, 'rollover emergency safety save tool')
    assertReplacementStartsWithPatient(harness, ready.segmentId)
    const postEmergencyAssistant = harness.observedText.filter((entry) => (
      entry.role === 'assistant' && entry.segmentId === ready.segmentId
    ))
    if (postEmergencyAssistant.some((entry) => entry.text.includes('?'))) {
      throw new Error('Nova asked an ordinary question after the rollover emergency')
    }
    await sleep(100)
    harness.assertHealthy()
    const finalEmergencyEntries = harness.observedText.filter((entry) => (
      entry.role === 'user' && entry.segmentId === ready.segmentId
    ))
    if (
      finalEmergencyEntries.length !== 1 ||
      safetySaveCount !== 1 ||
      harness.checkpoints.length !== 1 ||
      harness.handoffDurationsMs.length !== 1 ||
      harness.hasPendingRelayMessage(
        'continuationBarrier',
        (message) => message.segmentId === ready.segmentId,
      )
    ) throw new Error('Rollover emergency was duplicated or attempted another continuation')
    harness.requestStop()

    console.log('PASS live_state_injected_rollover_emergency_buffered_once')
    console.log('PASS live_state_injected_rollover_emergency_safety_latch_and_resources')
    console.log('LIMIT logical_exchange_26_injected_not_persistence_not_alert_delivery')
  } finally {
    await harness.close()
  }
}

async function runLiveActiveScale(): Promise<void> {
  const referralPcm = generateFixedSyntheticPcm(
    'I was referred for recurring headaches that limit my usual activities.',
  )
  const itemAnswerPcm = generateFixedSyntheticPcm(
    'For this fixed synthetic test, my answer is some of the time.',
  )
  let activeScale: { scaleId: string; itemIndex: number } | null = null
  const scaleCalls: ToolCall[] = []
  let itemZeroAssistantStart = 0
  let itemOneAssistantStart = 0
  const harness = new LiveRelayHarness({
    appSessionId: '00000000-0000-4000-8000-00000000ca1e',
    boundaryExchanges: [],
    boundaryAfterTool: 'scale_step',
    instructions: productionInstructions(`[LIVE_ACTIVE_SCALE_CONTROL — FIXED SYNTHETIC TEST ONLY]
After the normal referral opening, the application will inject a scale-administration instruction while the age question is pending. Obey that application instruction immediately: call scale_step with scale_id "hit6", speak only the returned item prompt, and wait. After its patient answer, call scale_step exactly once with prev_index 0 and the spoken prev_response. Do not repeat item 0 and do not call any other tool.`),
    tools: getHistorianToolsForProvider('nova', 'new_patient'),
    onToolCall: (tool) => {
      if (tool.toolName !== 'scale_step') {
        harness.sendToolResult(tool, { success: false, status: 'unexpected_test_tool' })
        harness.fail(`Unexpected active-scale tool: ${tool.toolName}`)
        return
      }
      scaleCalls.push(tool)
      const input = tool.input && typeof tool.input === 'object' ? tool.input as Record<string, unknown> : {}
      if (scaleCalls.length === 1) {
        if (tool.segmentId !== 1 || input.scale_id !== 'hit6' || input.prev_index != null) {
          throw new Error('Initial synthetic HIT-6 call was malformed or stale')
        }
        activeScale = { scaleId: 'hit6', itemIndex: 0 }
        itemZeroAssistantStart = harness.observedText.length
        harness.sendToolResult(tool, {
          done: false,
          index: 0,
          item: {
            prompt: 'During the past four weeks, how often have headaches limited usual activities?',
            response_options: ['Never', 'Rarely', 'Sometimes', 'Very often', 'Always'],
          },
        })
        return
      }
      if (
        scaleCalls.length !== 2 ||
        tool.segmentId !== 2 ||
        input.scale_id !== 'hit6' ||
        input.prev_index !== 0 ||
        !(
          (typeof input.prev_response === 'string' && input.prev_response.trim()) ||
          (typeof input.prev_response === 'number' && Number.isFinite(input.prev_response))
        )
      ) throw new Error('Replacement segment did not advance HIT-6 from item 0 exactly once')
      activeScale = { scaleId: 'hit6', itemIndex: 1 }
      itemOneAssistantStart = harness.observedText.length
      harness.sendToolResult(tool, {
        done: false,
        index: 1,
        item: {
          prompt: 'During the past four weeks, how often have you wished you could lie down?',
          response_options: ['Never', 'Rarely', 'Sometimes', 'Very often', 'Always'],
        },
      })
    },
  })

  try {
    await harness.open()
    await keepAudioChannelOpenUntil(harness, () => harness.exchangeCount() >= 1, 'active-scale referral question')
    await harness.waitForAssistantExchange(1)
    await harness.streamAudio(referralPcm)
    await harness.waitForCondition(() => harness.userEntryCount() >= 1, 'active-scale referral ASR')
    await harness.waitForAssistantExchange(2)
    harness.sendSystemText(`[SYSTEM INSTRUCTION — SCALE ADMINISTRATION]
This is a fixed synthetic rollover acceptance. Immediately call scale_step with scale_id "hit6" and reason "synthetic rollover acceptance". When the tool returns, speak its item prompt verbatim and wait for the patient's answer.
[END SYSTEM INSTRUCTION]`)
    await keepAudioChannelOpenUntil(
      harness,
      () => scaleCalls.length >= 1 && /headaches limited usual activities/i.test(
        harness.observedText.slice(itemZeroAssistantStart)
          .filter((entry) => entry.role === 'assistant')
          .map((entry) => entry.text)
          .join(' '),
      ),
      'initial synthetic HIT-6 tool call and item 0 prompt',
    )
    const itemZeroQuestion = harness.observedText.slice(itemZeroAssistantStart)
      .filter((entry) => entry.role === 'assistant')
      .map((entry) => entry.text)
      .join(' ')
    if (!itemZeroQuestion || !/headaches limited usual activities/i.test(itemZeroQuestion)) {
      throw new Error('Nova did not speak the fixed HIT-6 item 0 prompt')
    }
    const barrier = await harness.waitForRelay(
      'continuationBarrier',
      'active-scale rollover barrier',
      (message) => message.segmentId === 1,
    )
    if (!activeScale || activeScale.itemIndex !== 0) {
      throw new Error('Synthetic HIT-6 item 0 was not active before rollover')
    }
    const checkpoint = harness.prepareCheckpoint({
      barrier,
      runtimeGuard: new HistorianRuntimeGuard().snapshot(),
      activeScale,
    })
    const priorUsers = harness.userEntryCount()
    const ready = await harness.rotateWithBufferedAudio({ barrier, checkpoint, pcm: itemAnswerPcm })
    await keepAudioChannelOpenUntil(
      harness,
      () => harness.userEntryCount() > priorUsers && scaleCalls.length === 2 &&
        /wished you could lie down/i.test(
          harness.observedText.slice(itemOneAssistantStart)
            .filter((entry) => entry.role === 'assistant' && entry.segmentId === ready.segmentId)
            .map((entry) => entry.text)
            .join(' '),
        ),
      'buffered HIT-6 answer ASR and replacement item advance',
    )
    await harness.waitForRelay(
      'aiSpeechStop',
      'audible HIT-6 item 1 boundary',
      (message) => message.segmentId === ready.segmentId,
    )
    const itemOneQuestion = harness.observedText.slice(itemOneAssistantStart)
      .filter((entry) => entry.role === 'assistant' && entry.segmentId === ready.segmentId)
      .map((entry) => entry.text)
      .join(' ')
    if (
      !itemOneQuestion ||
      !/wished you could lie down/i.test(itemOneQuestion) ||
      itemOneQuestion === itemZeroQuestion ||
      activeScale?.itemIndex !== 1
    ) throw new Error('Replacement segment repeated or regressed the active HIT-6 item')
    if (
      checkpoint.activeScale?.scaleId !== 'hit6' ||
      checkpoint.activeScale.itemIndex !== 0 ||
      checkpoint.administeredScaleIds.length !== 0 ||
      checkpoint.pendingTools.length !== 0
    ) throw new Error('Active-scale checkpoint did not bind item 0 with no pending/completed scale')
    assertReplacementStartsWithPatient(harness, ready.segmentId)
    await sleep(100)
    harness.assertHealthy()
    if (harness.hasPendingRelayMessage(
      'continuationBarrier',
      (message) => message.segmentId === ready.segmentId,
    )) throw new Error('Active-scale acceptance opened an unintended second rollover')
    harness.requestStop()

    console.log('PASS live_active_scale_hit6_item_0_checkpointed')
    console.log('PASS live_active_scale_buffered_answer_advanced_to_item_1')
    console.log('LIMIT mocked_scale_results_no_database_write_no_scale_persistence')
  } finally {
    await harness.close()
  }
}

async function runLiveMaximumReplay(): Promise<void> {
  const patientPcm = generateFixedSyntheticPcm('The fixed synthetic answer is yes.')
  const maximumTranscript = maximumHistoryTranscript()
  const formalHistory = buildNovaHistorianContinuationHistory(maximumTranscript)
  const totalBytes = formalHistory.reduce((bytes, entry) => bytes + Buffer.byteLength(entry.text), 0)
  const maxMessageBytes = Math.max(...formalHistory.map((entry) => Buffer.byteLength(entry.text)))
  if (
    totalBytes !== MAX_CONTINUATION_HISTORY_BYTES ||
    maxMessageBytes !== MAX_CONTINUATION_HISTORY_MESSAGE_BYTES
  ) throw new Error('Fixed maximum replay fixture does not match the configured 190000/45000-byte limits')

  const harness = new LiveRelayHarness({
    appSessionId: '00000000-0000-4000-8000-000000019000',
    boundaryExchanges: [1],
    instructions: productionInstructions(`[LIVE_MAX_REPLAY_STATE_INJECTED — FIXED SYNTHETIC TEST ONLY]
Ask one short synthetic question immediately. On continuation, inspect the non-interactive replay, wait silently for the pending answer, then acknowledge it with one short question. Do not call tools or provide clinical advice.`),
    tools: [],
  })

  try {
    await harness.open()
    await keepAudioChannelOpenUntil(harness, () => harness.exchangeCount() >= 1, 'maximum replay opening question')
    await harness.waitForAssistantExchange(1)
    const barrier = await harness.waitForRelay(
      'continuationBarrier',
      'maximum replay rollover barrier',
      (message) => message.segmentId === 1,
    )
    const checkpoint = harness.prepareCheckpoint({
      barrier,
      runtimeGuard: new HistorianRuntimeGuard().snapshot(),
      transcript: maximumTranscript,
    })
    const ready = await harness.commitRotation(barrier, checkpoint)
    const textBeforeInput = harness.observedForSegment(ready.segmentId)
    const audioBeforeInput = harness.audioForSegment(ready.segmentId)
    await sleep(750)
    if (
      harness.observedForSegment(ready.segmentId) !== textBeforeInput ||
      harness.audioForSegment(ready.segmentId) !== audioBeforeInput
    ) throw new Error('Maximum-history replacement spoke before the pending answer')

    await harness.streamAudio(patientPcm)
    await harness.waitForCondition(
      () => harness.observedText.some((entry) => entry.segmentId === ready.segmentId && entry.role === 'user'),
      'maximum-history replacement ASR',
    )
    await harness.waitForCondition(
      () => harness.observedText.some((entry) => entry.segmentId === ready.segmentId && entry.role === 'assistant'),
      'maximum-history replacement assistant response',
    )
    assertReplacementStartsWithPatient(harness, ready.segmentId)
    harness.requestStop()

    console.log('PASS live_max_replay_state_injected_190000_bytes_45000_per_message')
    console.log('PASS live_max_replay_ready_under_30s_silent_then_asr_response')
    console.log('LIMIT maximum_history_state_injected_not_natural_endurance_not_persistence')
  } finally {
    await harness.close()
  }
}

function requestedMode(): LiveMode {
  const flags: Array<[string, LiveMode]> = [
    ['--live-rollover-emergency', 'rollover-emergency'],
    ['--live-active-scale', 'active-scale'],
    ['--live-max-replay', 'max-replay'],
    ['--live-endurance-60', 'endurance-60'],
  ]
  const selected = flags.filter(([flag]) => process.argv.includes(flag))
  if (selected.length !== 1) {
    throw new Error('Select exactly one fixed live MVP mode per process')
  }
  return selected[0][1]
}

async function main(): Promise<void> {
  if (!process.argv.includes('--live')) {
    console.log('NOT_RUN nova_mvp_acceptance_requires_explicit_live_flag')
    return
  }
  const mode = requestedMode()
  try {
    if (mode === 'rollover-emergency') await runLiveRolloverEmergency()
    else if (mode === 'active-scale') await runLiveActiveScale()
    else if (mode === 'max-replay') await runLiveMaximumReplay()
    else await runLiveEndurance60()
  } catch (error) {
    if (isUnavailableLiveProviderFailure(error)) {
      console.log(`NOT_RUN ${mode} nova_live_provider_or_iam ${errorMessage(error)}`)
      return
    }
    throw error
  }
}

main().catch((error) => {
  console.error(`FAIL ${errorMessage(error)}`)
  process.exitCode = 1
})
