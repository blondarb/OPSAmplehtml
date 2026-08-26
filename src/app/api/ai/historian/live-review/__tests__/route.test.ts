import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  verifyFlushTokenMock,
  queryMock,
  generateReviewMock,
  attestReviewMock,
} = vi.hoisted(() => ({
  verifyFlushTokenMock: vi.fn(),
  queryMock: vi.fn(),
  generateReviewMock: vi.fn(),
  attestReviewMock: vi.fn(),
}))

vi.mock('@/lib/historian/flushToken', () => ({ verifyFlushToken: verifyFlushTokenMock }))
vi.mock('@/lib/db', () => ({ getPool: async () => ({ query: queryMock }) }))
vi.mock('@/lib/historian/liveReview', () => ({
  generateLiveInterviewReview: generateReviewMock,
}))
vi.mock('@/lib/historian/liveReviewAttestation', () => ({
  attestLiveInterviewReview: attestReviewMock,
}))

import { POST } from '@/app/api/ai/historian/live-review/route'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222'
const TRANSCRIPT = [
  { seq: 1, role: 'assistant', text: 'Why were you referred?', timestamp: 0 },
  { seq: 2, role: 'user', text: 'Synthetic headaches prompted the referral.', timestamp: 2 },
]

function request(overrides: Record<string, unknown> = {}, token = 'review-token') {
  return new Request('https://example.test/api/ai/historian/live-review', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sessionId: SESSION_ID, transcript: TRANSCRIPT, ...overrides }),
  })
}

describe('POST /api/ai/historian/live-review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyFlushTokenMock.mockResolvedValue({
      sessionId: SESSION_ID,
      startupAttemptId: ATTEMPT_ID,
    })
    queryMock.mockResolvedValue({ rows: [] })
    generateReviewMock.mockResolvedValue({ review: { version: 1 }, provenance: {} })
    attestReviewMock.mockResolvedValue({
      review: { version: 1 },
      provenance: {},
      attestation: 'a'.repeat(43),
    })
  })

  it('requires a session-bound bearer before invoking either model or attestation', async () => {
    verifyFlushTokenMock.mockResolvedValueOnce(null)
    const response = await POST(request({}, 'invalid'))
    expect(response.status).toBe(403)
    expect(generateReviewMock).not.toHaveBeenCalled()
    expect(attestReviewMock).not.toHaveBeenCalled()
  })

  it('rejects authority from an older invited interview attempt', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ status: 'in_progress', startup_attempt_id: '33333333-3333-4333-8333-333333333333' }],
    })
    const response = await POST(request())
    expect(response.status).toBe(403)
    expect(generateReviewMock).not.toHaveBeenCalled()
  })

  it('reviews and server-attests the exact bounded transcript for the current attempt', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ status: 'in_progress', startup_attempt_id: ATTEMPT_ID }],
    })
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(generateReviewMock).toHaveBeenCalledWith(TRANSCRIPT, { diagnosticDepth: false })
    expect(attestReviewMock).toHaveBeenCalledWith(
      SESSION_ID,
      TRANSCRIPT,
      { review: { version: 1 }, provenance: {} },
      ATTEMPT_ID,
    )
    expect(await response.json()).toMatchObject({ attestation: 'a'.repeat(43) })
  })

  it('uses database-bound Comprehensive v4 authority to request diagnostic-depth review', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        status: 'in_progress',
        startup_attempt_id: ATTEMPT_ID,
        interview_prompt_version: 'comprehensive-v4',
      }],
    })
    generateReviewMock.mockResolvedValueOnce({ review: { version: 2 }, provenance: {} })
    attestReviewMock.mockResolvedValueOnce({
      review: { version: 2 }, provenance: {}, attestation: 'b'.repeat(43),
    })

    const response = await POST(request({ interviewPromptVersion: 'comprehensive-v3' }))
    expect(response.status).toBe(200)
    expect(generateReviewMock).toHaveBeenCalledWith(TRANSCRIPT, { diagnosticDepth: true })
    expect(attestReviewMock).toHaveBeenCalledWith(
      SESSION_ID,
      TRANSCRIPT,
      { review: { version: 2 }, provenance: {} },
      ATTEMPT_ID,
    )
  })

  it('rejects noncontiguous or assistant-ended transcript snapshots before model use', async () => {
    const response = await POST(request({
      transcript: [
        { seq: 1, role: 'assistant', text: 'Question?', timestamp: 0 },
        { seq: 3, role: 'user', text: 'Answer.', timestamp: 1 },
      ],
    }))
    expect(response.status).toBe(400)
    expect(generateReviewMock).not.toHaveBeenCalled()
  })
})
