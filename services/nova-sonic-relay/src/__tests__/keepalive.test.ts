import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NovaConnectionManager } from '../novaConnectionManager.js'
import type { NovaSonicCallbacks, NovaSonicStartOptions } from '../novaSonicSession.js'
import type { Tool } from '../eventBuilders.js'
import { silencePcmBase64, INPUT_SAMPLE_RATE } from '../audioConstants.js'

// ---------------------------------------------------------------------------
// Production failure repro (2026-09-08, CloudWatch /ecs/nova-sonic-relay):
// a historian session opened, the browser never delivered any mic audio
// (getUserMedia / device setup took too long), and 55s later Nova failed the
// stream with "Timed out waiting for audio bytes or interactive content.
// Please ensure gaps between audio bytes and interactive content are less
// than 55 seconds." The reactive renewal opened a second stream that died
// the same way 55s later; the 60s renewal rate limit then closed the client
// with an empty run. These tests pin the relay-side keepalive: while no
// client audio is arriving, the manager streams short silence PCM frames to
// the current Nova session so that gap can never reach 55s.
// ---------------------------------------------------------------------------

class FakeSession {
  callbacks: NovaSonicCallbacks
  startCalls: Array<{ instructions: string; tools: Tool[]; voiceId?: string; options?: NovaSonicStartOptions }> = []
  pushAudioCalls: string[] = []
  stopCalls = 0

  constructor(callbacks: NovaSonicCallbacks) {
    this.callbacks = callbacks
  }

  async start(instructions: string, tools: Tool[], voiceId?: string, options?: NovaSonicStartOptions): Promise<void> {
    this.startCalls.push({ instructions, tools, voiceId, options })
  }

  pushAudio(base64: string): void {
    this.pushAudioCalls.push(base64)
  }

  pushToolResult(): void {}
  pushSystemText(): void {}

  async stop(): Promise<void> {
    this.stopCalls++
  }
}

function makeFactory() {
  const sessions: FakeSession[] = []
  const factory = (callbacks: NovaSonicCallbacks): FakeSession => {
    const s = new FakeSession(callbacks)
    sessions.push(s)
    return s
  }
  return { factory, sessions }
}

const REAL = 'real-client-audio'
const FRAME_MS = 10

function silenceFrames(session: FakeSession): string[] {
  return session.pushAudioCalls.filter((b64) => b64 !== REAL)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeManager(
  factory: (cb: NovaSonicCallbacks) => FakeSession,
  overrides: ConstructorParameters<typeof NovaConnectionManager>[1] = {},
  callbacks: NovaSonicCallbacks = {},
): NovaConnectionManager {
  return new NovaConnectionManager(callbacks, {
    sessionFactory: factory,
    renewAfterMs: 10_000_000,
    hardRenewMs: 20_000_000,
    keepaliveIdleMs: 20,
    keepaliveTickMs: FRAME_MS,
    keepaliveFrameMs: FRAME_MS,
    keepaliveMaxIdleMs: 10_000_000,
    ...overrides,
  })
}

describe('silencePcmBase64', () => {
  it('encodes durationMs of all-zero PCM16 mono at the input sample rate', () => {
    const b64 = silencePcmBase64(250)
    const bytes = Buffer.from(b64, 'base64')
    expect(bytes.length).toBe((INPUT_SAMPLE_RATE * 250) / 1000 * 2) // 8000 bytes @16k/16-bit/mono
    expect(bytes.every((b) => b === 0)).toBe(true)
  })
})

describe('NovaConnectionManager silence keepalive', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('streams silence PCM frames to the session while no client audio has arrived since start', async () => {
    const { factory, sessions } = makeFactory()
    const manager = makeManager(factory)
    await manager.start('be a historian', [], 'matthew')

    await sleep(100)
    const frames = silenceFrames(sessions[0])
    expect(frames.length).toBeGreaterThanOrEqual(2)
    const expectedBytes = (INPUT_SAMPLE_RATE * FRAME_MS) / 1000 * 2
    for (const frame of frames) {
      const bytes = Buffer.from(frame, 'base64')
      expect(bytes.length).toBe(expectedBytes)
      expect(bytes.every((b) => b === 0)).toBe(true)
    }
    await manager.stop()
  })

  it('pushes NO silence while client audio keeps arriving inside the idle threshold', async () => {
    const { factory, sessions } = makeFactory()
    const manager = makeManager(factory)
    await manager.start('be a historian', [], 'matthew')

    const feeder = setInterval(() => manager.pushAudio(REAL), 5)
    await sleep(100)
    clearInterval(feeder)

    expect(silenceFrames(sessions[0])).toHaveLength(0)
    expect(sessions[0].pushAudioCalls.length).toBeGreaterThan(5) // real audio was forwarded
    await manager.stop()
  })

  it('resumes silence once client audio stops for longer than the idle threshold, and stops again when it returns', async () => {
    const { factory, sessions } = makeFactory()
    const manager = makeManager(factory)
    await manager.start('be a historian', [], 'matthew')

    manager.pushAudio(REAL)
    await sleep(80) // > idle threshold with no client audio
    const afterGap = silenceFrames(sessions[0]).length
    expect(afterGap).toBeGreaterThanOrEqual(1)

    // Client audio returns and keeps flowing — silence must stop.
    const feeder = setInterval(() => manager.pushAudio(REAL), 5)
    await sleep(60)
    clearInterval(feeder)
    // Allow at most one in-flight frame from the tick that raced the first real push.
    expect(silenceFrames(sessions[0]).length).toBeLessThanOrEqual(afterGap + 1)
    await manager.stop()
  })

  it('stops the keepalive on stop()', async () => {
    const { factory, sessions } = makeFactory()
    const manager = makeManager(factory)
    await manager.start('be a historian', [], 'matthew')
    await sleep(60)
    await manager.stop()

    const atStop = silenceFrames(sessions[0]).length
    expect(atStop).toBeGreaterThanOrEqual(1)
    await sleep(60)
    expect(silenceFrames(sessions[0]).length).toBe(atStop)
  })

  it('after a renewal switch, silence goes to the NEW session and the old one gets no more', async () => {
    const { factory, sessions } = makeFactory()
    const manager = makeManager(factory, { minRenewalIntervalMs: 0 })
    await manager.start('be a historian', [], 'matthew')
    await sleep(50)

    sessions[0].callbacks.onError?.(new Error('Timed out waiting for audio bytes or interactive content.'))
    await sleep(0)
    expect(sessions).toHaveLength(2)
    const oldCount = silenceFrames(sessions[0]).length

    await sleep(80)
    expect(silenceFrames(sessions[1]).length).toBeGreaterThanOrEqual(2)
    expect(silenceFrames(sessions[0]).length).toBe(oldCount)
    await manager.stop()
  })

  it('gives up after keepaliveMaxIdleMs with no client audio at all (lets Nova time out and the existing graceful-end path close the session)', async () => {
    const { factory, sessions } = makeFactory()
    const manager = makeManager(factory, { keepaliveMaxIdleMs: 60 })
    await manager.start('be a historian', [], 'matthew')

    await sleep(120)
    const atCap = silenceFrames(sessions[0]).length
    expect(atCap).toBeGreaterThanOrEqual(1)
    await sleep(60)
    expect(silenceFrames(sessions[0]).length).toBe(atCap)
    await manager.stop()
  })

  it('stays given up across a reactive renewal — the idle clock is anchored to the client, not the stream', async () => {
    const { factory, sessions } = makeFactory()
    const manager = makeManager(factory, { keepaliveMaxIdleMs: 60, minRenewalIntervalMs: 0 })
    await manager.start('be a historian', [], 'matthew')
    await sleep(100) // past the cap — keepalive has given up on session 0

    sessions[0].callbacks.onError?.(new Error('Timed out waiting for audio bytes or interactive content.'))
    await sleep(0)
    expect(sessions).toHaveLength(2)

    await sleep(80)
    expect(silenceFrames(sessions[1])).toHaveLength(0)
    await manager.stop()
  })

  it('keepaliveEnabled:false pushes nothing (kill switch)', async () => {
    const { factory, sessions } = makeFactory()
    const manager = makeManager(factory, { keepaliveEnabled: false })
    await manager.start('be a historian', [], 'matthew')
    await sleep(80)
    expect(silenceFrames(sessions[0])).toHaveLength(0)
    await manager.stop()
  })
})
