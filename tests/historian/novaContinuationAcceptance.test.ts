import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('Nova application-owned continuation acceptance', () => {
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

  it('keeps one app session and monotonic transcript, then catches an emergency after rollover', async () => {
    let voiceSink: ((event: VoiceEvent) => void) | null = null
    let streamOpen = true
    const commits: VoiceContinuationCheckpoint[] = []
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
      deferContinuation: vi.fn(),
      commitContinuation: vi.fn(async ({ checkpoint }) => {
        commits.push(checkpoint)
        return 'rotated' as const
      }),
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
            base_instructions: 'Fixed synthetic continuation instructions.',
            tools: [],
            relayUrl: 'wss://synthetic.invalid',
            relayToken: 'synthetic-token',
            sessionId: '00000000-0000-4000-8000-000000000045',
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
      throw new Error(`Unexpected continuation acceptance fetch: ${url}`)
    }) as typeof fetch

    const onComplete = vi.fn()
    const session = useRealtimeSession({
      sessionType: 'new_patient',
      interviewMode: 'comprehensive',
      provider: 'nova',
      referralReason: 'Synthetic headache fixture.',
      enableLocalizer: false,
      unresponsiveness: { enabled: false, checkInAfterMs: 60_000, giveUpAfterMs: 60_000 },
      onComplete,
    })
    reactHarness.effects.forEach((effect) => effect())
    await session.startSession()

    voiceSink?.({ type: 'assistantTranscript', text: 'Why were you referred?', segmentId: 1 })
    voiceSink?.({ type: 'userTranscript', text: 'Synthetic intermittent headache.', segmentId: 1 })
    voiceSink?.({ type: 'assistantTranscript', text: 'How old are you?', segmentId: 1 })

    const deadlineAtMs = Date.now() + 20_000
    voiceSink?.({ type: 'continuationDue', segmentId: 1, deadlineAtMs })
    voiceSink?.({
      type: 'continuationBarrier',
      barrierId: 'barrier-1',
      segmentId: 1,
      lastAudioSeq: 123,
      deadlineAtMs,
    })

    await vi.waitFor(() => expect(provider.commitContinuation).toHaveBeenCalledOnce())
    expect(commits).toHaveLength(1)
    expect(commits[0]).toMatchObject({
      version: 1,
      appSessionId: '00000000-0000-4000-8000-000000000045',
      fromSegmentId: 1,
      transcriptThroughSeq: 3,
      exchangeCount: 2,
      patientTurnCount: 1,
      answeredQuestionPairs: [{ assistantSeq: 1, userSeqStart: 2, userSeqEnd: 2 }],
      safetyEscalated: false,
      terminationReason: null,
      pendingTools: [],
      coverage: {
        coveredDomains: [],
        missingOrUncertain: expect.arrayContaining([
          expect.objectContaining({ reason: 'unverified_after_rollover' }),
        ]),
      },
    })
    expect(fetchCalls.filter((url) => url === '/api/ai/historian/session')).toHaveLength(1)

    voiceSink?.({ type: 'userTranscript', text: 'I am 51 years old.', segmentId: 2 })
    voiceSink?.({ type: 'assistantTranscript', text: 'When did the headaches begin?', segmentId: 2 })
    streamOpen = false
    voiceSink?.({ type: 'userTranscript', text: "I can't move my arm right now.", segmentId: 2 })

    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce())
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: '00000000-0000-4000-8000-000000000045',
      terminationReason: 'safety_escalated',
      safetyEscalated: true,
      endedEarly: true,
      questionCount: 3,
      transcript: [
        expect.objectContaining({ seq: 1, role: 'assistant', text: 'Why were you referred?' }),
        expect.objectContaining({ seq: 2, role: 'user', text: 'Synthetic intermittent headache.' }),
        expect.objectContaining({ seq: 3, role: 'assistant', text: 'How old are you?' }),
        expect.objectContaining({ seq: 4, role: 'user', text: 'I am 51 years old.' }),
        expect.objectContaining({ seq: 5, role: 'assistant', text: 'When did the headaches begin?' }),
        expect.objectContaining({ seq: 6, role: 'user', text: "I can't move my arm right now." }),
      ],
    }))
  })
})
