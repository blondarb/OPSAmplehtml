import { isLiveReviewGapKey } from './liveReviewContract'

export const LIVE_REVIEW_CLARIFICATION_RECEIPT_VERSION = 1 as const

export interface LiveReviewClarificationReceiptV1 {
  version: typeof LIVE_REVIEW_CLARIFICATION_RECEIPT_VERSION
  reviewedThroughPatientSeq: number
  gapKey: string
  question: string
  attestation: string
}

export interface LiveReviewClarificationEvidenceV1 {
  receipt: LiveReviewClarificationReceiptV1
  assistantSeq: number
  userSeq: number
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys)
  return Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key))
}

export function parseLiveReviewClarificationReceipt(
  raw: unknown,
): LiveReviewClarificationReceiptV1 {
  if (!isPlainObject(raw) || !hasExactKeys(raw, [
    'version',
    'reviewedThroughPatientSeq',
    'gapKey',
    'question',
    'attestation',
  ])) throw new Error('Live review clarification receipt has an invalid schema.')
  if (
    raw.version !== LIVE_REVIEW_CLARIFICATION_RECEIPT_VERSION ||
    !Number.isInteger(raw.reviewedThroughPatientSeq) ||
    (raw.reviewedThroughPatientSeq as number) < 1 ||
    !isLiveReviewGapKey(raw.gapKey) ||
    typeof raw.question !== 'string' ||
    !raw.question.trim() ||
    raw.question !== raw.question.trim() ||
    raw.question.length > 280 ||
    typeof raw.attestation !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(raw.attestation)
  ) throw new Error('Live review clarification receipt is invalid.')
  return {
    version: LIVE_REVIEW_CLARIFICATION_RECEIPT_VERSION,
    reviewedThroughPatientSeq: raw.reviewedThroughPatientSeq as number,
    gapKey: raw.gapKey,
    question: raw.question,
    attestation: raw.attestation,
  }
}

export function parseLiveReviewClarificationEvidence(
  raw: unknown,
): LiveReviewClarificationEvidenceV1 {
  if (!isPlainObject(raw) || !hasExactKeys(raw, ['receipt', 'assistantSeq', 'userSeq'])) {
    throw new Error('Live review clarification evidence has an invalid schema.')
  }
  if (
    !Number.isInteger(raw.assistantSeq) ||
    !Number.isInteger(raw.userSeq) ||
    (raw.assistantSeq as number) < 1 ||
    raw.userSeq !== (raw.assistantSeq as number) + 1
  ) throw new Error('Live review clarification evidence sequences are invalid.')
  return {
    receipt: parseLiveReviewClarificationReceipt(raw.receipt),
    assistantSeq: raw.assistantSeq as number,
    userSeq: raw.userSeq as number,
  }
}
