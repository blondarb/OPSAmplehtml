import type { HistorianTranscriptEntry } from '@/lib/historianTypes'
import {
  signHistorianServerPayload,
  verifyHistorianServerPayload,
} from './flushToken'
import {
  parseLiveInterviewReviewArtifact,
  type LiveInterviewReviewArtifactV1,
  type UnsignedLiveInterviewReviewArtifactV1,
} from './liveReviewContract'

const ATTESTATION_PURPOSE = 'live-interview-review'

function canonicalAttestationPayload(
  sessionId: string,
  transcript: HistorianTranscriptEntry[],
  artifact: UnsignedLiveInterviewReviewArtifactV1,
  startupAttemptId?: string,
): string {
  return JSON.stringify({
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
  })
}

export async function attestLiveInterviewReview(
  sessionId: string,
  transcript: HistorianTranscriptEntry[],
  artifact: UnsignedLiveInterviewReviewArtifactV1,
  startupAttemptId?: string,
): Promise<LiveInterviewReviewArtifactV1> {
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
): Promise<LiveInterviewReviewArtifactV1> {
  const parsed = parseLiveInterviewReviewArtifact(raw, transcript)
  const unsigned: UnsignedLiveInterviewReviewArtifactV1 = {
    review: parsed.review,
    provenance: parsed.provenance,
  }
  const valid = await verifyHistorianServerPayload(
    ATTESTATION_PURPOSE,
    canonicalAttestationPayload(sessionId, transcript, unsigned, startupAttemptId),
    parsed.attestation,
  )
  if (!valid) throw new Error('Live review attestation does not match this session and transcript.')
  return parsed
}
