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
  onAssistantFinalText?: (content: string) => void
  onAudioOutput?: (pcm: string) => void
  onAssistantAudioEnd?: () => void
  onCompletionEnd?: () => void
  onBargeIn?: () => void
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
  toolResults: Array<{ toolUseId: string; output: string }>
  systemTexts: string[]
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
    toolResults: Array<{ toolUseId: string; output: string }> = []
    systemTexts: string[] = []
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
    pushToolResult(toolUseId: string, output: string) { this.toolResults.push({ toolUseId, output }) }
    pushSystemText(text: string) { this.systemTexts.push(text) }
    emitAssistant(text: string) {
      this.callbacks.onTextOutput?.('ASSISTANT', text)
      this.callbacks.onAudioOutput?.('synthetic-audio')
      this.callbacks.onAssistantAudioEnd?.()
      this.callbacks.onAssistantFinalText?.(text)
      this.callbacks.onCompletionEnd?.()
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
    process.env.NOVA_HISTORIAN_TURN_GATE_V1 = 'true'
    process.env.NOVA_CONTINUATION_TEST_DUE_MS = '10'
    process.env.NOVA_CONTINUATION_TEST_BARRIER_MS = '20'
    process.env.NOVA_CONTINUATION_TEST_DEADLINE_MS = '1000'
    process.env.NOVA_TURN_CONFIRMATION_TEST_TIMEOUT_MS = '40'
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
    delete process.env.NOVA_HISTORIAN_TURN_GATE_V1
    delete process.env.NOVA_CONTINUATION_TEST_DUE_MS
    delete process.env.NOVA_CONTINUATION_TEST_BARRIER_MS
    delete process.env.NOVA_CONTINUATION_TEST_DEADLINE_MS
    delete process.env.NOVA_TURN_CONFIRMATION_TEST_TIMEOUT_MS
    delete process.env.PORT
  })

  it('releases exact approved question text and PCM together with its obligation id', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic controlled instructions.',
      tools: [],
      interviewMode: 'comprehensive',
      turnEvidenceController: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'approved-tool',
      content: '{}',
    })
    const tool = await waitForMessage('toolCall')
    send({
      t: 'toolResult',
      toolUseId: tool.toolUseId,
      segmentId: 1,
      output: JSON.stringify({
        success: true,
        status: 'approved',
        obligation_id: 'synthetic-onset',
        approved_text: 'When did the symptom begin?',
        allow_example: false,
      }),
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].emitAssistant('When did the symptom begin?')
    const transcript = await waitForMessage('assistantTranscript')
    const audio = await waitForMessage('audio')
    expect(transcript).toMatchObject({
      text: 'When did the symptom begin?',
      obligationId: 'synthetic-onset',
      segmentId: 1,
    })
    expect(audio).toMatchObject({ pcm: 'synthetic-audio', segmentId: 1 })
  })

  it('streams an adaptive approved question before delayed FINAL confirmation', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic adaptive instructions.',
      tools: [],
      interviewMode: 'comprehensive',
      adaptiveTurnController: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'adaptive-tool',
      content: JSON.stringify({ proposed_text: 'When did the headaches begin?' }),
    })
    const tool = await waitForMessage('toolCall')
    send({
      t: 'toolResult',
      toolUseId: tool.toolUseId,
      segmentId: 1,
      output: JSON.stringify({
        success: true,
        status: 'approved',
        obligation_id: 'adaptive-question-3',
        approved_text: 'When did the headaches begin?',
        allow_example: false,
      }),
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(relayHarness.instances[0].systemTexts).toEqual([])

    relayHarness.instances[0].callbacks.onTextOutput?.('ASSISTANT', 'When did the headaches begin?')
    relayHarness.instances[0].callbacks.onAudioOutput?.('adaptive-live-audio')

    await expect(waitForMessage('assistantTranscript')).resolves.toMatchObject({
      text: 'When did the headaches begin?',
      obligationId: 'adaptive-question-3',
      segmentId: 1,
    })
    await expect(waitForMessage('audio')).resolves.toMatchObject({
      pcm: 'adaptive-live-audio',
      segmentId: 1,
    })

    relayHarness.instances[0].callbacks.onAssistantAudioEnd?.()
    await expect(waitForMessage('aiSpeechStop')).resolves.toMatchObject({ segmentId: 1 })
    relayHarness.instances[0].callbacks.onAssistantFinalText?.('When did the headaches begin?')
    relayHarness.instances[0].callbacks.onCompletionEnd?.()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(inbox.some((message) => message.t === 'error')).toBe(false)
    expect(inbox.filter((message) => message.t === 'assistantTranscript')).toHaveLength(0)
    expect(inbox.filter((message) => message.t === 'audio')).toHaveLength(0)
  })

  it('rebinds one duplicate adaptive tool call to the existing exact approval', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic adaptive instructions.',
      tools: [],
      interviewMode: 'comprehensive',
      adaptiveTurnController: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'original-adaptive-tool',
      content: JSON.stringify({ proposed_text: 'How often do the headaches occur?' }),
    })
    const original = await waitForMessage('toolCall')
    send({
      t: 'toolResult',
      toolUseId: original.toolUseId,
      segmentId: 1,
      output: JSON.stringify({
        success: true,
        status: 'approved',
        obligation_id: 'adaptive-question-5',
        approved_text: 'How often do the headaches occur?',
        allow_example: false,
      }),
    })
    await new Promise((resolve) => setTimeout(resolve, 10))

    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'duplicate-adaptive-tool',
      content: JSON.stringify({ proposed_text: 'What makes the headaches worse?' }),
    })
    await new Promise((resolve) => setTimeout(resolve, 15))

    expect(inbox.some((message) => message.t === 'toolCall')).toBe(false)
    expect(relayHarness.instances[0].toolResults.at(-1)).toEqual({
      toolUseId: 'duplicate-adaptive-tool',
      output: JSON.stringify({
        success: true,
        status: 'approved',
        obligation_id: 'adaptive-question-5',
        approved_text: 'How often do the headaches occur?',
        allow_example: false,
      }),
    })

    relayHarness.instances[0].emitAssistant('How often do the headaches occur?')
    await expect(waitForMessage('assistantTranscript')).resolves.toMatchObject({
      text: 'How often do the headaches occur?',
      obligationId: 'adaptive-question-5',
    })
    await expect(waitForMessage('audio')).resolves.toMatchObject({ pcm: 'synthetic-audio' })
    expect(inbox.some((message) => message.t === 'error')).toBe(false)
  })

  it('fails closed when an adaptive approval enters a duplicate-tool loop', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic adaptive instructions.',
      tools: [],
      interviewMode: 'comprehensive',
      adaptiveTurnController: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'loop-original-tool',
      content: JSON.stringify({ proposed_text: 'How often do the headaches occur?' }),
    })
    const original = await waitForMessage('toolCall')
    send({
      t: 'toolResult',
      toolUseId: original.toolUseId,
      segmentId: 1,
      output: JSON.stringify({
        success: true,
        status: 'approved',
        obligation_id: 'adaptive-question-5',
        approved_text: 'How often do the headaches occur?',
        allow_example: false,
      }),
    })
    await new Promise((resolve) => setTimeout(resolve, 10))

    for (const toolUseId of ['loop-duplicate-one', 'loop-duplicate-two']) {
      relayHarness.instances[0].callbacks.onToolUse?.({
        toolName: 'request_history_question',
        toolUseId,
        content: JSON.stringify({ proposed_text: 'What makes the headaches worse?' }),
      })
    }

    await expect(waitForMessage('error')).resolves.toMatchObject({
      message: 'The voice response did not satisfy the patient interview safety contract.',
    })
    expect(inbox.some((message) => message.t === 'assistantTranscript')).toBe(false)
    expect(inbox.some((message) => message.t === 'audio')).toBe(false)
  })

  it('lets the adaptive model retry a rejected proposal without terminating the stream', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic adaptive instructions.',
      tools: [],
      interviewMode: 'comprehensive',
      adaptiveTurnController: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'rejected-adaptive-tool',
      content: '{}',
    })
    const rejected = await waitForMessage('toolCall')
    send({
      t: 'toolResult',
      toolUseId: rejected.toolUseId,
      segmentId: 1,
      output: JSON.stringify({
        success: false,
        status: 'proposal_rejected',
        issue_codes: ['generic_symptom_reference'],
      }),
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(inbox.some((message) => message.t === 'error')).toBe(false)

    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'retry-adaptive-tool',
      content: JSON.stringify({ proposed_text: 'How often do the headaches occur?' }),
    })
    await expect(waitForMessage('toolCall')).resolves.toMatchObject({
      toolUseId: 'retry-adaptive-tool',
    })
  })

  it('passes one bounded clinical redirect back for exact resubmission without releasing speech', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic adaptive instructions.',
      tools: [],
      interviewMode: 'comprehensive',
      adaptiveTurnController: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'redirected-adaptive-tool',
      content: JSON.stringify({ proposed_text: 'What does the headache feel like?' }),
    })
    const redirected = await waitForMessage('toolCall')
    send({
      t: 'toolResult',
      toolUseId: redirected.toolUseId,
      segmentId: 1,
      output: JSON.stringify({
        success: false,
        status: 'proposal_rejected',
        issue_codes: ['clinical_redirect'],
        required_text: 'How long does each headache usually last?',
      }),
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(inbox.some((message) => message.t === 'error')).toBe(false)
    expect(inbox.some((message) => message.t === 'assistantTranscript')).toBe(false)
    expect(inbox.some((message) => message.t === 'audio')).toBe(false)

    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'redirect-resubmission-tool',
      content: JSON.stringify({ proposed_text: 'How long does each headache usually last?' }),
    })
    await expect(waitForMessage('toolCall')).resolves.toMatchObject({
      toolUseId: 'redirect-resubmission-tool',
    })
  })

  it('fails closed on a clinical redirect without one bounded required question', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic adaptive instructions.',
      tools: [],
      interviewMode: 'comprehensive',
      adaptiveTurnController: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'malformed-redirect-tool',
      content: JSON.stringify({ proposed_text: 'What does the headache feel like?' }),
    })
    const tool = await waitForMessage('toolCall')
    send({
      t: 'toolResult',
      toolUseId: tool.toolUseId,
      segmentId: 1,
      output: JSON.stringify({
        success: false,
        status: 'proposal_rejected',
        issue_codes: ['clinical_redirect'],
      }),
    })
    await expect(waitForMessage('error')).resolves.toMatchObject({
      message: 'The voice response did not satisfy the patient interview safety contract.',
    })
    await expect(waitForMessage('sessionEnded')).resolves.toMatchObject({
      reason: 'nova_stream_error',
    })
  })

  it('treats a patient interruption as recoverable for adaptive questions', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic adaptive instructions.',
      tools: [],
      interviewMode: 'comprehensive',
      adaptiveTurnController: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'interruptible-tool',
      content: '{}',
    })
    const tool = await waitForMessage('toolCall')
    send({
      t: 'toolResult',
      toolUseId: tool.toolUseId,
      segmentId: 1,
      output: JSON.stringify({
        success: true,
        status: 'approved',
        obligation_id: 'adaptive-question-4',
        approved_text: 'How often do the headaches occur?',
        allow_example: false,
      }),
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].callbacks.onTextOutput?.('ASSISTANT', 'How often do the headaches occur?')
    relayHarness.instances[0].callbacks.onAudioOutput?.('interruptible-audio')
    await waitForMessage('audio')

    relayHarness.instances[0].callbacks.onBargeIn?.()
    await expect(waitForMessage('bargeIn')).resolves.toMatchObject({ segmentId: 1 })
    relayHarness.instances[0].callbacks.onAssistantAudioEnd?.()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(inbox.some((message) => message.t === 'error')).toBe(false)

    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'after-interruption-tool',
      content: '{}',
    })
    await expect(waitForMessage('toolCall')).resolves.toMatchObject({
      toolUseId: 'after-interruption-tool',
    })
  })

  it('logs startup lifecycle metadata without instructions, audio, or tool arguments', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      send({
        t: 'start',
        instructions: 'SYNTHETIC_PRIVATE_INSTRUCTIONS',
        tools: [],
        interviewMode: 'comprehensive',
        turnEvidenceController: true,
      })
      send({ t: 'audio', audioSeq: 1, pcm: 'SYNTHETIC_PRIVATE_PCM' })
      await new Promise((resolve) => setTimeout(resolve, 10))
      relayHarness.instances[0].callbacks.onToolUse?.({
        toolName: 'request_history_question',
        toolUseId: 'metadata-only-tool',
        content: 'SYNTHETIC_PRIVATE_TOOL_ARGUMENTS',
      })
      await waitForMessage('toolCall')

      const logged = JSON.stringify(logSpy.mock.calls)
      expect(logged).toContain('start_received')
      expect(logged).toContain('model_stream_active')
      expect(logged).toContain('first_microphone_audio')
      expect(logged).toContain('tool_requested')
      expect(logged).not.toContain('SYNTHETIC_PRIVATE')

      relayHarness.instances[0].callbacks.onTextOutput?.('USER', 'SYNTHETIC_PRIVATE_TRANSCRIPT')
      const afterUserTranscript = JSON.stringify(logSpy.mock.calls)
      expect(afterUserTranscript).toContain('user_transcript_block')
      expect(afterUserTranscript).not.toContain('SYNTHETIC_PRIVATE_TRANSCRIPT')

      relayHarness.instances[0].callbacks.onToolUse?.({
        toolName: 'SYNTHETIC_PRIVATE_MODEL_CONTROLLED_NAME',
        toolUseId: 'unknown-tool',
        content: '{}',
      })
      await waitForMessage('toolCall')
      const afterUnknownTool = JSON.stringify(logSpy.mock.calls)
      expect(logSpy.mock.calls.some(([line]) => (
        String(line).includes('"toolCategory":"unknown"')
      ))).toBe(true)
      expect(afterUnknownTool).not.toContain('SYNTHETIC_PRIVATE_MODEL_CONTROLLED_NAME')

      send({
        t: 'clientDiagnostic',
        category: 'microphone_runtime_failure',
        reason: 'track_muted',
      })
      send({ t: 'stop' })
      await new Promise((resolve) => setTimeout(resolve, 10))
      const afterMicFailure = JSON.stringify(logSpy.mock.calls)
      expect(afterMicFailure).toContain('client_diagnostic')
      expect(afterMicFailure).toContain('microphone_runtime_failure')
      expect(afterMicFailure).toContain('track_muted')
      expect(afterMicFailure).toContain('audioFrameCount')
      expect(afterMicFailure).toContain('lastAudioSeq')
      expect(afterMicFailure).not.toContain('SYNTHETIC_PRIVATE_PCM')
    } finally {
      logSpy.mockRestore()
    }
  })

  it('sanitizes untrusted microphone diagnostic labels before logging', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      send({
        t: 'clientDiagnostic',
        category: 'SYNTHETIC_PRIVATE_CATEGORY',
        reason: 'SYNTHETIC_PRIVATE_REASON',
      } as never)
      await new Promise((resolve) => setTimeout(resolve, 10))
      const logged = JSON.stringify(logSpy.mock.calls)
      expect(logged).toContain('client_diagnostic')
      expect(logSpy.mock.calls.some(([line]) => (
        String(line).includes('"category":"unknown"') &&
        String(line).includes('"reason":"unknown"')
      ))).toBe(true)
      expect(logged).not.toContain('SYNTHETIC_PRIVATE')
    } finally {
      logSpy.mockRestore()
    }
  })

  it('waits for every paired sentence-level FINAL block, then releases once', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic controlled instructions.',
      tools: [],
      interviewMode: 'comprehensive',
      turnEvidenceController: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'delayed-final-tool',
      content: '{}',
    })
    const tool = await waitForMessage('toolCall')
    send({
      t: 'toolResult',
      toolUseId: tool.toolUseId,
      segmentId: 1,
      output: JSON.stringify({
        success: true,
        status: 'approved',
        obligation_id: 'synthetic-onset',
        approved_text: 'I will ask one question. When did the symptom begin?',
        allow_example: false,
      }),
    })
    await new Promise((resolve) => setTimeout(resolve, 10))

    relayHarness.instances[0].callbacks.onTextOutput?.('ASSISTANT', 'I will ask one question.')
    relayHarness.instances[0].callbacks.onTextOutput?.('ASSISTANT', 'When did the symptom begin?')
    relayHarness.instances[0].callbacks.onAudioOutput?.('delayed-final-audio')
    relayHarness.instances[0].callbacks.onAssistantAudioEnd?.()
    await new Promise((resolve) => setTimeout(resolve, 15))
    expect(inbox.some((message) => message.t === 'assistantTranscript')).toBe(false)
    expect(inbox.some((message) => message.t === 'audio')).toBe(false)
    expect(inbox.some((message) => message.t === 'error')).toBe(false)

    relayHarness.instances[0].callbacks.onAssistantFinalText?.('I will ask one question.')
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(inbox.some((message) => message.t === 'assistantTranscript')).toBe(false)
    expect(inbox.some((message) => message.t === 'audio')).toBe(false)
    relayHarness.instances[0].callbacks.onAssistantFinalText?.('When did the symptom begin?')
    await expect(waitForMessage('assistantTranscript')).resolves.toMatchObject({
      text: 'I will ask one question. When did the symptom begin?',
      obligationId: 'synthetic-onset',
      segmentId: 1,
    })
    await expect(waitForMessage('audio')).resolves.toMatchObject({
      pcm: 'delayed-final-audio',
      segmentId: 1,
    })
    expect(inbox.filter((message) => message.t === 'assistantTranscript')).toHaveLength(0)
    expect(inbox.filter((message) => message.t === 'audio')).toHaveLength(0)
    relayHarness.instances[0].callbacks.onCompletionEnd?.()
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(inbox.filter((message) => message.t === 'assistantTranscript')).toHaveLength(0)
    expect(inbox.filter((message) => message.t === 'audio')).toHaveLength(0)
  })

  it('fails closed after a bounded wait when the FINAL text copy never arrives', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic controlled instructions.',
      tools: [],
      interviewMode: 'comprehensive',
      turnEvidenceController: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'missing-final-tool',
      content: '{}',
    })
    const tool = await waitForMessage('toolCall')
    send({
      t: 'toolResult',
      toolUseId: tool.toolUseId,
      segmentId: 1,
      output: JSON.stringify({
        success: true,
        status: 'approved',
        obligation_id: 'synthetic-onset',
        approved_text: 'When did the symptom begin?',
        allow_example: false,
      }),
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].callbacks.onTextOutput?.('ASSISTANT', 'When did the symptom begin?')
    relayHarness.instances[0].callbacks.onAudioOutput?.('must-never-release')
    relayHarness.instances[0].callbacks.onAssistantAudioEnd?.()

    await waitForMessage('error')
    expect(inbox.some((message) => message.t === 'assistantTranscript')).toBe(false)
    expect(inbox.some((message) => message.t === 'audio')).toBe(false)
  })

  it('fails closed without releasing any PCM received after AUDIO END_TURN', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic controlled instructions.',
      tools: [],
      interviewMode: 'comprehensive',
      turnEvidenceController: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'post-end-audio-tool',
      content: '{}',
    })
    const tool = await waitForMessage('toolCall')
    send({
      t: 'toolResult',
      toolUseId: tool.toolUseId,
      segmentId: 1,
      output: JSON.stringify({
        success: true,
        status: 'approved',
        obligation_id: 'synthetic-onset',
        approved_text: 'When did the symptom begin?',
        allow_example: false,
      }),
    })
    await new Promise((resolve) => setTimeout(resolve, 10))

    relayHarness.instances[0].callbacks.onTextOutput?.('ASSISTANT', 'When did the symptom begin?')
    relayHarness.instances[0].callbacks.onAudioOutput?.('pre-boundary-audio')
    relayHarness.instances[0].callbacks.onAssistantAudioEnd?.()
    relayHarness.instances[0].callbacks.onAudioOutput?.('post-boundary-audio')
    relayHarness.instances[0].callbacks.onAssistantFinalText?.('When did the symptom begin?')
    relayHarness.instances[0].callbacks.onCompletionEnd?.()

    await waitForMessage('error')
    expect(inbox.some((message) => message.t === 'assistantTranscript')).toBe(false)
    expect(inbox.some((message) => message.t === 'audio')).toBe(false)
  })

  it('releases neither text nor PCM for a question-example-question turn', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic controlled instructions.',
      tools: [],
      interviewMode: 'comprehensive',
      turnEvidenceController: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'rejected-tool',
      content: '{}',
    })
    const tool = await waitForMessage('toolCall')
    send({
      t: 'toolResult',
      toolUseId: tool.toolUseId,
      segmentId: 1,
      output: JSON.stringify({
        success: true,
        status: 'approved',
        obligation_id: 'synthetic-onset',
        approved_text: 'When did the symptom begin?',
        allow_example: false,
      }),
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].emitAssistant(
      'When did it begin? For example, was it last week? How has it changed?',
    )
    await waitForMessage('error')
    expect(inbox.some((message) => message.t === 'assistantTranscript')).toBe(false)
    expect(inbox.some((message) => message.t === 'audio')).toBe(false)
  })

  it('discards an approved normal turn when terminal suppression arrives before release', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic controlled instructions.',
      tools: [],
      interviewMode: 'comprehensive',
      turnEvidenceController: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'suppressed-tool',
      content: '{}',
    })
    const tool = await waitForMessage('toolCall')
    send({
      t: 'toolResult',
      toolUseId: tool.toolUseId,
      segmentId: 1,
      output: JSON.stringify({
        success: true,
        status: 'approved',
        obligation_id: 'synthetic-onset',
        approved_text: 'When did the symptom begin?',
        allow_example: false,
      }),
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].callbacks.onTextOutput?.('ASSISTANT', 'When did the symptom begin?')
    relayHarness.instances[0].callbacks.onAudioOutput?.('must-not-play')
    relayHarness.instances[0].callbacks.onAssistantFinalText?.('When did the symptom begin?')
    send({ t: 'suppressOutput' })
    await new Promise((resolve) => setTimeout(resolve, 10))
    relayHarness.instances[0].callbacks.onAssistantAudioEnd?.()
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(inbox.some((message) => message.t === 'assistantTranscript')).toBe(false)
    expect(inbox.some((message) => message.t === 'audio')).toBe(false)
    expect(inbox.some((message) => message.t === 'error')).toBe(false)
  })

  it('accepts an exact suppressed terminal question result and keeps the silent save path open', async () => {
    send({
      t: 'start',
      instructions: 'Synthetic controlled instructions.',
      tools: [],
      interviewMode: 'comprehensive',
      turnEvidenceController: true,
    })
    send({ t: 'audio', audioSeq: 1, pcm: 'terminal-sequenced-audio' })
    await waitForMessage('continuationDue')
    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'request_history_question',
      toolUseId: 'terminal-question-tool',
      content: '{}',
    })
    const questionTool = await waitForMessage('toolCall')
    // Let the normal barrier-age gate elapse while the pending tool keeps the
    // due continuation from opening a barrier.
    await new Promise((resolve) => setTimeout(resolve, 25))

    send({ t: 'suppressOutput' })
    send({
      t: 'toolResult',
      toolUseId: questionTool.toolUseId,
      segmentId: 1,
      output: JSON.stringify({ success: false, status: 'interview_terminal' }),
    })
    send({
      t: 'systemText',
      text: '[COMPREHENSIVE HARD STOP] Save silently now.',
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(inbox.some((message) => message.t === 'error')).toBe(false)
    expect(inbox.some((message) => message.t === 'continuationBarrier')).toBe(false)
    expect(inbox.some((message) => message.t === 'continuationFailed')).toBe(false)
    expect(inbox.some((message) => message.t === 'assistantTranscript')).toBe(false)
    expect(inbox.some((message) => message.t === 'audio')).toBe(false)

    relayHarness.instances[0].callbacks.onToolUse?.({
      toolName: 'save_interview_output',
      toolUseId: 'terminal-save-tool',
      content: '{}',
    })
    const saveTool = await waitForMessage('toolCall')
    send({
      t: 'toolResult',
      toolUseId: saveTool.toolUseId,
      segmentId: 1,
      output: JSON.stringify({ success: true }),
    })
    // The test continuation deadline is one second. Remaining connected past
    // it proves terminal suppression cleared the deadline timer permanently.
    await new Promise((resolve) => setTimeout(resolve, 1_100))

    expect(inbox.some((message) => message.t === 'error')).toBe(false)
    expect(inbox.some((message) => message.t === 'continuationFailed')).toBe(false)
    expect(inbox.some((message) => message.t === 'sessionEnded')).toBe(false)
    expect(inbox.some((message) => message.t === 'assistantTranscript')).toBe(false)
    expect(inbox.some((message) => message.t === 'audio')).toBe(false)
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
