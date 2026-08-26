import { afterEach, describe, expect, it } from 'vitest'

import type { HistorianTranscriptEntry } from '@/lib/historianTypes'
import {
  issueLiveReviewClarificationReceipt,
  verifyLiveReviewClarificationEvidence,
} from '@/lib/historian/liveReviewClarificationReceipt'

const priorSecret = process.env.HISTORIAN_FLUSH_SECRET

afterEach(() => {
  if (priorSecret === undefined) delete process.env.HISTORIAN_FLUSH_SECRET
  else process.env.HISTORIAN_FLUSH_SECRET = priorSecret
})

const sessionId = '11111111-1111-4111-8111-111111111111'
const attemptId = '22222222-2222-4222-8222-222222222222'
const question = 'How do the synthetic headaches affect your usual activities?'
const transcript: HistorianTranscriptEntry[] = [
  { seq: 1, role: 'assistant', text: 'What brings you in?', timestamp: 0 },
  { seq: 2, role: 'user', text: 'Synthetic recurrent headaches.', timestamp: 1 },
  { seq: 3, role: 'assistant', text: question, timestamp: 2 },
  { seq: 4, role: 'user', text: 'I miss one synthetic work shift each month.', timestamp: 3 },
]

describe('server-signed live-review clarification receipts', () => {
  it('requires the exact session, attempt, question, and following patient answer', async () => {
    process.env.HISTORIAN_FLUSH_SECRET = 'synthetic-review-clarification-secret'
    const receipt = await issueLiveReviewClarificationReceipt(
      sessionId,
      attemptId,
      2,
      'functional_impact:functional_impact',
      question,
    )
    const evidence = { receipt, assistantSeq: 3, userSeq: 4 }

    await expect(verifyLiveReviewClarificationEvidence(
      sessionId,
      attemptId,
      transcript,
      evidence,
    )).resolves.toEqual(evidence)
    await expect(verifyLiveReviewClarificationEvidence(
      '33333333-3333-4333-8333-333333333333',
      attemptId,
      transcript,
      evidence,
    )).rejects.toThrow(/attestation/i)
    await expect(verifyLiveReviewClarificationEvidence(
      sessionId,
      attemptId,
      transcript,
      { ...evidence, assistantSeq: 1, userSeq: 2 },
    )).rejects.toThrow(/transcript/i)
  })
})
