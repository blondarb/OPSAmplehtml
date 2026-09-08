import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NovaConnectionManager } from '../novaConnectionManager.js'
import type { NovaSonicCallbacks, NovaSonicStartOptions } from '../novaSonicSession.js'
import type { Tool } from '../eventBuilders.js'

// ---------------------------------------------------------------------------
// FakeSession — a minimal NovaSonicSessionLike the manager can drive without
// touching Bedrock. Each instance records every call it received and lets
// the test control whether/when start() resolves, rejects, or hangs (to
// simulate a renewal attempt that's still "mid-flight").
// ---------------------------------------------------------------------------

class FakeSession {
  callbacks: NovaSonicCallbacks
  startCalls: Array<{ instructions: string; tools: Tool[]; voiceId?: string; options?: NovaSonicStartOptions }> = []
  pushAudioCalls: string[] = []
  pushToolResultCalls: Array<{ toolUseId: string; jsonString: string }> = []
  pushSystemTextCalls: string[] = []
  stopCalls = 0

  private behavior: 'resolve' | 'reject' | 'pending' = 'resolve'
  private rejectError: unknown = new Error('fake session start failed')
  private pendingResolve: (() => void) | null = null
  private pendingReject: ((e: unknown) => void) | null = null

  constructor(callbacks: NovaSonicCallbacks) {
    this.callbacks = callbacks
  }

  setBehavior(behavior: 'resolve' | 'reject' | 'pending', rejectError?: unknown): void {
    this.behavior = behavior
    if (rejectError !== undefined) this.rejectError = rejectError
  }

  async start(instructions: string, tools: Tool[], voiceId?: string, options?: NovaSonicStartOptions): Promise<void> {
    this.startCalls.push({ instructions, tools, voiceId, options })
    if (this.behavior === 'reject') throw this.rejectError
    if (this.behavior === 'pending') {
      return new Promise<void>((resolve, reject) => {
        this.pendingResolve = resolve
        this.pendingReject = reject
      })
    }
    return Promise.resolve()
  }

  resolveStart(): void {
    this.pendingResolve?.()
  }

  rejectStart(e?: unknown): void {
    this.pendingReject?.(e ?? this.rejectError)
  }

  pushAudio(base64: string): void {
    this.pushAudioCalls.push(base64)
  }

  pushToolResult(toolUseId: string, jsonString: string): void {
    this.pushToolResultCalls.push({ toolUseId, jsonString })
  }

  pushSystemText(text: string): void {
    this.pushSystemTextCalls.push(text)
  }

  async stop(): Promise<void> {
    this.stopCalls++
  }
}

/** Builds a sessionFactory that hands out FakeSessions in order, recording each one. */
function makeFactory() {
  const sessions: FakeSession[] = []
  const factory = (callbacks: NovaSonicCallbacks): FakeSession => {
    const s = new FakeSession(callbacks)
    sessions.push(s)
    return s
  }
  return { factory, sessions }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('NovaConnectionManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('accumulates USER/ASSISTANT transcript into history, bounded by historyCapChars (oldest dropped first)', async () => {
    const { factory, sessions } = makeFactory()
    const manager = new NovaConnectionManager(
      {},
      { sessionFactory: factory, renewAfterMs: 10_000_000, hardRenewMs: 20_000_000, historyCapChars: 25 },
    )

    await manager.start('be a historian', [], 'matthew')
    const session = sessions[0]

    session.callbacks.onTextOutput?.('USER', '1234567890') // 10 chars
    session.callbacks.onTextOutput?.('ASSISTANT', 'abcdefghij') // 10 chars, total 20
    session.callbacks.onTextOutput?.('USER', 'klmnopqrst') // 10 chars, total 30 > cap 25

    const snapshot = manager.getHistorySnapshot()
    // Oldest ('1234567890') must have been dropped to stay within the cap.
    expect(snapshot.map((t) => t.text)).toEqual(['abcdefghij', 'klmnopqrst'])
    expect(snapshot.every((t) => t.role === 'USER' || t.role === 'ASSISTANT')).toBe(true)

    // Non-text-carrying / barge-in style calls must not pollute history —
    // only onTextOutput contributes.
    expect(snapshot).toHaveLength(2)
  })

  it('renews after the threshold at a quiet point, and the new session receives the accumulated history', async () => {
    const { factory, sessions } = makeFactory()
    // minRenewalIntervalMs left at its (much longer) default so a second
    // renewal cycle on the freshly-switched-to session can't fire inside
    // this test's short wait window and confuse the assertion below.
    const manager = new NovaConnectionManager(
      {},
      { sessionFactory: factory, renewAfterMs: 20, hardRenewMs: 10_000_000 },
    )

    await manager.start('be a historian', [], 'matthew')
    const oldSession = sessions[0]
    oldSession.callbacks.onTextOutput?.('USER', 'hello')
    oldSession.callbacks.onTextOutput?.('ASSISTANT', 'hi there')
    // No onAudioOutput fired since the last completionEnd — the connection
    // is at a quiet point when the threshold timer fires.

    await new Promise((resolve) => setTimeout(resolve, 40))
    await flush()

    expect(sessions).toHaveLength(2)
    const newSession = sessions[1]
    expect(newSession.startCalls).toHaveLength(1)
    expect(newSession.startCalls[0].options?.skipGreeting).toBe(true)
    expect(newSession.startCalls[0].options?.history).toEqual([
      { role: 'USER', text: 'hello' },
      { role: 'ASSISTANT', text: 'hi there' },
    ])
    expect(newSession.startCalls[0].instructions).toContain('be a historian')
    expect(newSession.startCalls[0].instructions).toContain('Connection renewed mid-interview')
  })

  it('routes audio pushed after the switch to the NEW session only, not the old one', async () => {
    const { factory, sessions } = makeFactory()
    const manager = new NovaConnectionManager(
      {},
      { sessionFactory: factory, renewAfterMs: 10, hardRenewMs: 10_000_000 },
    )

    await manager.start('be a historian', [], 'matthew')
    await new Promise((resolve) => setTimeout(resolve, 30))
    await flush()
    expect(sessions).toHaveLength(2)

    const [oldSession, newSession] = sessions
    manager.pushAudio('post-switch-audio')

    expect(newSession.pushAudioCalls).toEqual(['post-switch-audio'])
    expect(oldSession.pushAudioCalls).toEqual([])
    expect(oldSession.stopCalls).toBe(1) // best-effort stopped after handoff
  })

  it('a stream error on the current session before renewal completes triggers exactly one renewal attempt', async () => {
    const { factory, sessions } = makeFactory()
    // Threshold far in the future — this renewal must be purely reactive.
    const manager = new NovaConnectionManager(
      {},
      { sessionFactory: factory, renewAfterMs: 10_000_000, hardRenewMs: 10_000_000, minRenewalIntervalMs: 0 },
    )

    await manager.start('be a historian', [], 'matthew')
    const oldSession = sessions[0]

    oldSession.callbacks.onError?.(new Error('Model has timed out in processing the request'))
    await flush()

    expect(sessions).toHaveLength(2) // exactly one renewal attempt was made
  })

  it('when the reactive renewal attempt also fails, the original error falls back to the external onError exactly once (the existing close(1011) trigger)', async () => {
    const sessions: FakeSession[] = []
    let callIndex = 0
    const factory = (callbacks: NovaSonicCallbacks): FakeSession => {
      const s = new FakeSession(callbacks)
      // First session (the initial connection) resolves normally; every
      // subsequent one (renewal attempts) fails to open.
      if (callIndex > 0) {
        s.setBehavior('reject', new Error('renewal also failed to open'))
      }
      callIndex++
      sessions.push(s)
      return s
    }

    const onError = vi.fn()
    const manager = new NovaConnectionManager(
      { onError },
      { sessionFactory: factory, renewAfterMs: 10_000_000, hardRenewMs: 10_000_000, minRenewalIntervalMs: 0 },
    )

    await manager.start('be a historian', [], 'matthew')
    const oldSession = sessions[0]

    const failure = new Error('Model has timed out in processing the request')
    oldSession.callbacks.onError?.(failure)
    await flush()
    await flush()

    expect(sessions).toHaveLength(2) // exactly one renewal attempt
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(failure)
  })

  it('stop() stops BOTH sessions when a renewal is mid-flight (pending session never resolved on its own)', async () => {
    const pending: { resolve: (() => void) | null } = { resolve: null }
    const sessions: FakeSession[] = []
    let callIndex = 0
    const factory = (callbacks: NovaSonicCallbacks): FakeSession => {
      const s = new FakeSession(callbacks)
      if (callIndex > 0) {
        // Renewal attempt: hang forever until the test resolves it.
        const orig = s.start.bind(s)
        s.start = (...args) => {
          orig(...args).catch(() => {})
          return new Promise<void>((resolve) => {
            pending.resolve = resolve
          })
        }
      }
      callIndex++
      sessions.push(s)
      return s
    }

    const manager = new NovaConnectionManager(
      {},
      { sessionFactory: factory, renewAfterMs: 10_000_000, hardRenewMs: 10_000_000, minRenewalIntervalMs: 0 },
    )

    await manager.start('be a historian', [], 'matthew')
    const oldSession = sessions[0]
    oldSession.callbacks.onError?.(new Error('boom'))
    await flush()

    expect(sessions).toHaveLength(2)
    const pendingSession = sessions[1]

    const stopPromise = manager.stop()
    await flush()

    expect(oldSession.stopCalls).toBe(1)

    // Unblock the hanging renewal so stop() can resolve.
    pending.resolve?.()
    await stopPromise

    expect(pendingSession.stopCalls).toBe(1)
  })
})
