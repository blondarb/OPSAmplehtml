import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VoiceEvent } from '@/lib/voice/providerTypes'

// MicCapture / PcmPlayer touch real browser audio APIs (AudioContext,
// getUserMedia, AudioWorklet) that don't exist in this repo's node vitest
// environment. Fake them so novaSonicWsProvider's transport logic (the only
// thing under test here) can run without a browser.
const micStart = vi.fn(async () => {})
const micStop = vi.fn(async () => {})
vi.mock('@/lib/voice/audio/capture-worklet', () => ({
  MicCapture: class {
    start = micStart
    stop = micStop
  },
}))

// Controllable whenDrained: by default resolves immediately (matches most
// tests' expectations); switch to 'manual' mode to hold it open and resolve
// it explicitly, for the stop()-waits-for-drain tests below.
let whenDrainedMode: 'immediate' | 'manual' = 'immediate'
let whenDrainedResolvers: Array<() => void> = []

const playerWhenDrained = vi.fn(() => {
  if (whenDrainedMode === 'immediate') return Promise.resolve()
  return new Promise<void>((resolve) => {
    whenDrainedResolvers.push(resolve)
  })
})
const playerClose = vi.fn(async () => {})
vi.mock('@/lib/voice/audio/player', () => ({
  PcmPlayer: class {
    enqueue = vi.fn()
    interrupt = vi.fn()
    close = playerClose
    whenDrained = playerWhenDrained
    getDiagnostics = vi.fn(async () => ({}))
  },
}))

function resolveAllWhenDrained(): void {
  const resolvers = whenDrainedResolvers
  whenDrainedResolvers = []
  for (const resolve of resolvers) resolve()
}

const { NovaSonicWsProvider } = await import('../novaSonicWsProvider')

// CI's Node has no global CloseEvent (newer local Node does) — build the
// minimal shape the provider's onclose reads instead of constructing one.
function closeEvent(init: { code: number; reason: string; wasClean: boolean }): CloseEvent {
  return { type: 'close', ...init } as unknown as CloseEvent
}


// ---------------------------------------------------------------------------
// Fake WebSocket — mirrors the browser WebSocket surface the provider uses
// (readyState, onopen/onmessage/onerror/onclose, send, close). Instances are
// captured so the test can drive the handlers the provider registered.
// ---------------------------------------------------------------------------

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = FakeWebSocket.OPEN
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  sent: string[] = []

  constructor(
    public url: string,
    public protocols?: string[],
  ) {
    instances.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED
  }
}

let instances: FakeWebSocket[] = []

describe('NovaSonicWsProvider — relay error then close(1011)', () => {
  beforeEach(() => {
    instances = []
    micStart.mockClear()
    micStop.mockClear()
    playerWhenDrained.mockClear()
    playerClose.mockClear()
    whenDrainedMode = 'immediate'
    whenDrainedResolvers = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('emits exactly one `error` and exactly one `disconnected` for relay {t:"error"} followed by ws.close(1011)', async () => {
    const provider = new NovaSonicWsProvider()
    const events: VoiceEvent[] = []
    provider.on((e) => events.push(e))

    await provider.start({
      relayUrl: 'wss://relay.example/nova',
      relayToken: 'tok',
      instructions: 'be a historian',
      tools: [],
    })

    const ws = instances[0]
    expect(ws).toBeDefined()

    // Simulate the relay's onError handler: `send(ws, { t: 'error', message })`
    ws.onopen?.()
    ws.onmessage?.({ data: JSON.stringify({ t: 'error', message: 'modelStreamErrorException: Model has timed out in processing the request. Try your request again.' }) } as MessageEvent)

    // Then the relay's fatal-error teardown: ws.close(1011, 'nova stream error').
    // A server-initiated close that completes the handshake normally reports
    // wasClean: true even though the code is not 1000 — this is the exact
    // shape that previously got swallowed by the `!event.wasClean` check.
    ws.readyState = FakeWebSocket.CLOSED
    ws.onclose?.(closeEvent({ code: 1011, reason: 'nova stream error', wasClean: true }))

    const errorEvents = events.filter((e) => e.type === 'error')
    const disconnectedEvents = events.filter((e) => e.type === 'disconnected')

    expect(errorEvents).toHaveLength(1)
    expect(errorEvents[0]).toMatchObject({ type: 'error', message: expect.stringContaining('timed out') })

    expect(disconnectedEvents).toHaveLength(1)
    expect(disconnectedEvents[0]).toMatchObject({ type: 'disconnected', reason: 'ws:close(1011)' })
  })

  it("does not emit `disconnected` for the provider's own stop() (clean, code 1000)", async () => {
    const provider = new NovaSonicWsProvider()
    const events: VoiceEvent[] = []
    provider.on((e) => events.push(e))

    await provider.start({
      relayUrl: 'wss://relay.example/nova',
      relayToken: 'tok',
      instructions: 'be a historian',
      tools: [],
    })

    const ws = instances[0]
    ws.onopen?.()

    await provider.stop()
    // The provider's own stop() calls ws.close() with no arguments, i.e. code
    // 1000; the real browser would then fire onclose(code=1000, wasClean=true).
    ws.onclose?.(closeEvent({ code: 1000, reason: '', wasClean: true }))

    expect(events.filter((e) => e.type === 'disconnected')).toHaveLength(0)
  })

  it('still emits `disconnected` for an abrupt drop (code 1006, wasClean false) — unrelated to this fix, guards against a regression', async () => {
    const provider = new NovaSonicWsProvider()
    const events: VoiceEvent[] = []
    provider.on((e) => events.push(e))

    await provider.start({
      relayUrl: 'wss://relay.example/nova',
      relayToken: 'tok',
      instructions: 'be a historian',
      tools: [],
    })

    const ws = instances[0]
    ws.onopen?.()

    ws.readyState = FakeWebSocket.CLOSED
    ws.onclose?.(closeEvent({ code: 1006, reason: '', wasClean: false }))

    expect(events.filter((e) => e.type === 'disconnected')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// stop() draining a queued closing line before closing the player.
//
// Prod context (run 22350e76, 2026-09-08): the historian's closing line
// arrived as PCM right before `completion`/`aiSpeechStop`, and the old stop()
// closed the player as soon as mic teardown finished — cutting the goodbye
// off mid-sentence. stop() must now wait for player.whenDrained() (capped at
// STOP_DRAIN_CAP_MS) before calling player.close().
// ---------------------------------------------------------------------------

describe('NovaSonicWsProvider — stop() waits for the player to drain', () => {
  beforeEach(() => {
    instances = []
    micStart.mockClear()
    micStop.mockClear()
    playerWhenDrained.mockClear()
    playerClose.mockClear()
    whenDrainedMode = 'immediate'
    whenDrainedResolvers = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('does not call player.close() until player.whenDrained() resolves', async () => {
    whenDrainedMode = 'manual'

    const provider = new NovaSonicWsProvider()
    provider.on(() => {})
    await provider.start({
      relayUrl: 'wss://relay.example/nova',
      relayToken: 'tok',
      instructions: 'be a historian',
      tools: [],
    })
    instances[0].onopen?.()

    const stopPromise = provider.stop()

    // Let stop()'s own microtask chain (send stop, await mic.stop()) run
    // forward until it's blocked on the still-pending whenDrained().
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(playerWhenDrained).toHaveBeenCalled()
    expect(playerClose).not.toHaveBeenCalled()

    // Now let the queued "goodbye" finish draining.
    resolveAllWhenDrained()
    await stopPromise

    expect(playerClose).toHaveBeenCalledTimes(1)
  })

  it('proceeds to player.close() after STOP_DRAIN_CAP_MS even if whenDrained() never resolves', async () => {
    vi.useFakeTimers()
    whenDrainedMode = 'manual' // whenDrained() never resolves on its own

    const provider = new NovaSonicWsProvider()
    provider.on(() => {})
    await provider.start({
      relayUrl: 'wss://relay.example/nova',
      relayToken: 'tok',
      instructions: 'be a historian',
      tools: [],
    })
    instances[0].onopen?.()

    const stopPromise = provider.stop()

    // Flush the pre-timer microtask chain (send stop, await mic.stop()).
    await vi.advanceTimersByTimeAsync(0)
    expect(playerClose).not.toHaveBeenCalled()

    // Advance past the cap — whenDrainedResolvers is left untouched, so this
    // only passes if stop() gave up waiting and moved on.
    await vi.advanceTimersByTimeAsync(8000)
    await stopPromise

    expect(playerClose).toHaveBeenCalledTimes(1)
  })
})
