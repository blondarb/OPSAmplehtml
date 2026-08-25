import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  invokeBedrockJSONMock,
  verifyFlushTokenMock,
  queryMock,
  retrievePlanEvidenceMock,
} = vi.hoisted(() => ({
  invokeBedrockJSONMock: vi.fn(),
  verifyFlushTokenMock: vi.fn(),
  queryMock: vi.fn(),
  retrievePlanEvidenceMock: vi.fn(),
}))

vi.mock('@/lib/bedrock', () => ({ invokeBedrockJSON: invokeBedrockJSONMock }))
vi.mock('@/lib/historian/flushToken', () => ({ verifyFlushToken: verifyFlushTokenMock }))
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

function request(token = 'conductor-token') {
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
    invokeBedrockJSONMock
      .mockResolvedValueOnce({
        parsed: {
          primarySymptoms: ['headache'],
          location: [],
          temporalPattern: ['recurrent'],
          severity: [],
          associatedFeatures: [],
          redFlags: [],
          clinicalSummary: 'Synthetic recurrent headaches.',
        },
      })
      .mockResolvedValueOnce({
        parsed: {
          followUpQuestions: ['How do the headaches affect your usual activities?'],
          differential: [],
          localizationHypothesis: '',
          contextHint: 'Based on what the patient has shared so far, more functional history is needed.',
          confidence: 'medium',
          suggested_actions: [],
        },
      })
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
    expect(invokeBedrockJSONMock).toHaveBeenCalledTimes(2)
    const generatorInput = JSON.parse(invokeBedrockJSONMock.mock.calls[1][0].messages[0].content)
    expect(generatorInput.silentReviewerMissingDomains).toEqual(['functional_impact'])
    expect(generatorInput.silentReviewerNextQuestionIntents).toEqual([
      'Clarify how the headaches affect daily function.',
    ])
  })
})
