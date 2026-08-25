import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COMPREHENSIVE_HISTORY_DOMAINS } from '../../src/lib/historianTypes'
import { hashHistorianContinuationTranscript } from '../../src/lib/historian/continuationState'

const audioHarness = vi.hoisted(() => ({
  onMicChunk: null as ((pcm: string) => void) | null,
  onMicFailure: null as ((reason: 'track_ended' | 'track_muted' | 'context_not_running' | 'audio_chunks_stalled') => void) | null,
  startGate: null as Promise<void> | null,
  stopCalls: 0,
}))

vi.mock('@/lib/voice/audio/capture-worklet', () => {
  class MicCaptureStartCancelledError extends Error {}
  return {
    MicCaptureStartCancelledError,
    MicCapture: class {
      private stopped = false
      async start(
        callback: (pcm: string) => void,
        onRuntimeFailure?: (reason: 'track_ended' | 'track_muted' | 'context_not_running' | 'audio_chunks_stalled') => void,
      ) {
        audioHarness.onMicChunk = callback
        audioHarness.onMicFailure = onRuntimeFailure ?? null
        if (audioHarness.startGate) await audioHarness.startGate
        if (this.stopped) throw new MicCaptureStartCancelledError()
      }
      async stop() {
        this.stopped = true
        audioHarness.stopCalls += 1
        audioHarness.onMicChunk = null
        audioHarness.onMicFailure = null
      }
    },
  }
})

vi.mock('@/lib/voice/audio/player', () => ({
  PcmPlayer: class {
    enqueue = vi.fn()
    interrupt = vi.fn()
    whenDrained = vi.fn(async () => undefined)
    getDiagnostics = vi.fn(async () => ({}))
    close = vi.fn(async () => undefined)
  },
}))

import { NovaSonicWsProvider } from '../../src/lib/voice/providers/novaSonicWsProvider'

class FakeWebSocket {
  static OPEN = 1
  static instances: FakeWebSocket[] = []
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  constructor(public url: string, public protocols: string[]) {
    FakeWebSocket.instances.push(this)
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  server(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent)
  }

  send(message: string) { this.sent.push(message) }
  close() { this.readyState = 3 }
}

function checkpoint() {
  const transcript = [
    { seq: 1, role: 'assistant' as const, text: 'Why were you referred?', timestamp: 0 },
    { seq: 2, role: 'user' as const, text: 'Synthetic headache fixture.', timestamp: 3 },
    { seq: 3, role: 'assistant' as const, text: 'How old are you?', timestamp: 5 },
  ]
  return {
    version: 1 as const,
    appSessionId: 'synthetic-session',
    fromSegmentId: 1,
    transcriptThroughSeq: 3,
    transcriptHash: hashHistorianContinuationTranscript(transcript),
    transcript,
    exchangeCount: 2,
    patientTurnCount: 1,
    elapsedSeconds: 245,
    awaitingAnswerTo: { seq: 3, text: 'How old are you?' },
    answeredQuestionPairs: [{ assistantSeq: 1, userSeqStart: 2, userSeqEnd: 2 }],
    coverage: {
      coveredDomains: [] as [],
      missingOrUncertain: COMPREHENSIVE_HISTORY_DOMAINS.map(({ id }) => ({
        domain: id,
        reason: 'unverified_after_rollover' as const,
      })),
    },
    runtimeGuard: { softWrapIssued: false, terminalReason: null },
    safetyEscalated: false,
    terminationReason: null,
    administeredScaleIds: [],
    activeScale: null,
    pendingTools: [] as [],
  }
}

describe('Nova browser provider continuation', () => {
  const originalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    FakeWebSocket.instances = []
    audioHarness.onMicChunk = null
    audioHarness.onMicFailure = null
    audioHarness.startGate = null
    audioHarness.stopCalls = 0
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      value: FakeWebSocket,
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      value: originalWebSocket,
    })
    vi.restoreAllMocks()
  })

  it('keeps one WebSocket/mic, sequences PCM, and advances only on an exact ready ACK', async () => {
    const provider = new NovaSonicWsProvider()
    const events: unknown[] = []
    provider.on((event) => events.push(event))
    await provider.start({
      instructions: 'synthetic instructions',
      tools: [],
      relayUrl: 'wss://synthetic.invalid',
      relayToken: 'token',
      interviewMode: 'comprehensive',
    })
    const ws = FakeWebSocket.instances[0]
    ws.open()
    await Promise.resolve()

    audioHarness.onMicChunk?.('pcm-1')
    audioHarness.onMicChunk?.('pcm-2')
    const audioFrames = ws.sent.map((frame) => JSON.parse(frame)).filter((frame) => frame.t === 'audio')
    expect(audioFrames).toEqual([
      { t: 'audio', pcm: 'pcm-1', audioSeq: 1 },
      { t: 'audio', pcm: 'pcm-2', audioSeq: 2 },
    ])

    const deadlineAtMs = Date.now() + 20_000
    ws.server({ t: 'continuationDue', segmentId: 1, deadlineAtMs })
    ws.server({
      t: 'continuationBarrier',
      barrierId: 'barrier-1',
      segmentId: 1,
      lastAudioSeq: 2,
      deadlineAtMs,
    })
    await Promise.resolve()
    expect(events).toContainEqual({ type: 'continuationDue', segmentId: 1, deadlineAtMs })
    expect(events).toContainEqual({
      type: 'continuationBarrier',
      barrierId: 'barrier-1',
      segmentId: 1,
      lastAudioSeq: 2,
      deadlineAtMs,
    })

    const commit = provider.commitContinuation({ barrierId: 'barrier-1', checkpoint: checkpoint() })
    expect(JSON.parse(ws.sent.at(-1)!)).toMatchObject({ t: 'continuationCommit', barrierId: 'barrier-1' })
    ws.server({
      t: 'continuationReady',
      barrierId: 'barrier-1',
      fromSegmentId: 1,
      segmentId: 2,
      lastAudioSeq: 2,
      transcriptThroughSeq: 3,
    })
    await expect(commit).resolves.toBe('rotated')
    expect(FakeWebSocket.instances).toHaveLength(1)

    ws.server({ t: 'assistantTranscript', text: 'stale old output', segmentId: 1 })
    ws.server({ t: 'assistantTranscript', text: 'new segment output', segmentId: 2 })
    expect(events).not.toContainEqual(expect.objectContaining({ text: 'stale old output' }))
    expect(events).toContainEqual({
      type: 'assistantTranscript',
      text: 'new segment output',
      segmentId: 2,
    })
  })

  it('reports one allowlisted runtime microphone failure and suppresses output before the hook error', async () => {
    const provider = new NovaSonicWsProvider()
    const events: unknown[] = []
    provider.on((event) => events.push(event))
    await provider.start({
      instructions: 'synthetic instructions',
      tools: [],
      relayUrl: 'wss://synthetic.invalid',
      interviewMode: 'comprehensive',
    })
    const ws = FakeWebSocket.instances[0]
    ws.open()
    await Promise.resolve()

    audioHarness.onMicFailure?.('track_muted')
    audioHarness.onMicFailure?.('track_muted')

    const sent = ws.sent.map((frame) => JSON.parse(frame))
    const diagnostics = sent
      .filter((frame) => frame.t === 'clientDiagnostic')
    expect(diagnostics).toEqual([{
      t: 'clientDiagnostic',
      category: 'microphone_runtime_failure',
      reason: 'track_muted',
    }])
    expect(sent.filter((frame) => frame.t === 'suppressOutput')).toHaveLength(1)
    expect(sent.findIndex((frame) => frame.t === 'clientDiagnostic')).toBeLessThan(
      sent.findIndex((frame) => frame.t === 'suppressOutput'),
    )
    expect((provider as unknown as {
      player: { interrupt: ReturnType<typeof vi.fn> }
    }).player.interrupt).toHaveBeenCalledOnce()
    expect(events.filter((event) => (
      (event as { type?: string }).type === 'error'
    ))).toEqual([{
      type: 'error',
      message: 'Your microphone stopped sending audio. The interview will be saved through your last confirmed answer.',
    }])
  })

  it('does not emit an error or audio when stop wins a pending microphone start', async () => {
    let releaseStart!: () => void
    audioHarness.startGate = new Promise<void>((resolve) => {
      releaseStart = resolve
    })
    const provider = new NovaSonicWsProvider()
    const events: unknown[] = []
    provider.on((event) => events.push(event))
    await provider.start({
      instructions: 'synthetic instructions',
      tools: [],
      relayUrl: 'wss://synthetic.invalid',
      interviewMode: 'comprehensive',
    })
    const ws = FakeWebSocket.instances[0]
    ws.open()
    await Promise.resolve()

    await provider.stop()
    releaseStart()
    await Promise.resolve()
    await Promise.resolve()

    expect(audioHarness.stopCalls).toBe(1)
    expect(events).toEqual([])
    expect(ws.sent.map((frame) => JSON.parse(frame)).filter((frame) => frame.t === 'audio')).toEqual([])
  })

  it('never routes a late segment-one tool result into segment two', async () => {
    const provider = new NovaSonicWsProvider()
    provider.on(() => undefined)
    await provider.start({ instructions: 'x', tools: [], relayUrl: 'wss://synthetic.invalid' })
    const ws = FakeWebSocket.instances[0]
    ws.open()
    await Promise.resolve()
    ws.server({
      t: 'toolCall',
      toolName: 'scale_step',
      toolUseId: 'old-tool',
      input: {},
      segmentId: 1,
    })
    ;(provider as unknown as { segmentId: number }).segmentId = 2
    const before = ws.sent.length
    provider.sendToolResult('old-tool', { ok: true }, 1)
    expect(ws.sent).toHaveLength(before)
  })

  it('keeps the same segment live when the relay rolls a failed candidate back', async () => {
    const provider = new NovaSonicWsProvider()
    const events: unknown[] = []
    provider.on((event) => events.push(event))
    await provider.start({
      instructions: 'synthetic instructions',
      tools: [],
      relayUrl: 'wss://synthetic.invalid',
      interviewMode: 'comprehensive',
    })
    const ws = FakeWebSocket.instances[0]
    ws.open()
    await Promise.resolve()

    audioHarness.onMicChunk?.('pcm-1')
    const deadlineAtMs = Date.now() + 20_000
    ws.server({ t: 'continuationDue', segmentId: 1, deadlineAtMs })
    ws.server({
      t: 'continuationBarrier',
      barrierId: 'rollback-barrier',
      segmentId: 1,
      lastAudioSeq: 1,
      deadlineAtMs,
    })
    await Promise.resolve()

    const commit = provider.commitContinuation({
      barrierId: 'rollback-barrier',
      checkpoint: checkpoint(),
    })
    ws.server({
      t: 'continuationRecovered',
      barrierId: 'rollback-barrier',
      segmentId: 1,
      lastAudioSeq: 1,
      transcriptThroughSeq: 3,
      reason: 'candidate_start_failed',
    })

    await expect(commit).resolves.toBe('recovered')
    expect(provider.isOpen()).toBe(true)
    expect(FakeWebSocket.instances).toHaveLength(1)

    ws.server({ t: 'assistantTranscript', text: 'old segment recovered', segmentId: 1 })
    expect(events).toContainEqual({
      type: 'assistantTranscript',
      text: 'old segment recovered',
      segmentId: 1,
    })
  })
})
