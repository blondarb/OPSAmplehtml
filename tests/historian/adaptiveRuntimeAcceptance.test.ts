import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { VoiceEvent, VoiceProvider } from '@/lib/voice/providerTypes'
import { COMPREHENSIVE_HISTORY_DOMAINS } from '@/lib/historianTypes'
import { LIVE_INTERVIEW_REVIEW_PROMPT_VERSION } from '@/lib/historian/liveReviewContract'

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

import { useRealtimeSession } from '@/hooks/useRealtimeSession'

function lastToolOutput(provider: VoiceProvider): Record<string, unknown> {
  return vi.mocked(provider.sendToolResult).mock.calls.at(-1)?.[1] as Record<string, unknown>
}

function syntheticAdaptiveProposal(turn: number): string {
  if (turn === 1) return "Hi, I'm Henry. What brings you in for your neurology visit today?"
  if (turn === 2) return 'What is your age?'
  return `What patient-specific headache detail should we clarify at turn ${turn}?`
}

describe('Comprehensive v3 adaptive synthetic runtime acceptance', () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  let provider: VoiceProvider
  let voiceSink: ((event: VoiceEvent) => void) | null
  let streamOpen: boolean
  let reviewCalls: number
  let reviewSafetyConcern: boolean
  let conductorRequests: Array<{ headers: Record<string, string>; body: Record<string, unknown> }>
  let conductorGate: Promise<void> | null
  let releaseConductor: (() => void) | null

  beforeEach(() => {
    reactHarness.effects.length = 0
    voiceSink = null
    streamOpen = true
    reviewCalls = 0
    reviewSafetyConcern = false
    conductorRequests = []
    conductorGate = null
    releaseConductor = null
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
      suppressOutput: vi.fn(),
      nudgeClosing: vi.fn(),
      commitContinuation: vi.fn(async () => 'rotated' as const),
      deferContinuation: vi.fn(),
    }
    voiceFactory.provider = provider

    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/ai/historian/session') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            provider: 'nova',
            base_instructions: 'Synthetic Comprehensive v3 adaptive instructions.',
            tools: [],
            relayUrl: 'wss://synthetic.invalid/relay',
            relayToken: 'synthetic-token',
            sessionId: '00000000-0000-4000-8000-000000000063',
            flushToken: 'synthetic-flush-token',
            interviewMode: 'comprehensive',
            interviewPromptVersion: 'comprehensive-v3',
            turnEvidenceController: false,
            adaptiveTurnController: true,
          }),
        } as Response
      }
      if (url === '/api/ai/historian/live-review') {
        reviewCalls += 1
        const requestBody = JSON.parse(String(init?.body))
        const transcript = requestBody.transcript as Array<{
          seq: number
          role: 'assistant' | 'user'
          text: string
        }>
        const patientSeqs = transcript
          .filter((entry) => entry.role === 'user')
          .map((entry) => entry.seq)
        return {
          ok: true,
          status: 200,
          json: async () => ({
            review: {
              version: 1,
              reviewedThroughSeq: patientSeqs.at(-1),
              domains: COMPREHENSIVE_HISTORY_DOMAINS.map((domain, index) => ({
                domain: domain.id,
                status: 'covered',
                patientSeqs: [patientSeqs[index % patientSeqs.length]],
              })),
              criticalGaps: [],
              contradictions: [],
              repetitions: [],
              activeSafetyConcern: {
                present: reviewSafetyConcern,
                patientSeqs: reviewSafetyConcern ? [patientSeqs.at(-1)] : [],
              },
              readyToClose: !reviewSafetyConcern && patientSeqs.length >= 12,
              nextQuestionIntents: patientSeqs.length >= 12
                ? []
                : ['Deepen the patient-specific headache history.'],
              confidence: patientSeqs.length >= 12 ? 'high' : 'medium',
            },
            provenance: {
              modelId: 'synthetic-independent-reviewer',
              promptVersion: LIVE_INTERVIEW_REVIEW_PROMPT_VERSION,
              generatedAt: '2026-08-25T12:00:00.000Z',
            },
            attestation: 'a'.repeat(43),
          }),
        } as Response
      }
      if (url === '/api/ai/historian/localizer') {
        conductorRequests.push({
          headers: init?.headers as Record<string, string>,
          body: JSON.parse(String(init?.body)),
        })
        if (conductorGate) await conductorGate
        return {
          ok: true,
          status: 200,
          json: async () => ({
            differential: [{
              diagnosis: 'synthetic-private-differential',
              rationale: 'Private QA fixture.',
              likelihood: 'medium',
            }],
            evidenceSnippets: [],
            followUpQuestions: ['How long does each headache usually last?'],
            contextHint: 'Private synthetic context.',
            confidence: 'medium',
            localizationHypothesis: 'Private synthetic localization.',
            kbSources: [],
            processingMs: 1,
            partial: false,
            push_payload: {
              top_differentials: ['synthetic-private-differential'],
              suggested_next_question: 'How long does each headache usually last?',
              suggested_scale_id: null,
            },
          }),
        } as Response
      }
      if (
        url === '/api/ai/historian/transcript-flush' ||
        url === '/api/ai/historian/startup-recovery' ||
        url === '/api/ai/historian/safety-escalation'
      ) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response
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

  it('keeps Nova conversational while app validation and the silent reviewer control closure', async () => {
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
      adaptiveTurnController: true,
      turnEvidenceController: false,
    }))

    for (let turn = 1; turn <= 12; turn += 1) {
      voiceSink?.({
        type: 'toolCall',
        toolName: 'request_history_question',
        toolUseId: `adaptive-question-${turn}`,
        segmentId: 1,
        input: {
          proposed_text: turn === 3
            ? 'How has the symptom changed?'
            : syntheticAdaptiveProposal(turn),
        },
      })
      let output = lastToolOutput(provider)
      if (turn === 3) {
        expect(output).toMatchObject({
          success: false,
          status: 'proposal_rejected',
          issue_codes: expect.arrayContaining(['generic_symptom_reference']),
        })
        voiceSink?.({
          type: 'toolCall',
          toolName: 'request_history_question',
          toolUseId: 'adaptive-question-3-retry',
          segmentId: 1,
          input: { proposed_text: 'How have the headaches changed since they began?' },
        })
        output = lastToolOutput(provider)
      }
      expect(output).toMatchObject({ success: true, status: 'approved', allow_example: false })
      if (turn === 1) expect(output.approved_text).toBe(syntheticAdaptiveProposal(1))
      if (turn === 2) expect(output.approved_text).toBe(syntheticAdaptiveProposal(2))
      voiceSink?.({
        type: 'assistantTranscript',
        text: String(output.approved_text),
        obligationId: String(output.obligation_id),
        segmentId: 1,
      })
      voiceSink?.({
        type: 'userTranscript',
        text: `Synthetic detailed patient answer ${turn}.`,
        segmentId: 1,
      })
      await Promise.resolve()
      await Promise.resolve()
      if (turn % 4 === 0) {
        await vi.waitFor(() => expect(reviewCalls).toBe(turn / 4))
      }
    }

    await vi.waitFor(() => expect(reviewCalls).toBe(3))
    voiceSink?.({
      type: 'toolCall',
      toolName: 'request_history_question',
      toolUseId: 'coverage-check',
      segmentId: 1,
      input: { proposed_text: 'What else would you like your neurologist to know?' },
    })
    expect(lastToolOutput(provider)).toEqual({
      success: true,
      status: 'coverage_ready',
      completion: 'coverage_complete',
    })

    voiceSink?.({
      type: 'toolCall',
      toolName: 'save_interview_output',
      toolUseId: 'adaptive-save',
      segmentId: 1,
      input: {
        narrative_summary: 'Synthetic transcript-derived summary.',
        safety_escalated: false,
        patient_requested_stop: false,
        history_coverage: { covered_domains: [], missing_or_uncertain: [] },
      },
    })
    expect(lastToolOutput(provider)).toEqual({ success: true })
    voiceSink?.({
      type: 'assistantTranscript',
      text: 'Thank you. Your history has been recorded for your neurologist to review.',
      segmentId: 1,
    })
    await session.endSession()

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      endedEarly: false,
      terminationReason: 'coverage_complete',
      questionCount: 12,
      interviewPromptVersion: 'comprehensive-v3',
      structuredOutput: expect.objectContaining({
        interview_prompt_version: 'comprehensive-v3',
        live_review_v1: expect.objectContaining({ attestation: 'a'.repeat(43) }),
        history_coverage: expect.objectContaining({ missing_or_uncertain: [] }),
      }),
    }))
    expect(provider.nudgeClosing).toHaveBeenCalledOnce()
  })

  it('restores Claude as a private rolling clinical conductor every three patient turns', async () => {
    conductorGate = new Promise<void>((resolve) => { releaseConductor = resolve })
    const session = useRealtimeSession({
      sessionType: 'new_patient',
      interviewMode: 'comprehensive',
      provider: 'nova',
      unresponsiveness: { enabled: false, checkInAfterMs: 60_000, giveUpAfterMs: 60_000 },
    })
    reactHarness.effects.forEach((effect) => effect())
    await session.startSession()

    for (let turn = 1; turn <= 3; turn += 1) {
      voiceSink?.({
        type: 'toolCall',
        toolName: 'request_history_question',
        toolUseId: `conductor-question-${turn}`,
        segmentId: 1,
        input: { proposed_text: syntheticAdaptiveProposal(turn) },
      })
      const output = lastToolOutput(provider)
      voiceSink?.({
        type: 'assistantTranscript',
        text: String(output.approved_text),
        obligationId: String(output.obligation_id),
        segmentId: 1,
      })
      voiceSink?.({
        type: 'userTranscript',
        text: `Synthetic patient answer ${turn}.`,
        segmentId: 1,
      })
    }

    await vi.waitFor(() => expect(conductorRequests).toHaveLength(1))
    expect(conductorRequests[0].headers.Authorization).toBe('Bearer synthetic-flush-token')
    expect(conductorRequests[0].body).toMatchObject({
      sessionId: '00000000-0000-4000-8000-000000000063',
      adaptiveInterview: true,
    })
    expect(conductorRequests[0].body.transcript).toHaveLength(6)

    // Nova can propose immediately, but this intermittent turn is withheld
    // until the slower Claude conductor answers (or the bounded wait expires).
    voiceSink?.({
      type: 'toolCall',
      toolName: 'request_history_question',
      toolUseId: 'conductor-inserted-question',
      segmentId: 1,
      input: { proposed_text: 'What does the headache feel like?' },
    })
    expect(vi.mocked(provider.sendToolResult)).toHaveBeenCalledTimes(3)
    releaseConductor?.()

    await vi.waitFor(() => {
      expect(provider.injectSystemText).toHaveBeenCalledWith(
        expect.stringContaining('PRIVATE CLAUDE CLINICAL CONDUCTOR NOTE'),
      )
    })
    const injected = String(vi.mocked(provider.injectSystemText).mock.calls[0][0])
    expect(injected).toContain('How long does each headache usually last?')
    expect(injected).not.toContain('synthetic-private-differential')
    expect(provider.injectSystemText).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(lastToolOutput(provider)).toEqual({
        success: false,
        status: 'proposal_rejected',
        issue_codes: ['clinical_redirect'],
        required_text: 'How long does each headache usually last?',
      })
    })
    voiceSink?.({
      type: 'toolCall',
      toolName: 'request_history_question',
      toolUseId: 'conductor-resubmitted-question',
      segmentId: 1,
      input: { proposed_text: 'How long does each headache usually last?' },
    })
    expect(lastToolOutput(provider)).toMatchObject({
      success: true,
      status: 'approved',
      obligation_id: 'claude-conductor-4',
      approved_text: 'How long does each headache usually last?',
    })
  })

  it('lets the transcript-citing silent reviewer strengthen the existing safety pathway', async () => {
    reviewSafetyConcern = true
    const onSafetyEscalation = vi.fn()
    const session = useRealtimeSession({
      sessionType: 'new_patient',
      interviewMode: 'comprehensive',
      provider: 'nova',
      enableLocalizer: false,
      unresponsiveness: { enabled: false, checkInAfterMs: 60_000, giveUpAfterMs: 60_000 },
      onSafetyEscalation,
    })
    reactHarness.effects.forEach((effect) => effect())
    await session.startSession()

    for (let turn = 1; turn <= 4; turn += 1) {
      voiceSink?.({
        type: 'toolCall',
        toolName: 'request_history_question',
        toolUseId: `reviewer-safety-question-${turn}`,
        segmentId: 1,
        input: { proposed_text: syntheticAdaptiveProposal(turn) },
      })
      const output = lastToolOutput(provider)
      voiceSink?.({
        type: 'assistantTranscript',
        text: String(output.approved_text),
        obligationId: String(output.obligation_id),
        segmentId: 1,
      })
      if (turn === 4) streamOpen = false
      voiceSink?.({
        type: 'userTranscript',
        text: `Synthetic patient answer ${turn}.`,
        segmentId: 1,
      })
    }

    await vi.waitFor(() => expect(reviewCalls).toBe(1))
    await vi.waitFor(() => expect(onSafetyEscalation).toHaveBeenCalledOnce())
    expect(provider.suppressOutput).toHaveBeenCalled()
  })
})
