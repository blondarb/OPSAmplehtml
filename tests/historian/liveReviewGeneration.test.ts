import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  COMPREHENSIVE_HISTORY_DOMAINS,
  type HistorianTranscriptEntry,
} from '@/lib/historianTypes'

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/historian/eval/bedrockMeta', () => ({
  invokeBedrockClinicalToolWithMeta: invokeMock,
}))

import { generateLiveInterviewReview } from '@/lib/historian/liveReview'
import {
  liveInterviewReviewCompletion,
  LIVE_REVIEW_DEPTH_DIMENSIONS,
  parseLiveInterviewReviewArtifact,
} from '@/lib/historian/liveReviewContract'

function transcript(): HistorianTranscriptEntry[] {
  return Array.from({ length: 12 }, (_, index) => [
    { seq: index * 2 + 1, role: 'assistant' as const, text: `Question ${index + 1}?`, timestamp: index * 2 },
    { seq: index * 2 + 2, role: 'user' as const, text: `Synthetic answer ${index + 1}.`, timestamp: index * 2 + 1 },
  ]).flat()
}

function reviewWithOneGap() {
  const patientSeqs = transcript().filter((entry) => entry.role === 'user').map((entry) => entry.seq!)
  return {
    version: 2,
    reviewed_through_seq: patientSeqs.at(-1),
    domains: COMPREHENSIVE_HISTORY_DOMAINS.map((domain, index) => ({
      domain: domain.id,
      status: index === 0 ? 'uncertain' : 'covered',
      patient_seqs: [patientSeqs[index % patientSeqs.length]],
    })),
    critical_gaps: [{
      domain: 'referral_reason',
      depth_dimension: 'chief_problem_and_goal',
      basis: 'partial_answer',
      patient_seqs: [2],
      reason: 'The patient supplied only a partial answer.',
      question_intent: 'Clarify the patient goal once.',
    }],
    contradictions: [],
    repetitions: [],
    medications: [],
    active_safety_concern: { present: false, patient_seqs: [] },
    diagnostic_depth: {
      dimensions: LIVE_REVIEW_DEPTH_DIMENSIONS.map((dimension, index) => ({
        dimension,
        status: index === 0 ? 'uncertain' : 'adequate',
        patient_seqs: [patientSeqs[index % patientSeqs.length]],
      })),
      depth_sufficient: false,
    },
    ready_to_close: false,
    next_question_intents: ['Clarify the patient goal once.'],
    confidence: 'high',
  }
}

describe('coherent V2 live review generation', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('retries one invalid model payload and returns a fail-closed attested-compatible fallback', async () => {
    invokeMock.mockResolvedValue({ result: {}, modelId: 'synthetic-reviewer' })

    const generated = await generateLiveInterviewReview(transcript(), { diagnosticDepth: true })

    expect(invokeMock).toHaveBeenCalledTimes(2)
    expect(invokeMock.mock.calls[1][0].system).toContain('LIVE_REVIEW_CONTRACT_INVALID')
    expect(generated.review).toMatchObject({
      version: 2,
      integrity: 'inconsistent',
      patientTurnCount: 12,
      readyToClose: false,
      diagnosticDepth: { depthSufficient: false },
      nextQuestionIntents: [],
    })
    expect(generated.review.domains.every((item) => (
      item.status === 'missing' && item.patientSeqs.length === 0
    ))).toBe(true)

    const normalized = parseLiveInterviewReviewArtifact({
      ...generated,
      attestation: 'a'.repeat(43),
    }, transcript())
    expect(normalized.review).toMatchObject({ integrity: 'inconsistent', readyToClose: false })
    expect(liveInterviewReviewCompletion(normalized.review)).toBe('complete_with_uncertainty')
  })

  it('does not repeat a reviewer gap after its one patient clarification', async () => {
    invokeMock.mockResolvedValue({ result: reviewWithOneGap(), modelId: 'synthetic-reviewer' })

    const generated = await generateLiveInterviewReview(transcript(), {
      diagnosticDepth: true,
      exhaustedGapKeys: ['referral_reason:chief_problem_and_goal'],
    })

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(generated.review).toMatchObject({
      version: 2,
      integrity: 'clarification_exhausted',
      readyToClose: false,
      criticalGaps: [{ questionIntent: 'Clarify the patient goal once.' }],
    })
    expect(liveInterviewReviewCompletion(generated.review)).toBe('complete_with_uncertainty')
  })
})
