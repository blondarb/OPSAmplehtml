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
import { syntheticPatientAnswer } from './patientEvidenceFixtures'

function lastToolOutput(provider: VoiceProvider): Record<string, unknown> {
  const calls = vi.mocked(provider.sendToolResult).mock.calls
  return calls.at(-1)?.[1] as Record<string, unknown>
}

describe('Comprehensive v2 synthetic runtime acceptance', () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  let voiceSink: ((event: VoiceEvent) => void) | null
  let streamOpen: boolean
  let provider: VoiceProvider

  beforeEach(() => {
    reactHarness.effects.length = 0
    voiceSink = null
    streamOpen = true
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    })
    provider = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => { streamOpen = false }),
      isOpen: vi.fn(() => streamOpen),
      on: vi.fn((callback) => { voiceSink = callback }),
      sendToolResult: vi.fn(),
      injectSystemText: vi.fn(),
      requestResponse: vi.fn(),
      suppressOutput: vi.fn(() => { streamOpen = false }),
      nudgeClosing: vi.fn(),
      commitContinuation: vi.fn(async () => 'rotated' as const),
      deferContinuation: vi.fn(),
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
            base_instructions: 'Synthetic Comprehensive v2 instructions.',
            tools: [],
            relayUrl: 'wss://synthetic.invalid/relay',
            relayToken: 'synthetic-token',
            sessionId: '00000000-0000-4000-8000-000000000061',
            flushToken: 'synthetic-flush-token',
            interviewMode: 'comprehensive',
            interviewPromptVersion: 'comprehensive-v2',
            turnEvidenceController: true,
          }),
        } as Response)
      }
      if (url === '/api/ai/historian/transcript-flush') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response)
      }
      if (url === '/api/ai/historian/safety-escalation') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response)
      }
      if (url === '/api/ai/historian/startup-recovery') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ recovered: true }) } as Response)
      }
      throw new Error(`Unexpected synthetic fetch: ${url}`)
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
    voiceFactory.provider = null
    vi.restoreAllMocks()
  })

  it('drives a deep one-question-at-a-time history to app-derived completion', async () => {
    const onComplete = vi.fn()
    const session = useRealtimeSession({
      sessionType: 'new_patient',
      interviewMode: 'comprehensive',
      provider: 'nova',
      enableLocalizer: false,
      unresponsiveness: { enabled: false, checkInAfterMs: 60_000, giveUpAfterMs: 60_000 },
      onComplete,
    })
    reactHarness.effects.forEach((effect) => effect())
    await session.startSession()

    expect(provider.start).toHaveBeenCalledWith(expect.objectContaining({
      interviewMode: 'comprehensive',
      turnEvidenceController: true,
    }))
    session.pushLocalizerContext({
      top_differentials: ['synthetic-private-differential'],
      suggested_next_question: 'Ask an uncontrolled question.',
    })
    session.injectScaleAdministration('Ask an uncontrolled scale question.')
    expect(provider.injectSystemText).not.toHaveBeenCalled()
    expect(provider.requestResponse).not.toHaveBeenCalled()

    let approvedTurns = 0
    let segmentId = 1
    for (let toolIndex = 1; toolIndex <= 61; toolIndex += 1) {
      voiceSink?.({
        type: 'toolCall',
        toolName: 'request_history_question',
        toolUseId: `question-${toolIndex}`,
        input: {},
        segmentId,
      })
      const output = lastToolOutput(provider)
      if (output.status === 'coverage_ready') {
        expect(output.completion).toBe('coverage_complete')
        break
      }
      expect(output).toMatchObject({ success: true, status: 'approved', allow_example: false })
      const text = String(output.approved_text)
      expect((text.match(/\?/g) ?? [])).toHaveLength(1)
      expect(text).not.toMatch(/\b(?:for example|for instance|such as|e\.g\.)\b/i)
      voiceSink?.({
        type: 'assistantTranscript',
        text,
        obligationId: String(output.obligation_id),
        segmentId,
      })
      approvedTurns += 1
      if (approvedTurns === 15 || approvedTurns === 30) {
        const deadlineAtMs = Date.now() + 30_000
        voiceSink?.({ type: 'continuationDue', segmentId, deadlineAtMs })
        voiceSink?.({
          type: 'continuationBarrier',
          barrierId: `barrier-${segmentId}`,
          segmentId,
          lastAudioSeq: approvedTurns,
          deadlineAtMs,
        })
        await vi.waitFor(() => {
          expect(provider.commitContinuation).toHaveBeenCalledTimes(segmentId)
        })
        segmentId += 1
      }
      voiceSink?.({
        type: 'userTranscript',
        // One bounded clarification plus every positive conditional produces
        // exactly 60 audible questions. The 60th answer must complete the
        // ledger instead of being discarded by the hard-stop guard.
        text: approvedTurns === 1
          ? 'What do you mean?'
          : syntheticPatientAnswer(String(output.obligation_id), 'maximal'),
        segmentId,
      })
    }

    expect(approvedTurns).toBe(60)
    expect(provider.suppressOutput).not.toHaveBeenCalled()
    expect(provider.commitContinuation).toHaveBeenCalledTimes(2)
    expect(vi.mocked(provider.commitContinuation).mock.calls.map((call) => (
      call[0].checkpoint.awaitingAnswerTo.text
    ))).toEqual(expect.arrayContaining([
      expect.stringMatching(/\?$/),
      expect.stringMatching(/\?$/),
    ]))

    voiceSink?.({
      type: 'toolCall',
      toolName: 'save_interview_output',
      toolUseId: 'save-1',
      segmentId,
      input: {
        chief_complaint: 'Synthetic negative fixture.',
        hpi: 'Synthetic transcript-derived summary.',
        narrative_summary: 'Synthetic transcript-derived summary.',
        safety_escalated: false,
        history_coverage: { covered_domains: [], missing_or_uncertain: [] },
      },
    })
    expect(lastToolOutput(provider)).toEqual({ success: true })
    voiceSink?.({
      type: 'assistantTranscript',
      text: 'Thank you. Your history has been recorded for your neurologist to review.',
      segmentId,
    })
    await session.endSession()

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      endedEarly: false,
      terminationReason: 'coverage_complete',
      questionCount: approvedTurns,
      interviewPromptVersion: 'comprehensive-v2',
      structuredOutput: expect.objectContaining({
        interview_prompt_version: 'comprehensive-v2',
        history_evidence_v1: expect.objectContaining({ version: 1 }),
        history_coverage: expect.objectContaining({ missing_or_uncertain: [] }),
      }),
    }))
    expect(provider.nudgeClosing).toHaveBeenCalledOnce()
  })

  it('settles answer 60, permits no question 61, and preserves a silent hard-stop partial save', async () => {
    const onComplete = vi.fn()
    vi.mocked(provider.suppressOutput).mockImplementation(() => undefined)
    const session = useRealtimeSession({
      sessionType: 'new_patient',
      interviewMode: 'comprehensive',
      provider: 'nova',
      enableLocalizer: false,
      unresponsiveness: { enabled: false, checkInAfterMs: 60_000, giveUpAfterMs: 60_000 },
      onComplete,
    })
    reactHarness.effects.forEach((effect) => effect())
    await session.startSession()

    let approvedTurns = 0
    let ageClarificationUsed = false
    for (let toolIndex = 1; toolIndex <= 60; toolIndex += 1) {
      voiceSink?.({
        type: 'toolCall',
        toolName: 'request_history_question',
        toolUseId: `hard-stop-question-${toolIndex}`,
        input: {},
        segmentId: 1,
      })
      const output = lastToolOutput(provider)
      expect(output).toMatchObject({ success: true, status: 'approved' })
      const obligationId = String(output.obligation_id)
      voiceSink?.({
        type: 'assistantTranscript',
        text: String(output.approved_text),
        obligationId,
        segmentId: 1,
      })
      approvedTurns += 1

      let answer = syntheticPatientAnswer(obligationId, 'maximal')
      if (approvedTurns === 1) answer = 'What do you mean?'
      if (obligationId === 'patient_reported_age' && !ageClarificationUsed) {
        ageClarificationUsed = true
        answer = 'What do you mean?'
      }
      voiceSink?.({ type: 'userTranscript', text: answer, segmentId: 1 })
    }

    expect(approvedTurns).toBe(60)
    expect(provider.suppressOutput).toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(provider.injectSystemText).toHaveBeenCalledWith(
        expect.stringContaining('60-exchange ceiling'),
      )
      expect(provider.requestResponse).toHaveBeenCalledWith({ textOnly: true })
    })

    // A request already emitted by Nova at the ceiling is acknowledged as a
    // non-speaking terminal result; it never authorizes question 61.
    voiceSink?.({
      type: 'toolCall',
      toolName: 'request_history_question',
      toolUseId: 'late-question-61',
      input: {},
      segmentId: 1,
    })
    expect(lastToolOutput(provider)).toEqual({
      success: false,
      status: 'interview_terminal',
    })

    voiceSink?.({
      type: 'toolCall',
      toolName: 'save_interview_output',
      toolUseId: 'hard-stop-save',
      segmentId: 1,
      input: {
        chief_complaint: 'Synthetic maximal fixture with one remaining gap.',
        narrative_summary: 'Synthetic transcript-derived partial summary.',
        safety_escalated: false,
        patient_requested_stop: false,
        history_coverage: { covered_domains: [], missing_or_uncertain: [] },
      },
    })
    expect(lastToolOutput(provider)).toEqual({ success: true })

    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
        endedEarly: true,
        terminationReason: 'hard_stop',
        questionCount: 60,
        structuredOutput: expect.objectContaining({
          interview_prompt_version: 'comprehensive-v2',
          history_evidence_v1: expect.objectContaining({ version: 1 }),
          history_coverage: expect.objectContaining({
            missing_or_uncertain: expect.any(Array),
          }),
        }),
      }))
    })
    const completed = onComplete.mock.calls[0][0]
    expect(completed.structuredOutput.history_coverage.missing_or_uncertain.length)
      .toBeGreaterThan(0)
    expect(provider.nudgeClosing).not.toHaveBeenCalled()
  })

  it('fails closed and reopens the zero-turn invitation when an assistant turn differs from its approval', async () => {
    const onComplete = vi.fn()
    const session = useRealtimeSession({
      sessionType: 'new_patient',
      interviewMode: 'comprehensive',
      provider: 'nova',
      enableLocalizer: false,
      unresponsiveness: { enabled: false, checkInAfterMs: 60_000, giveUpAfterMs: 60_000 },
      onComplete,
    })
    reactHarness.effects.forEach((effect) => effect())
    await session.startSession()
    voiceSink?.({
      type: 'toolCall',
      toolName: 'request_history_question',
      toolUseId: 'question-bad',
      input: {},
      segmentId: 1,
    })
    const approval = lastToolOutput(provider)
    voiceSink?.({
      type: 'assistantTranscript',
      text: 'When did it begin and how has it changed?',
      obligationId: String(approval.obligation_id),
      segmentId: 1,
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(provider.suppressOutput).toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/ai/historian/startup-recovery',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('escalates a direct yes to the app-owned active-emergency question', async () => {
    const onComplete = vi.fn()
    const session = useRealtimeSession({
      sessionType: 'new_patient',
      interviewMode: 'comprehensive',
      provider: 'nova',
      enableLocalizer: false,
      unresponsiveness: { enabled: false, checkInAfterMs: 60_000, giveUpAfterMs: 60_000 },
      onComplete,
    })
    reactHarness.effects.forEach((effect) => effect())
    await session.startSession()

    let reachedEmergencyQuestion = false
    for (let toolIndex = 1; toolIndex <= 30; toolIndex += 1) {
      voiceSink?.({
        type: 'toolCall',
        toolName: 'request_history_question',
        toolUseId: `safety-question-${toolIndex}`,
        input: {},
        segmentId: 1,
      })
      const output = lastToolOutput(provider)
      const text = String(output.approved_text)
      voiceSink?.({
        type: 'assistantTranscript',
        text,
        obligationId: String(output.obligation_id),
        segmentId: 1,
      })
      if (output.obligation_id === 'red_flags') {
        reachedEmergencyQuestion = true
        voiceSink?.({
          type: 'userTranscript',
          text: 'Yes, and I want to stop.',
          segmentId: 1,
        })
        break
      }
      voiceSink?.({
        type: 'userTranscript',
        text: syntheticPatientAnswer(String(output.obligation_id)),
        segmentId: 1,
      })
    }

    expect(reachedEmergencyQuestion).toBe(true)
    expect(provider.suppressOutput).toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
        endedEarly: true,
        terminationReason: 'safety_escalated',
        safetyEscalated: true,
        transcript: expect.arrayContaining([
          expect.objectContaining({ role: 'user', text: 'Yes, and I want to stop.' }),
        ]),
      }))
    })
  })
})
