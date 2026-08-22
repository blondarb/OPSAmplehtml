import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COMPREHENSIVE_SOFT_WRAP_NUDGE } from '../../src/lib/historian/comprehensiveCompletionPolicy'
import type { VoiceContinuationCheckpoint, VoiceEvent, VoiceProvider } from '../../src/lib/voice/providerTypes'

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

describe('Nova continuation preserves Comprehensive runtime limits', () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window

  beforeEach(() => {
    reactHarness.effects.length = 0
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
    voiceFactory.provider = null
    vi.restoreAllMocks()
  })

  it('wraps once at 45 and hard-stops once at 60 across three Nova segments', async () => {
    let sink: ((event: VoiceEvent) => void) | null = null
    let streamOpen = true
    const commits: VoiceContinuationCheckpoint[] = []
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
      commitContinuation: vi.fn(async ({ checkpoint }) => {
        commits.push(checkpoint)
        return 'rotated' as const
      }),
    }
    voiceFactory.provider = provider

    globalThis.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input)
      if (url === '/api/ai/historian/session') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            provider: 'nova',
            base_instructions: 'Synthetic runtime-limit instructions.',
            tools: [],
            relayUrl: 'wss://synthetic.invalid',
            sessionId: '00000000-0000-4000-8000-000000000060',
            flushToken: 'synthetic-flush-token',
            interviewMode: 'comprehensive',
            interviewPromptVersion: 'comprehensive-v1',
          }),
        } as Response)
      }
      if (url === '/api/ai/historian/transcript-flush') {
        return Promise.resolve({ ok: true, status: 200 } as Response)
      }
      throw new Error(`Unexpected runtime-limit fetch: ${url}`)
    }) as typeof fetch

    const onComplete = vi.fn()
    const session = useRealtimeSession({
      sessionType: 'new_patient',
      interviewMode: 'comprehensive',
      provider: 'nova',
      referralReason: 'Synthetic fixture.',
      enableLocalizer: false,
      unresponsiveness: { enabled: false, checkInAfterMs: 60_000, giveUpAfterMs: 60_000 },
      onComplete,
    })
    reactHarness.effects.forEach((effect) => effect())
    await session.startSession()

    const assistant = (exchange: number, segmentId: number) =>
      sink?.({ type: 'assistantTranscript', text: `Synthetic question ${exchange}?`, segmentId })
    const patient = (exchange: number, segmentId: number) =>
      sink?.({ type: 'userTranscript', text: `Synthetic answer ${exchange}.`, segmentId })
    const rotate = async (segmentId: number) => {
      const deadlineAtMs = Date.now() + 20_000
      sink?.({ type: 'continuationDue', segmentId, deadlineAtMs })
      sink?.({
        type: 'continuationBarrier',
        barrierId: `barrier-${segmentId}`,
        segmentId,
        lastAudioSeq: segmentId * 100,
        deadlineAtMs,
      })
      await vi.waitFor(() => expect(commits).toHaveLength(segmentId))
    }

    for (let exchange = 1; exchange <= 43; exchange += 1) {
      assistant(exchange, 1)
      patient(exchange, 1)
    }
    assistant(44, 1)
    await rotate(1)

    patient(44, 2)
    assistant(45, 2)
    patient(45, 2)
    for (let exchange = 46; exchange <= 50; exchange += 1) {
      assistant(exchange, 2)
      patient(exchange, 2)
    }
    assistant(51, 2)
    await rotate(2)

    patient(51, 3)
    for (let exchange = 52; exchange <= 59; exchange += 1) {
      assistant(exchange, 3)
      patient(exchange, 3)
    }
    assistant(60, 3)
    streamOpen = false
    patient(60, 3)

    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce())
    const wrapCalls = (provider.injectSystemText as ReturnType<typeof vi.fn>).mock.calls
      .filter(([text]) => text === COMPREHENSIVE_SOFT_WRAP_NUDGE)
    expect(wrapCalls).toHaveLength(1)
    expect(provider.suppressOutput).toHaveBeenCalledOnce()
    expect(commits).toHaveLength(2)
    expect(commits[0]).toMatchObject({ exchangeCount: 44, runtimeGuard: { softWrapIssued: false } })
    expect(commits[1]).toMatchObject({ exchangeCount: 51, runtimeGuard: { softWrapIssued: true } })
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: '00000000-0000-4000-8000-000000000060',
      questionCount: 60,
      terminationReason: 'hard_stop',
      endedEarly: true,
      transcript: expect.arrayContaining([
        expect.objectContaining({ seq: 1 }),
        expect.objectContaining({ seq: 120 }),
      ]),
    }))
  })
})
