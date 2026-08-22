import crypto from 'crypto'
import { once } from 'events'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { MAX_HISTORY_BYTES } from '../continuationCheckpoint.js'
import type { ServerMsg, VoiceContinuationCheckpoint } from '../wsProtocol.js'

const DOMAINS = [
  'referral_reason', 'patient_reported_age', 'presenting_symptom', 'associated_symptoms',
  'red_flags', 'prior_episodes', 'functional_impact', 'neurologic_review_of_systems',
  'past_medical_history', 'past_surgical_history', 'medications',
  'medication_adherence_side_effects', 'allergies', 'family_neurologic_history',
  'social_exposure_history', 'prior_studies', 'patient_goals_questions',
]

type MockCallbacks = {
  onToolUse?: (tool: { toolName: string; toolUseId: string; content: string }) => void
  onTextOutput?: (role: string, content: string) => void
  onAudioOutput?: (pcm: string) => void
  onAssistantAudioEnd?: () => void
  onError?: (error: unknown) => void
  onUnexpectedStreamEnd?: () => void
}

type MockStartOptions = {
  sendGreetingKickoff?: boolean
  conversationHistory?: Array<{ role: 'USER' | 'ASSISTANT'; text: string }>
}

type MockSession = {
  callbacks: MockCallbacks
  audio: string[]
  starts: Array<{ instructions: string; options: MockStartOptions }>
  emitAssistant: (text: string) => void
  active: boolean
  stopWithinResult: boolean
}

const relayHarness = vi.hoisted(() => ({
  instances: [] as MockSession[],
  greetingCount: 0,
  nextCandidateBehavior: 'ready' as 'ready' | 'end' | 'error' | 'opening',
}))

vi.mock('../novaSonicSession.js', () => ({
  NovaSonicSession: class {
    audio: string[] = []
    starts: Array<{ instructions: string; options: MockStartOptions }> = []
    active = false
    stopWithinResult = true
    private readonly behavior: 'ready' | 'end' | 'error' | 'opening'
    private rejectOpening: ((error: Error) => void) | null = null
    constructor(public callbacks: MockCallbacks) {
      this.behavior = relayHarness.instances.length === 0
        ? 'ready'
        : relayHarness.nextCandidateBehavior
      relayHarness.nextCandidateBehavior = 'ready'
      relayHarness.instances.push(this)
    }
    async start(
      instructions: string,
      _tools: unknown[],
      _voiceId?: string,
      options: MockStartOptions = {},
    ) {
      this.starts.push({ instructions, options })
      this.active = true
      if (options.sendGreetingKickoff !== false) relayHarness.greetingCount += 1
      if (this.behavior === 'opening') {
        await new Promise<never>((_resolve, reject) => { this.rejectOpening = reject })
      }
    }
    pushAudio(pcm: string) { if (this.active) this.audio.push(pcm) }
    pushToolResult() {}
    pushSystemText() {}
    emitAssistant(text: string) {
      this.callbacks.onTextOutput?.('ASSISTANT', text)
      this.callbacks.onAudioOutput?.('synthetic-audio')
      this.callbacks.onAssistantAudioEnd?.()
    }
    isActive() { return this.active }
    async waitUntilTransportReady() {
      if (this.behavior === 'end') {
        this.active = false
        this.callbacks.onUnexpectedStreamEnd?.()
        return false
      }
      if (this.behavior === 'error') {
        this.callbacks.onError?.(new Error('synthetic candidate error'))
        return false
      }
      return this.active
    }
    async stopWithin() {
      this.active = false
      this.rejectOpening?.(new Error('synthetic opening stopped'))
      this.rejectOpening = null
      return this.stopWithinResult
    }
    async stop() {
      this.active = false
      this.rejectOpening?.(new Error('synthetic opening stopped'))
      this.rejectOpening = null
    }
  },
}))

type ServerModule = typeof import('../server.js')
let serverModule: ServerModule
let client: WebSocket
const inbox: ServerMsg[] = []

function token(secret: string): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 120 }))
    .toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

async function waitForMessage<T extends ServerMsg['t']>(
  type: T,
): Promise<Extract<ServerMsg, { t: T }>> {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    const index = inbox.findIndex((message) => message.t === type)
    if (index >= 0) return inbox.splice(index, 1)[0] as Extract<ServerMsg, { t: T }>
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`Timed out waiting for relay message ${type}`)
}

function send(message: unknown): void {
  client.send(JSON.stringify(message))
}

function checkpoint(
  fromSegmentId: number,
  transcript: Array<{ seq: number; role: 'assistant' | 'user'; text: string; timestamp: number }>,
): VoiceContinuationCheckpoint {
  const canonical = JSON.stringify(transcript.map(({ role, text, timestamp, seq }) => ({ role, text, timestamp, seq })))
  const last = transcript.at(-1)!
  return {
    version: 1,
    appSessionId: 'synthetic-app-session',
    fromSegmentId,
    transcriptThroughSeq: last.seq,
    transcriptHash: crypto.createHash('sha256').update(canonical).digest('hex'),
    transcript,
    exchangeCount: transcript.filter((entry) => entry.role === 'assistant').length,
    patientTurnCount: transcript.filter((entry) => entry.role === 'user').length,
    elapsedSeconds: Math.max(1, last.timestamp),
    awaitingAnswerTo: { seq: last.seq, text: last.text },
    answeredQuestionPairs: transcript.flatMap((entry, index) => {
      if (entry.role !== 'user' || transcript[index - 1]?.role !== 'assistant') return []
      let userEndIndex = index
      while (transcript[userEndIndex + 1]?.role === 'user') userEndIndex += 1
      return [{
        assistantSeq: transcript[index - 1].seq,
        userSeqStart: entry.seq,
        userSeqEnd: transcript[userEndIndex].seq,
      }]
    }),
    coverage: {
      coveredDomains: [],
      missingOrUncertain: DOMAINS.map((domain) => ({ domain, reason: 'unverified_after_rollover' })),
    },
    runtimeGuard: { softWrapIssued: false, terminalReason: null },
    safetyEscalated: false,
    terminationReason: null,
    administeredScaleIds: [],
    activeScale: null,
    pendingTools: [],
  }
}

function exactAsciiText(label: string, bytes: number, suffix = ''): string {
  const unit = `${label} synthetic neutral history. `
  const bodyBytes = bytes - Buffer.byteLength(suffix)
  return unit.repeat(Math.ceil(bodyBytes / unit.length)).slice(0, bodyBytes) + suffix
}

function maximumHistoryTranscript() {
  return [
    { seq: 1, role: 'assistant' as const, text: 'Synthetic opening?', timestamp: 0 },
    { seq: 2, role: 'user' as const, text: exactAsciiText('U1', 45_000), timestamp: 1 },
    { seq: 3, role: 'assistant' as const, text: exactAsciiText('A1', 45_000), timestamp: 2 },
    { seq: 4, role: 'user' as const, text: exactAsciiText('U2', 45_000), timestamp: 3 },
    { seq: 5, role: 'assistant' as const, text: exactAsciiText('A2', 45_000), timestamp: 4 },
    { seq: 6, role: 'user' as const, text: exactAsciiText('U3', 5_000), timestamp: 5 },
    { seq: 7, role: 'assistant' as const, text: exactAsciiText('A3', 5_000, '?'), timestamp: 6 },
  ]
}

async function rotate(
  segmentId: number,
  transcript: ReturnType<typeof checkpoint>['transcript'],
  bufferedSeq: number,
  bufferedPcm: string,
  options: { pendingToolAtBoundary?: boolean } = {},
) {
  await waitForMessage('continuationDue')
  await new Promise((resolve) => setTimeout(resolve, 25))
  let pendingTool: Extract<ServerMsg, { t: 'toolCall' }> | null = null
  if (options.pendingToolAtBoundary) {
    relayHarness.instances[segmentId - 1].callbacks.onToolUse?.({
      toolName: 'scale_step',
      toolUseId: `pending-${segmentId}`,
      content: JSON.stringify({ scale_id: 'synthetic' }),
    })
    pendingTool = await waitForMessage('toolCall')
  }
  relayHarness.instances[segmentId - 1].emitAssistant(transcript.at(-1)!.text)
  if (pendingTool) {
    await new Promise((resolve) => setTimeout(resolve, 15))
    expect(inbox.some((message) => message.t === 'continuationBarrier')).toBe(false)
    send({
      t: 'toolResult',
      toolUseId: pendingTool.toolUseId,
      output: JSON.stringify({ accepted: true }),
      segmentId,
    })
  }
  const barrier = await waitForMessage('continuationBarrier')
  expect(barrier.segmentId).toBe(segmentId)
  send({ t: 'audio', audioSeq: bufferedSeq, pcm: bufferedPcm })
  send({ t: 'continuationCommit', barrierId: barrier.barrierId, checkpoint: checkpoint(segmentId, transcript) })
  return waitForMessage('continuationReady')
}

describe('relay continuation protocol integration', () => {
  beforeAll(async () => {
    process.env.NOVA_RELAY_SHARED_SECRET = 'synthetic-relay-secret'
    process.env.NOVA_APP_CONTINUATION_V1 = 'true'
    process.env.NOVA_CONTINUATION_TEST_DUE_MS = '10'
    process.env.NOVA_CONTINUATION_TEST_BARRIER_MS = '20'
    process.env.NOVA_CONTINUATION_TEST_DEADLINE_MS = '1000'
    process.env.PORT = '0'
    serverModule = await import('../server.js')
    if (!serverModule.server.listening) await once(serverModule.server, 'listening')
    const address = serverModule.server.address()
    if (!address || typeof address === 'string') throw new Error('relay test server has no TCP address')
  })

  beforeEach(async () => {
    relayHarness.instances.length = 0
    relayHarness.greetingCount = 0
    relayHarness.nextCandidateBehavior = 'ready'
    inbox.length = 0
    const address = serverModule.server.address()
    if (!address || typeof address === 'string') throw new Error('relay test server has no TCP address')
    client = new WebSocket(
      `ws://127.0.0.1:${address.port}`,
      ['nova.v1', token('synthetic-relay-secret')],
      { origin: 'http://synthetic.test' },
    )
    client.on('message', (raw) => inbox.push(JSON.parse(raw.toString()) as ServerMsg))
    await once(client, 'open')
  })

  afterEach(async () => {
    if (client?.readyState === WebSocket.OPEN) {
      client.close()
      await once(client, 'close')
    }
  })

  afterAll(async () => {
    serverModule?.wss.close()
    await new Promise<void>((resolve) => serverModule?.server.close(() => resolve()))
    delete process.env.NOVA_RELAY_SHARED_SECRET
    delete process.env.NOVA_APP_CONTINUATION_V1
    delete process.env.NOVA_CONTINUATION_TEST_DUE_MS
    delete process.env.NOVA_CONTINUATION_TEST_BARRIER_MS
    delete process.env.NOVA_CONTINUATION_TEST_DEADLINE_MS
    delete process.env.PORT
  })

  it('rotates twice with one greeting and exactly-once sequenced PCM', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic comprehensive instructions.',
      tools: [],
      interviewMode: 'comprehensive',
    })
    send({ t: 'audio', audioSeq: 1, pcm: 'segment-1-live' })

    const transcript1 = [
      { seq: 1, role: 'assistant' as const, text: 'Synthetic question one?', timestamp: 0 },
      { seq: 2, role: 'user' as const, text: 'Synthetic answer one.', timestamp: 1 },
      { seq: 3, role: 'assistant' as const, text: 'Synthetic question two?', timestamp: 2 },
    ]
    const ready2 = await rotate(1, transcript1, 2, 'segment-2-buffered')
    expect(ready2).toMatchObject({ fromSegmentId: 1, segmentId: 2, lastAudioSeq: 1 })
    send({ t: 'audio', audioSeq: 3, pcm: 'segment-2-live' })

    const transcript2 = [
      ...transcript1,
      { seq: 4, role: 'user' as const, text: 'Synthetic answer two.', timestamp: 3 },
      { seq: 5, role: 'assistant' as const, text: 'Synthetic question three?', timestamp: 4 },
    ]
    const ready3 = await rotate(2, transcript2, 4, 'segment-3-buffered', {
      pendingToolAtBoundary: true,
    })
    expect(ready3).toMatchObject({ fromSegmentId: 2, segmentId: 3, lastAudioSeq: 3 })

    expect(relayHarness.instances).toHaveLength(3)
    expect(relayHarness.greetingCount).toBe(1)
    expect(relayHarness.instances[0].audio).toEqual(['segment-1-live'])
    expect(relayHarness.instances[1].audio).toEqual(['segment-2-buffered', 'segment-2-live'])
    expect(relayHarness.instances[2].audio).toEqual(['segment-3-buffered'])
    expect(relayHarness.instances[1].starts[0].options).toMatchObject({ sendGreetingKickoff: false })
    expect(relayHarness.instances[2].starts[0].options).toMatchObject({ sendGreetingKickoff: false })
    expect(relayHarness.instances[2].starts[0].options.conversationHistory!.at(-1)).toEqual({
      role: 'ASSISTANT',
      text: 'Synthetic question three?',
    })
    expect(relayHarness.instances[2].starts[0].options.conversationHistory![0]).toEqual({
      role: 'USER',
      text: 'Synthetic answer one.',
    })
  })

  it('opens a replacement with exact-limit replay and an active-scale checkpoint', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic maximum replay instructions.',
      tools: [],
      interviewMode: 'comprehensive',
    })
    send({ t: 'audio', audioSeq: 1, pcm: 'segment-1-live' })

    const transcript = maximumHistoryTranscript()
    const replayBytes = transcript.slice(1).reduce(
      (bytes, entry) => bytes + Buffer.byteLength(entry.text),
      0,
    )
    expect(replayBytes).toBe(MAX_HISTORY_BYTES)
    await waitForMessage('continuationDue')
    await new Promise((resolve) => setTimeout(resolve, 25))
    relayHarness.instances[0].emitAssistant(transcript.at(-1)!.text)
    const barrier = await waitForMessage('continuationBarrier')
    const state = checkpoint(1, transcript)
    state.activeScale = { scaleId: 'hit6', itemIndex: 0 }
    send({ t: 'audio', audioSeq: 2, pcm: 'maximum-history-buffered' })
    send({
      t: 'continuationCommit',
      barrierId: barrier.barrierId,
      checkpoint: state,
    })

    await expect(waitForMessage('continuationReady')).resolves.toMatchObject({
      fromSegmentId: 1,
      segmentId: 2,
      lastAudioSeq: 1,
      transcriptThroughSeq: 7,
    })
    expect(relayHarness.instances[1].starts[0].options.conversationHistory)
      .toHaveLength(6)
    expect(relayHarness.instances[1].starts[0].options.conversationHistory!
      .reduce((bytes, entry) => bytes + Buffer.byteLength(entry.text), 0))
      .toBe(MAX_HISTORY_BYTES)
    expect(relayHarness.instances[1].starts[0].instructions)
      .toContain('"activeScale":{"scaleId":"hit6","itemIndex":0}')
    expect(relayHarness.instances[1].audio).toEqual(['maximum-history-buffered'])
  })

  it('keeps the old stream and replays buffered PCM once when the candidate ends during readiness', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic comprehensive instructions.',
      tools: [],
      interviewMode: 'comprehensive',
    })
    send({ t: 'audio', audioSeq: 1, pcm: 'old-live' })

    const transcript = [
      { seq: 1, role: 'assistant' as const, text: 'Synthetic question one?', timestamp: 0 },
      { seq: 2, role: 'user' as const, text: 'Synthetic answer one.', timestamp: 1 },
      { seq: 3, role: 'assistant' as const, text: 'Synthetic question two?', timestamp: 2 },
    ]
    await waitForMessage('continuationDue')
    await new Promise((resolve) => setTimeout(resolve, 25))
    relayHarness.instances[0].emitAssistant(transcript.at(-1)!.text)
    const barrier = await waitForMessage('continuationBarrier')
    send({ t: 'audio', audioSeq: 2, pcm: 'buffered-during-handoff' })
    relayHarness.nextCandidateBehavior = 'end'
    send({
      t: 'continuationCommit',
      barrierId: barrier.barrierId,
      checkpoint: checkpoint(1, transcript),
    })

    const recovered = await waitForMessage('continuationRecovered')
    expect(recovered).toMatchObject({
      barrierId: barrier.barrierId,
      segmentId: 1,
      lastAudioSeq: 1,
      transcriptThroughSeq: 3,
      reason: 'candidate_start_failed',
    })
    expect(inbox.some((message) => message.t === 'continuationReady')).toBe(false)
    expect(relayHarness.instances).toHaveLength(2)
    expect(relayHarness.instances[0].audio).toEqual(['old-live', 'buffered-during-handoff'])
    expect(relayHarness.instances[1].audio).toEqual([])
  })

  it('never rolls back after promotion when the new active stream ends', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic comprehensive instructions.',
      tools: [],
      interviewMode: 'comprehensive',
    })
    send({ t: 'audio', audioSeq: 1, pcm: 'old-live' })
    const transcript = [
      { seq: 1, role: 'assistant' as const, text: 'Synthetic question one?', timestamp: 0 },
      { seq: 2, role: 'user' as const, text: 'Synthetic answer one.', timestamp: 1 },
      { seq: 3, role: 'assistant' as const, text: 'Synthetic question two?', timestamp: 2 },
    ]
    const ready = await rotate(1, transcript, 2, 'new-buffered')
    expect(ready.segmentId).toBe(2)

    relayHarness.instances[1].active = false
    relayHarness.instances[1].callbacks.onUnexpectedStreamEnd?.()

    await expect(waitForMessage('continuationFailed')).resolves.toMatchObject({
      reason: 'stream_start_failed',
    })
    await expect(waitForMessage('sessionEnded')).resolves.toMatchObject({
      reason: 'nova_stream_error',
    })
    expect(inbox.some((message) => message.t === 'continuationRecovered')).toBe(false)
    expect(relayHarness.instances[0].audio).toEqual(['old-live'])
    expect(relayHarness.instances[1].audio).toEqual(['new-buffered'])
  })

  it('fails closed after ready if the retired old stream cannot confirm shutdown', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic comprehensive instructions.',
      tools: [],
      interviewMode: 'comprehensive',
    })
    send({ t: 'audio', audioSeq: 1, pcm: 'old-live' })
    const transcript = [
      { seq: 1, role: 'assistant' as const, text: 'Synthetic question one?', timestamp: 0 },
      { seq: 2, role: 'user' as const, text: 'Synthetic answer one.', timestamp: 1 },
      { seq: 3, role: 'assistant' as const, text: 'Synthetic question two?', timestamp: 2 },
    ]
    relayHarness.instances[0].stopWithinResult = false

    const ready = await rotate(1, transcript, 2, 'new-buffered')
    expect(ready.segmentId).toBe(2)
    await expect(waitForMessage('continuationFailed')).resolves.toMatchObject({
      reason: 'stream_start_failed',
    })
    expect(inbox.some((message) => message.t === 'continuationRecovered')).toBe(false)
    expect(relayHarness.instances[1].audio).toEqual(['new-buffered'])
  })

  it('cancels an opening candidate when the browser stops during rotation', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic comprehensive instructions.',
      tools: [],
      interviewMode: 'comprehensive',
    })
    send({ t: 'audio', audioSeq: 1, pcm: 'old-live' })
    const transcript = [
      { seq: 1, role: 'assistant' as const, text: 'Synthetic question one?', timestamp: 0 },
      { seq: 2, role: 'user' as const, text: 'Synthetic answer one.', timestamp: 1 },
      { seq: 3, role: 'assistant' as const, text: 'Synthetic question two?', timestamp: 2 },
    ]
    await waitForMessage('continuationDue')
    await new Promise((resolve) => setTimeout(resolve, 25))
    relayHarness.instances[0].emitAssistant(transcript.at(-1)!.text)
    const barrier = await waitForMessage('continuationBarrier')
    send({ t: 'audio', audioSeq: 2, pcm: 'buffered-during-stop' })
    relayHarness.nextCandidateBehavior = 'opening'
    send({
      t: 'continuationCommit',
      barrierId: barrier.barrierId,
      checkpoint: checkpoint(1, transcript),
    })
    await vi.waitFor(() => expect(relayHarness.instances).toHaveLength(2))

    send({ t: 'stop' })
    await once(client, 'close')

    expect(relayHarness.instances.every((instance) => !instance.active)).toBe(true)
    expect(inbox.some((message) => (
      message.t === 'continuationReady' ||
      message.t === 'continuationRecovered' ||
      message.t === 'sessionEnded'
    ))).toBe(false)
  })
})
