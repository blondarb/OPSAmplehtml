import type { HistorianTranscriptEntry } from '@/lib/historianTypes'
import {
  signHistorianServerPayload,
  verifyHistorianServerPayload,
} from './flushToken'
import {
  parseLiveInterviewReviewArtifact,
  type LiveInterviewReviewArtifact,
  type UnsignedLiveInterviewReviewArtifact,
} from './liveReviewContract'

const ATTESTATION_PURPOSE = 'live-interview-review'

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map((key) => (
    `${JSON.stringify(key)}:${stableJson(object[key])}`
  )).join(',')}}`
}

function canonicalAttestationPayload(
  sessionId: string,
  transcript: HistorianTranscriptEntry[],
  artifact: UnsignedLiveInterviewReviewArtifact,
  startupAttemptId?: string,
): string {
  const payload = {
    sessionId,
    startupAttemptId: startupAttemptId ?? null,
    transcript: transcript.map((entry) => ({
      seq: entry.seq,
      role: entry.role,
      text: entry.text.trim(),
    })),
    artifact: {
      review: artifact.review,
      provenance: artifact.provenance,
    },
  }
  // Preserve the shipped v1 byte contract. V2 uses canonical key ordering so
  // parser normalization cannot invalidate an otherwise identical artifact.
  return artifact.review.version === 2 ? stableJson(payload) : JSON.stringify(payload)
}

export async function attestLiveInterviewReview(
  sessionId: string,
  transcript: HistorianTranscriptEntry[],
  artifact: UnsignedLiveInterviewReviewArtifact,
  startupAttemptId?: string,
): Promise<LiveInterviewReviewArtifact> {
  const attestation = await signHistorianServerPayload(
    ATTESTATION_PURPOSE,
    canonicalAttestationPayload(sessionId, transcript, artifact, startupAttemptId),
  )
  return { ...artifact, attestation }
}

/**
 * Parse, normalize, and verify the server-only review attestation. A browser
 * may transport this artifact, but it cannot alter closure, evidence, model
 * provenance, or transcript binding without invalidating the signature.
 */
export async function verifyLiveInterviewReviewArtifact(
  sessionId: string,
  transcript: HistorianTranscriptEntry[],
  raw: unknown,
  startupAttemptId?: string,
): Promise<LiveInterviewReviewArtifact> {
  const parsed = parseLiveInterviewReviewArtifact(raw, transcript)
  const unsigned: UnsignedLiveInterviewReviewArtifact = parsed.review.version === 2
    ? { review: parsed.review, provenance: parsed.provenance as Extract<LiveInterviewReviewArtifact, { review: { version: 2 } }>['provenance'] }
    : { review: parsed.review, provenance: parsed.provenance as Extract<LiveInterviewReviewArtifact, { review: { version: 1 } }>['provenance'] }
  const valid = await verifyHistorianServerPayload(
    ATTESTATION_PURPOSE,
    canonicalAttestationPayload(sessionId, transcript, unsigned, startupAttemptId),
    parsed.attestation,
  )
  if (!valid) throw new Error('Live review attestation does not match this session and transcript.')
  return parsed
}
