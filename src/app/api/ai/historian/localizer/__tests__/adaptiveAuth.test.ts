import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  invokeBedrockJSONMock,
  verifyFlushTokenMock,
  queryMock,
  retrievePlanEvidenceMock,
  issueClarificationReceiptMock,
} = vi.hoisted(() => ({
  invokeBedrockJSONMock: vi.fn(),
  verifyFlushTokenMock: vi.fn(),
  queryMock: vi.fn(),
  retrievePlanEvidenceMock: vi.fn(),
  issueClarificationReceiptMock: vi.fn(),
}))

vi.mock('@/lib/bedrock', () => ({ invokeBedrockJSON: invokeBedrockJSONMock }))
vi.mock('@/lib/historian/flushToken', () => ({ verifyFlushToken: verifyFlushTokenMock }))
vi.mock('@/lib/historian/liveReviewClarificationReceipt', () => ({
  issueLiveReviewClarificationReceipt: issueClarificationReceiptMock,
}))
vi.mock('@/lib/db', () => ({
  getPool: async () => ({ query: queryMock }),
  getNeuroPlansPool: async () => ({}),
}))
vi.mock('@/lib/consult/planEvidence', () => ({
  retrievePlanEvidence: retrievePlanEvidenceMock,
}))
vi.mock('@/lib/db-query', () => ({ from: vi.fn() }))

import { POST } from '@/app/api/ai/historian/localizer/route'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222'

function request(
  token = 'conductor-token',
  overrides: Record<string, unknown> = {},
) {
  return new NextRequest('https://example.test/api/ai/historian/localizer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      sessionId: SESSION_ID,
      sessionType: 'new_patient',
      adaptiveInterview: true,
      transcript: [
        { role: 'assistant', text: 'Why were you referred?', timestamp: 0 },
        { role: 'user', text: 'Synthetic recurrent headaches.', timestamp: 1 },
      ],
      reviewGaps: ['functional_impact'],
      reviewIntents: ['Clarify how the headaches affect daily function.'],
      ...overrides,
    }),
  })
}

describe('adaptive Claude conductor authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyFlushTokenMock.mockResolvedValue({
      sessionId: SESSION_ID,
      startupAttemptId: ATTEMPT_ID,
    })
    queryMock.mockResolvedValue({
      rows: [{ status: 'in_progress', startup_attempt_id: ATTEMPT_ID }],
    })
    retrievePlanEvidenceMock.mockResolvedValue({ guidelineText: '', citations: [] })
    invokeBedrockJSONMock.mockResolvedValue({
      parsed: {
        followUpQuestions: ['How do the headaches affect your usual activities?'],
        confidence: 'medium',
        addressedReviewIntent: null,
      },
    })
    issueClarificationReceiptMock.mockImplementation(async (
      _sessionId: string,
      _attemptId: string,
      reviewedThroughPatientSeq: number,
      gapKey: string,
      question: string,
    ) => ({
      version: 1,
      reviewedThroughPatientSeq,
      gapKey,
      question,
      attestation: 'c'.repeat(43),
    }))
  })

  it('rejects an invalid bearer before sending transcript content to Claude', async () => {
    verifyFlushTokenMock.mockResolvedValueOnce(null)
    const response = await POST(request('invalid'))
    expect(response.status).toBe(403)
    expect(invokeBedrockJSONMock).not.toHaveBeenCalled()
  })

  it('rejects a conductor request from a stale invited attempt', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ status: 'in_progress', startup_attempt_id: '33333333-3333-4333-8333-333333333333' }],
    })
    const response = await POST(request())
    expect(response.status).toBe(403)
    expect(invokeBedrockJSONMock).not.toHaveBeenCalled()
  })

  it('returns patient-specific guidance only for the current bound attempt', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.followUpQuestions).toEqual([
      'How do the headaches affect your usual activities?',
    ])
    expect(invokeBedrockJSONMock).toHaveBeenCalledTimes(1)
    expect(retrievePlanEvidenceMock).not.toHaveBeenCalled()
    const generatorInput = JSON.parse(invokeBedrockJSONMock.mock.calls[0][0].messages[0].content)
    expect(generatorInput.silentReviewerMissingDomains).toEqual(['functional_impact'])
    expect(generatorInput.silentReviewerNextQuestionIntents).toEqual([
      'Clarify how the headaches affect daily function.',
    ])
    expect(generatorInput.orderedTranscript).toEqual([
      { role: 'assistant', text: 'Why were you referred?' },
      { role: 'user', text: 'Synthetic recurrent headaches.' },
    ])
  })

  it('credits a reviewer clarification only when Claude echoes the exact required intent', async () => {
    const requiredReviewIntent = 'Clarify how the headaches affect daily function.'
    const requiredReviewGapKey = 'functional_impact:functional_impact'
    invokeBedrockJSONMock.mockResolvedValueOnce({
      parsed: {
        followUpQuestions: ['How do the headaches affect your usual activities?'],
        confidence: 'medium',
        addressedReviewIntent: requiredReviewIntent,
      },
    })

    const response = await POST(request('conductor-token', {
      requiredReviewIntent,
      requiredReviewGapKey,
      reviewedThroughPatientSeq: 2,
    }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      followUpQuestions: ['How do the headaches affect your usual activities?'],
      addressedReviewGapKey: requiredReviewGapKey,
    })
    const generatorInput = JSON.parse(invokeBedrockJSONMock.mock.calls[0][0].messages[0].content)
    expect(generatorInput.requiredSilentReviewerIntent).toBe(requiredReviewIntent)
  })

  it('does not credit or release a different conductor target as the required reviewer gap', async () => {
    invokeBedrockJSONMock.mockResolvedValueOnce({
      parsed: {
        followUpQuestions: ['When did the headaches begin?'],
        confidence: 'medium',
        addressedReviewIntent: 'Clarify headache onset.',
      },
    })
    const response = await POST(request('conductor-token', {
      requiredReviewIntent: 'Clarify functional impact.',
      requiredReviewGapKey: 'functional_impact:functional_impact',
      reviewedThroughPatientSeq: 2,
    }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      followUpQuestions: [],
      partial: true,
    })
  })
})
