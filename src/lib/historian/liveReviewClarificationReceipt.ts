import type { HistorianTranscriptEntry } from '@/lib/historianTypes'
import {
  signHistorianServerPayload,
  verifyHistorianServerPayload,
} from './flushToken'
import {
  LIVE_REVIEW_CLARIFICATION_RECEIPT_VERSION,
  parseLiveReviewClarificationEvidence,
  parseLiveReviewClarificationReceipt,
  type LiveReviewClarificationEvidenceV1,
  type LiveReviewClarificationReceiptV1,
} from './liveReviewClarificationContract'

const PURPOSE = 'live-review-clarification'

function payload(
  sessionId: string,
  startupAttemptId: string | undefined,
  receipt: Omit<LiveReviewClarificationReceiptV1, 'attestation'>,
): string {
  return JSON.stringify({
    sessionId,
    startupAttemptId: startupAttemptId ?? null,
    version: receipt.version,
    reviewedThroughPatientSeq: receipt.reviewedThroughPatientSeq,
    gapKey: receipt.gapKey,
    question: receipt.question,
  })
}

export async function issueLiveReviewClarificationReceipt(
  sessionId: string,
  startupAttemptId: string | undefined,
  reviewedThroughPatientSeq: number,
  gapKey: string,
  question: string,
): Promise<LiveReviewClarificationReceiptV1> {
  const unsigned = parseLiveReviewClarificationReceipt({
    version: LIVE_REVIEW_CLARIFICATION_RECEIPT_VERSION,
    reviewedThroughPatientSeq,
    gapKey,
    question,
    attestation: 'a'.repeat(43),
  })
  const { attestation: _placeholder, ...receipt } = unsigned
  return {
    ...receipt,
    attestation: await signHistorianServerPayload(
      PURPOSE,
      payload(sessionId, startupAttemptId, receipt),
    ),
  }
}

export async function verifyLiveReviewClarificationEvidence(
  sessionId: string,
  startupAttemptId: string | undefined,
  transcript: HistorianTranscriptEntry[],
  raw: unknown,
): Promise<LiveReviewClarificationEvidenceV1> {
  const evidence = parseLiveReviewClarificationEvidence(raw)
  const { attestation, ...receipt } = evidence.receipt
  const valid = await verifyHistorianServerPayload(
    PURPOSE,
    payload(sessionId, startupAttemptId, receipt),
    attestation,
  )
  if (!valid) throw new Error('Live review clarification attestation is invalid.')
  const assistant = transcript.find((entry) => entry.seq === evidence.assistantSeq)
  const user = transcript.find((entry) => entry.seq === evidence.userSeq)
  if (
    evidence.receipt.reviewedThroughPatientSeq >= evidence.assistantSeq ||
    assistant?.role !== 'assistant' ||
    assistant.text !== evidence.receipt.question ||
    user?.role !== 'user' ||
    !user.text.trim()
  ) throw new Error('Live review clarification evidence does not match the transcript.')
  return evidence
}
