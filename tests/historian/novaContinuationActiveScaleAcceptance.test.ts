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

describe('Nova continuation with an active scale', () => {
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

  it('checkpoints the exact in-progress scale item after its tool result settles', async () => {
    let sink: ((event: VoiceEvent) => void) | null = null
    let streamOpen = true
    const commits: VoiceContinuationCheckpoint[] = []
    const provider: VoiceProvider = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => { streamOpen = false }),
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

    const scaleRequests: Array<Record<string, unknown>> = []
    globalThis.fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/ai/historian/session') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            provider: 'nova',
            base_instructions: 'Fixed synthetic active-scale instructions.',
            tools: [],
            relayUrl: 'wss://synthetic.invalid',
            sessionId: '00000000-0000-4000-8000-00000000ca1e',
            flushToken: 'synthetic-flush-token',
            interviewMode: 'comprehensive',
            interviewPromptVersion: 'comprehensive-v1',
          }),
        } as Response)
      }
      if (url === '/api/ai/historian/transcript-flush') {
        return Promise.resolve({ ok: true, status: 200 } as Response)
      }
      if (url === '/api/ai/historian/scales?action=step') {
        scaleRequests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            done: false,
            index: 0,
            item: { prompt: 'Synthetic HIT-6 item zero.' },
          }),
        } as Response)
      }
      throw new Error(`Unexpected active-scale fetch: ${url}`)
    }) as typeof fetch

    const hook = useRealtimeSession({
      sessionType: 'new_patient',
      interviewMode: 'comprehensive',
      provider: 'nova',
      referralReason: 'Synthetic headache fixture.',
      enableLocalizer: false,
      unresponsiveness: { enabled: false, checkInAfterMs: 60_000, giveUpAfterMs: 60_000 },
    })
    reactHarness.effects.forEach((effect) => effect())
    await hook.startSession()

    sink?.({ type: 'assistantTranscript', text: 'Why were you referred?', segmentId: 1 })
    sink?.({ type: 'userTranscript', text: 'Synthetic intermittent headache.', segmentId: 1 })
    sink?.({ type: 'assistantTranscript', text: 'Synthetic HIT-6 item zero?', segmentId: 1 })
    sink?.({
      type: 'toolCall',
      toolName: 'scale_step',
      toolUseId: 'synthetic-scale-step-0',
      input: { scale_id: 'hit6', reason: 'synthetic acceptance' },
      segmentId: 1,
    })

    await vi.waitFor(() => expect(provider.sendToolResult).toHaveBeenCalledOnce())
    expect(scaleRequests).toEqual([expect.objectContaining({ scale_id: 'hit6' })])

    const deadlineAtMs = Date.now() + 20_000
    sink?.({ type: 'continuationDue', segmentId: 1, deadlineAtMs })
    sink?.({
      type: 'continuationBarrier',
      barrierId: 'active-scale-barrier',
      segmentId: 1,
      lastAudioSeq: 40,
      deadlineAtMs,
    })

    await vi.waitFor(() => expect(provider.commitContinuation).toHaveBeenCalledOnce())
    expect(commits).toHaveLength(1)
    expect(commits[0]).toMatchObject({
      fromSegmentId: 1,
      administeredScaleIds: [],
      activeScale: { scaleId: 'hit6', itemIndex: 0 },
      pendingTools: [],
      runtimeGuard: { terminalReason: null },
    })

    streamOpen = false
    await hook.endSession('manual_end')
  })
})
