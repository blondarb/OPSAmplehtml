import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { VoiceEvent, VoiceProvider } from '../../src/lib/voice/providerTypes'

const voiceFactory = vi.hoisted(() => ({ provider: null as VoiceProvider | null }))
const reactHarness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
}))

vi.mock('@/lib/voice/selectProvider', () => ({
  selectProvider: () => 'nova',
  makeProvider: () => voiceFactory.provider,
}))

vi.mock('react', () => ({
  useState: (initial: unknown) => [initial, () => undefined],
  useRef: (initial: unknown) => ({ current: initial }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    reactHarness.effects.push(effect)
  },
}))

import { useRealtimeSession } from '../../src/hooks/useRealtimeSession'

type FetchCall = {
  url: string
  init?: RequestInit
}

describe('Nova forced-expiry acceptance contract', () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window

  beforeEach(() => {
    vi.useFakeTimers()
    reactHarness.effects.length = 0
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
    voiceFactory.provider = null
    vi.restoreAllMocks()
  })

  it('bounds forced expiry, attempts persistence, and preserves a stronger queued safety event', async () => {
    let voiceSink: ((event: VoiceEvent) => void) | null = null
    let streamOpen = true
    const provider: VoiceProvider = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      isOpen: vi.fn(() => streamOpen),
      on: vi.fn((callback) => { voiceSink = callback }),
      sendToolResult: vi.fn(),
      injectSystemText: vi.fn(),
      requestResponse: vi.fn(),
      suppressOutput: vi.fn(),
      nudgeClosing: vi.fn(),
    }
    voiceFactory.provider = provider

    const fetchCalls: FetchCall[] = []
    globalThis.fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      fetchCalls.push({ url, init })
      if (url === '/api/ai/historian/session') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            provider: 'nova',
            base_instructions: 'Fixed synthetic acceptance instructions.',
            tools: [],
            relayUrl: 'wss://synthetic.invalid/relay',
            relayToken: 'synthetic-token',
            sessionId: '00000000-0000-4000-8000-000000000026',
            flushToken: 'synthetic-flush-token',
            interviewMode: 'comprehensive',
            interviewPromptVersion: 'comprehensive-v1',
          }),
        } as Response)
      }
      if (url === '/api/ai/historian/transcript-flush') {
        // Force the persistence transport to remain unresolved. The historian
        // must still finish after its production two-second bound.
        return new Promise<Response>(() => undefined)
      }
      if (url === '/api/ai/historian/safety-escalation') {
        return Promise.resolve({ ok: true, status: 200 } as Response)
      }
      throw new Error(`Unexpected fetch in forced-expiry acceptance: ${url}`)
    }) as typeof fetch

    const onComplete = vi.fn()
    const session = useRealtimeSession({
      sessionType: 'new_patient',
      interviewMode: 'comprehensive',
      provider: 'nova',
      referralReason: 'Synthetic intermittent headache fixture.',
      enableLocalizer: false,
      unresponsiveness: {
        enabled: false,
        checkInAfterMs: 60_000,
        giveUpAfterMs: 60_000,
      },
      onComplete,
    })
    reactHarness.effects.forEach(effect => effect())

    await session.startSession()
    expect(voiceSink).not.toBeNull()

    voiceSink?.({ type: 'assistantTranscript', text: 'What brings you in today?' })
    voiceSink?.({ type: 'userTranscript', text: 'This is a fixed synthetic headache fixture.' })

    // Test-only forced expiry: the production provider reports the model
    // stream unavailable before it emits disconnected.
    streamOpen = false
    voiceSink?.({ type: 'disconnected', reason: 'forced_test_expiry' })

    // Simulate a finalized ASR segment that was already queued when the
    // transport expired. Safety must outrank the in-flight transport reason.
    voiceSink?.({ type: 'userTranscript', text: "I can't move my arm right now." })

    expect(onComplete).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_999)
    expect(onComplete).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(provider.injectSystemText).not.toHaveBeenCalled()
    expect(provider.requestResponse).not.toHaveBeenCalled()
    expect(provider.stop).toHaveBeenCalledOnce()

    const flushCalls = fetchCalls.filter(call => call.url === '/api/ai/historian/transcript-flush')
    expect(flushCalls.length).toBeGreaterThanOrEqual(1)
    const flushBody = JSON.parse(String(flushCalls[0].init?.body))
    expect(flushBody).toEqual({
      sessionId: '00000000-0000-4000-8000-000000000026',
      entries: [
        { seq: 1, role: 'assistant', text: 'What brings you in today?', tsOffsetS: 0 },
        { seq: 2, role: 'user', text: 'This is a fixed synthetic headache fixture.', tsOffsetS: 0 },
      ],
    })

    expect(onComplete).toHaveBeenCalledOnce()
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      endedEarly: true,
      terminationReason: 'safety_escalated',
      safetyEscalated: true,
      interviewMode: 'comprehensive',
      interviewPromptVersion: 'comprehensive-v1',
      sessionId: '00000000-0000-4000-8000-000000000026',
      transcript: [
        expect.objectContaining({ seq: 1, role: 'assistant', text: 'What brings you in today?' }),
        expect.objectContaining({ seq: 2, role: 'user', text: 'This is a fixed synthetic headache fixture.' }),
        expect.objectContaining({ seq: 3, role: 'user', text: "I can't move my arm right now." }),
      ],
      // A preserved transcript is not relabeled as a generated report.
      narrativeSummary: null,
    }))
  })
})
