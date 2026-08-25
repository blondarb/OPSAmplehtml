import { afterEach, describe, expect, it } from 'vitest'

import { COMPREHENSIVE_HISTORY_DOMAINS, type HistorianTranscriptEntry } from '@/lib/historianTypes'
import {
  LIVE_INTERVIEW_REVIEW_PROMPT_VERSION,
  deriveLiveReviewStructuredCoverage,
  liveInterviewReviewCompletion,
  parseLiveInterviewReview,
  parseLiveInterviewReviewArtifact,
} from '@/lib/historian/liveReviewContract'
import {
  attestLiveInterviewReview,
  verifyLiveInterviewReviewArtifact,
} from '@/lib/historian/liveReviewAttestation'

const priorSigningSecret = process.env.HISTORIAN_FLUSH_SECRET

afterEach(() => {
  if (priorSigningSecret === undefined) delete process.env.HISTORIAN_FLUSH_SECRET
  else process.env.HISTORIAN_FLUSH_SECRET = priorSigningSecret
})

function transcript(): HistorianTranscriptEntry[] {
  return Array.from({ length: 12 }, (_, index) => [
    {
      seq: index * 2 + 1,
      role: 'assistant' as const,
      text: `Synthetic patient-specific history question ${index + 1}?`,
      timestamp: index * 2,
    },
    {
      seq: index * 2 + 2,
      role: 'user' as const,
      text: `Synthetic detailed patient-reported answer ${index + 1}.`,
      timestamp: index * 2 + 1,
    },
  ]).flat()
}

function rawReview() {
  const patientSeqs = transcript().filter((entry) => entry.role === 'user').map((entry) => entry.seq!)
  return {
    version: 1,
    reviewed_through_seq: 24,
    domains: COMPREHENSIVE_HISTORY_DOMAINS.map((domain, index) => ({
      domain: domain.id,
      status: 'covered',
      patient_seqs: [patientSeqs[index % patientSeqs.length]],
    })),
    critical_gaps: [],
    contradictions: [],
    repetitions: [],
    active_safety_concern: { present: false, patient_seqs: [] },
    ready_to_close: true,
    next_question_intents: [],
    confidence: 'high',
  }
}

describe('silent live Historian review contract', () => {
  it('allows closure only after every domain is cited through the latest patient turn', () => {
    const review = parseLiveInterviewReview(rawReview(), transcript())
    expect(review.readyToClose).toBe(true)
    expect(liveInterviewReviewCompletion(review)).toBe('coverage_complete')
    expect(deriveLiveReviewStructuredCoverage(review).missing_or_uncertain).toEqual([])
  })

  it('downgrades model-requested closure when a domain is still missing', () => {
    const raw = rawReview()
    raw.domains[0] = {
      ...raw.domains[0],
      status: 'missing',
      patient_seqs: [],
    }
    const review = parseLiveInterviewReview(raw, transcript())
    expect(review.readyToClose).toBe(false)
    expect(liveInterviewReviewCompletion(review)).toBe('incomplete')
  })

  it('preserves truthful uncertainty as a distinct completion outcome', () => {
    const raw = rawReview()
    raw.domains[3] = { ...raw.domains[3], status: 'uncertain' }
    const review = parseLiveInterviewReview(raw, transcript())
    expect(review.readyToClose).toBe(true)
    expect(liveInterviewReviewCompletion(review)).toBe('complete_with_uncertainty')
  })

  it('does not label unresolved transcript contradictions as clean coverage', () => {
    const raw: any = rawReview()
    raw.contradictions = [{
      patient_seqs: [2, 4],
      description: 'Synthetic answers conflict and remain unresolved.',
    }]
    const review = parseLiveInterviewReview(raw, transcript())
    expect(review.readyToClose).toBe(true)
    expect(liveInterviewReviewCompletion(review)).toBe('complete_with_uncertainty')
  })

  it('rejects assistant or nonexistent sequences as patient evidence', () => {
    const assistantCitation = rawReview()
    assistantCitation.domains[0] = { ...assistantCitation.domains[0], patient_seqs: [1] }
    expect(() => parseLiveInterviewReview(assistantCitation, transcript())).toThrow(/sequence/i)

    const stale = rawReview()
    stale.reviewed_through_seq = 22
    expect(() => parseLiveInterviewReview(stale, transcript())).toThrow(/latest patient/i)
  })

  it('requires the exact artifact schema and normalizes it at the browser boundary', () => {
    const review = parseLiveInterviewReview(rawReview(), transcript())
    const artifact = parseLiveInterviewReviewArtifact({
      review,
      provenance: {
        modelId: 'synthetic-independent-reviewer',
        promptVersion: LIVE_INTERVIEW_REVIEW_PROMPT_VERSION,
        generatedAt: '2026-08-25T12:00:00.000Z',
      },
      attestation: 'a'.repeat(43),
    }, transcript())
    expect(artifact.review.reviewedThroughSeq).toBe(24)
    expect(artifact.attestation).toHaveLength(43)
    expect(() => parseLiveInterviewReviewArtifact({ ...artifact, extra: true }, transcript()))
      .toThrow(/schema/i)
  })

  it('binds reviewer closure to the exact session and transcript with a server-only attestation', async () => {
    process.env.HISTORIAN_FLUSH_SECRET = 'synthetic-live-review-signing-secret'
    const review = parseLiveInterviewReview(rawReview(), transcript())
    const unsigned = {
      review,
      provenance: {
        modelId: 'synthetic-independent-reviewer',
        promptVersion: LIVE_INTERVIEW_REVIEW_PROMPT_VERSION,
        generatedAt: '2026-08-25T12:00:00.000Z',
      },
    }
    const attested = await attestLiveInterviewReview('synthetic-session', transcript(), unsigned)
    await expect(verifyLiveInterviewReviewArtifact(
      'synthetic-session',
      transcript(),
      attested,
    )).resolves.toEqual(attested)

    const tampered = structuredClone(attested)
    tampered.review.readyToClose = false
    await expect(verifyLiveInterviewReviewArtifact(
      'synthetic-session',
      transcript(),
      tampered,
    )).rejects.toThrow(/attestation/i)
    await expect(verifyLiveInterviewReviewArtifact(
      'different-session',
      transcript(),
      attested,
    )).rejects.toThrow(/attestation/i)
  })
})
