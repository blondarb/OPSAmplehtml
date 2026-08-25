import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { VoiceEvent, VoiceProvider } from '../../src/lib/voice/providerTypes'

const voiceFactory = vi.hoisted(() => ({ provider: null as VoiceProvider | null }))
const reactHarness = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)> }))

vi.mock('@/lib/voice/selectProvider', () => ({
  selectProvider: () => 'nova',
  makeProvider: () => voiceFactory.provider,
}))
vi.mock('react', () => ({
  useState: (initial: unknown) => [initial, () => undefined],
  useRef: (initial: unknown) => ({ current: initial }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => { reactHarness.effects.push(effect) },
}))

import { useRealtimeSession } from '../../src/hooks/useRealtimeSession'

describe('Nova continuation failure acceptance', () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window

  beforeEach(() => {
    reactHarness.effects.length = 0
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
    voiceFactory.provider = null
    vi.restoreAllMocks()
  })

  function installFetch() {
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      if (url === '/api/ai/historian/session') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            provider: 'nova',
            base_instructions: 'Fixed synthetic continuation instructions.',
            tools: [],
            relayUrl: 'wss://synthetic.invalid',
            sessionId: '00000000-0000-4000-8000-0000000000f1',
            flushToken: 'synthetic-flush-token',
            interviewMode: 'comprehensive',
            interviewPromptVersion: 'comprehensive-v1',
          }),
        } as Response)
      }
      if (url === '/api/ai/historian/transcript-flush') {
        return Promise.resolve({ ok: true, status: 200 } as Response)
      }
      if (url === '/api/ai/historian/safety-escalation') {
        return Promise.resolve({ ok: true, status: 200 } as Response)
      }
      throw new Error(`Unexpected continuation failure fetch: ${url}`)
    }) as typeof fetch
  }

  function installProvider(provider: VoiceProvider) {
    voiceFactory.provider = provider
    installFetch()
  }

  function openBarrier(sink: (event: VoiceEvent) => void) {
    sink({ type: 'assistantTranscript', text: 'Why were you referred?', segmentId: 1 })
    sink({ type: 'userTranscript', text: 'Synthetic intermittent headache.', segmentId: 1 })
    sink({ type: 'assistantTranscript', text: 'How old are you?', segmentId: 1 })
    const deadlineAtMs = Date.now() + 20_000
    sink({ type: 'continuationDue', segmentId: 1, deadlineAtMs })
    sink({
      type: 'continuationBarrier',
      barrierId: 'synthetic-barrier',
      segmentId: 1,
      lastAudioSeq: 10,
      deadlineAtMs,
    })
  }

  it('ends once as partial provider_error when the replacement stream cannot open', async () => {
    let sink: ((event: VoiceEvent) => void) | null = null
    let streamOpen = true
    const provider: VoiceProvider = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      isOpen: vi.fn(() => streamOpen),
      on: vi.fn((callback) => { sink = callback }),
      sendToolResult: vi.fn(),
      injectSystemText: vi.fn(),
      requestResponse: vi.fn(),
      suppressOutput: vi.fn(),
      nudgeClosing: vi.fn(),
      deferContinuation: vi.fn(),
      commitContinuation: vi.fn(async () => {
        streamOpen = false
        throw new Error('synthetic replacement stream failure')
      }),
    }
    installProvider(provider)
    const onComplete = vi.fn()
    const hook = useRealtimeSession({
      sessionType: 'new_patient',
      interviewMode: 'comprehensive',
      provider: 'nova',
      referralReason: 'Synthetic fixture.',
      enableLocalizer: false,
      unresponsiveness: { enabled: false, checkInAfterMs: 60_000, giveUpAfterMs: 60_000 },
      onComplete,
    })
    reactHarness.effects.forEach((effect) => effect())
    await hook.startSession()
    openBarrier(sink!)

    await vi.waitFor(
      () => expect(onComplete).toHaveBeenCalledOnce(),
      { timeout: 6_000 },
    )
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      terminationReason: 'provider_error',
      endedEarly: true,
      safetyEscalated: false,
      transcript: [
        expect.objectContaining({ seq: 1 }),
        expect.objectContaining({ seq: 2 }),
        expect.objectContaining({ seq: 3 }),
      ],
    }))
    expect(provider.stop).toHaveBeenCalledOnce()
  })

  it('reopens a zero-turn v2 invitation instead of reporting an empty interview as submitted', async () => {
    let sink: ((event: VoiceEvent) => void) | null = null
    const provider: VoiceProvider = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      isOpen: vi.fn(() => false),
      on: vi.fn((callback) => { sink = callback }),
      sendToolResult: vi.fn(),
      injectSystemText: vi.fn(),
      requestResponse: vi.fn(),
      suppressOutput: vi.fn(),
      nudgeClosing: vi.fn(),
    }
    voiceFactory.provider = provider
    const fetchCalls: string[] = []
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      fetchCalls.push(url)
      if (url === '/api/ai/historian/session') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            provider: 'nova',
            base_instructions: 'Fixed synthetic controlled instructions.',
            tools: [],
            relayUrl: 'wss://synthetic.invalid',
            sessionId: '00000000-0000-4000-8000-0000000000f2',
            flushToken: 'synthetic-flush-token',
            interviewMode: 'comprehensive',
            interviewPromptVersion: 'comprehensive-v2',
            turnEvidenceController: true,
          }),
        } as Response)
      }
      if (url === '/api/ai/historian/startup-recovery') {
        return Promise.resolve({ ok: true, status: 200 } as Response)
      }
      throw new Error(`Unexpected zero-turn recovery fetch: ${url}`)
    }) as typeof fetch

    const onComplete = vi.fn()
    const hook = useRealtimeSession({
      sessionType: 'new_patient',
      interviewMode: 'comprehensive',
      provider: 'nova',
      referralReason: 'Synthetic fixture.',
      enableLocalizer: false,
      unresponsiveness: { enabled: false, checkInAfterMs: 60_000, giveUpAfterMs: 60_000 },
      onComplete,
    })
    reactHarness.effects.forEach((effect) => effect())
    await hook.startSession()

    sink!({
      type: 'error',
      message: 'The voice response did not satisfy the patient interview safety contract.',
    })

    await vi.waitFor(() => {
      expect(fetchCalls).toContain('/api/ai/historian/startup-recovery')
      expect(provider.stop).toHaveBeenCalledOnce()
    })
    expect(onComplete).not.toHaveBeenCalled()
    expect(fetchCalls).not.toContain('/api/ai/historian/save')
    expect(fetchCalls).not.toContain('/api/ai/historian/transcript-flush')
  })

  it('reopens a zero-turn v2 invitation when provider setup itself fails', async () => {
    const provider: VoiceProvider = {
      start: vi.fn(async () => { throw new Error('synthetic microphone setup failure') }),
      stop: vi.fn(async () => undefined),
      isOpen: vi.fn(() => false),
      on: vi.fn(),
      sendToolResult: vi.fn(),
      injectSystemText: vi.fn(),
      requestResponse: vi.fn(),
      suppressOutput: vi.fn(),
      nudgeClosing: vi.fn(),
    }
    voiceFactory.provider = provider
    const fetchCalls: string[] = []
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      fetchCalls.push(url)
      if (url === '/api/ai/historian/session') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            provider: 'nova',
            base_instructions: 'Fixed synthetic controlled instructions.',
            tools: [],
            relayUrl: 'wss://synthetic.invalid',
            sessionId: '00000000-0000-4000-8000-0000000000f3',
            flushToken: 'synthetic-flush-token',
            interviewMode: 'comprehensive',
            interviewPromptVersion: 'comprehensive-v2',
            turnEvidenceController: true,
          }),
        } as Response)
      }
      if (url === '/api/ai/historian/startup-recovery') {
        return Promise.resolve({ ok: true, status: 200 } as Response)
      }
      throw new Error(`Unexpected setup recovery fetch: ${url}`)
    }) as typeof fetch

    const onComplete = vi.fn()
    const hook = useRealtimeSession({
      sessionType: 'new_patient', interviewMode: 'comprehensive', provider: 'nova',
      enableLocalizer: false,
      unresponsiveness: { enabled: false, checkInAfterMs: 60_000, giveUpAfterMs: 60_000 },
      onComplete,
    })
    reactHarness.effects.forEach((effect) => effect())
    await hook.startSession()

    expect(fetchCalls).toContain('/api/ai/historian/startup-recovery')
    expect(provider.stop).toHaveBeenCalledOnce()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('ignores a delayed error callback from the provider used by an older retry', async () => {
    let oldSink: ((event: VoiceEvent) => void) | null = null
    let newSink: ((event: VoiceEvent) => void) | null = null
    const oldProvider: VoiceProvider = {
      start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined),
      isOpen: vi.fn(() => false), on: vi.fn((callback) => { oldSink = callback }),
      sendToolResult: vi.fn(), injectSystemText: vi.fn(), requestResponse: vi.fn(),
      suppressOutput: vi.fn(), nudgeClosing: vi.fn(),
    }
    const newProvider: VoiceProvider = {
      start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined),
      isOpen: vi.fn(() => true), on: vi.fn((callback) => { newSink = callback }),
      sendToolResult: vi.fn(), injectSystemText: vi.fn(), requestResponse: vi.fn(),
      suppressOutput: vi.fn(), nudgeClosing: vi.fn(),
    }
    let recoveryCalls = 0
    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      if (url === '/api/ai/historian/session') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({
          provider: 'nova', base_instructions: 'Synthetic.', tools: [],
          relayUrl: 'wss://synthetic.invalid', sessionId: '00000000-0000-4000-8000-0000000000f4',
          flushToken: 'synthetic-flush-token', interviewMode: 'comprehensive',
          interviewPromptVersion: 'comprehensive-v2', turnEvidenceController: true,
        }) } as Response)
      }
      if (url === '/api/ai/historian/startup-recovery') {
        recoveryCalls += 1
        return Promise.resolve({ ok: true, status: 200 } as Response)
      }
      throw new Error(`Unexpected stale-provider fetch: ${url}`)
    }) as typeof fetch

    voiceFactory.provider = oldProvider
    const onComplete = vi.fn()
    const hook = useRealtimeSession({
      sessionType: 'new_patient', interviewMode: 'comprehensive', provider: 'nova',
      enableLocalizer: false,
      unresponsiveness: { enabled: false, checkInAfterMs: 60_000, giveUpAfterMs: 60_000 },
      onComplete,
    })
    reactHarness.effects.forEach((effect) => effect())
    await hook.startSession()
    oldSink!({ type: 'error', message: 'synthetic first attempt failure' })
    await vi.waitFor(() => expect(recoveryCalls).toBe(1))

    voiceFactory.provider = newProvider
    await hook.startSession()
    expect(newSink).not.toBeNull()
    oldSink!({ type: 'error', message: 'delayed stale provider failure' })
    await new Promise((resolve) => setTimeout(resolve, 25))

    expect(newProvider.stop).not.toHaveBeenCalled()
    expect(recoveryCalls).toBe(1)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('lets replayed emergency ASR win after a pre-promotion candidate rollback', async () => {
    let sink: ((event: VoiceEvent) => void) | null = null
    let streamOpen = true
    const provider: VoiceProvider = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => {
        streamOpen = false
      }),
      isOpen: vi.fn(() => streamOpen),
      on: vi.fn((callback) => { sink = callback }),
      sendToolResult: vi.fn(),
      injectSystemText: vi.fn(),
      requestResponse: vi.fn(),
      suppressOutput: vi.fn(),
      nudgeClosing: vi.fn(),
      deferContinuation: vi.fn(),
      commitContinuation: vi.fn(async () => 'recovered' as const),
    }
    installProvider(provider)
    const onComplete = vi.fn()
    const hook = useRealtimeSession({
      sessionType: 'new_patient',
      interviewMode: 'comprehensive',
      provider: 'nova',
      referralReason: 'Synthetic fixture.',
      enableLocalizer: false,
      unresponsiveness: { enabled: false, checkInAfterMs: 60_000, giveUpAfterMs: 60_000 },
      onComplete,
    })
    reactHarness.effects.forEach((effect) => effect())
    await hook.startSession()
    openBarrier(sink!)
    await vi.waitFor(() => expect(provider.commitContinuation).toHaveBeenCalledOnce())
    await Promise.resolve()
    expect(onComplete).not.toHaveBeenCalled()

    // The relay integration contract separately proves this ASR came from PCM
    // replayed exactly once to the old segment after candidate failure.
    sink!({
      type: 'userTranscript',
      text: "I can't move my arm right now.",
      segmentId: 1,
    })

    await vi.waitFor(
      () => expect(onComplete).toHaveBeenCalledOnce(),
      { timeout: 6_000 },
    )
    expect(provider.commitContinuation).toHaveBeenCalledOnce()
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      terminationReason: 'safety_escalated',
      safetyEscalated: true,
      endedEarly: true,
      transcript: expect.arrayContaining([
        expect.objectContaining({ seq: 4, text: "I can't move my arm right now." }),
      ]),
    }))
  })
})
