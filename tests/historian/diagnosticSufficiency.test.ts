import { describe, expect, it } from 'vitest'

import { COMPREHENSIVE_HISTORY_DOMAINS, type HistorianTranscriptEntry } from '@/lib/historianTypes'
import {
  LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION,
  LIVE_REVIEW_DEPTH_DIMENSIONS,
  parseLiveInterviewReviewV2,
  type LiveInterviewReviewArtifactV2,
} from '@/lib/historian/liveReviewContract'
import { createMedicationReconciliationState } from '@/lib/historian/medicationReconciliation'
import {
  buildWithheldFinalDifferential,
  deriveDiagnosticSufficiency,
  diagnosticSufficiencyAllowsDdx,
} from '@/lib/historian/diagnosticSufficiency'

function transcript(): HistorianTranscriptEntry[] {
  return Array.from({ length: 12 }, (_, index) => [
    { role: 'assistant' as const, text: `Synthetic question ${index + 1}?`, timestamp: index * 2, seq: index * 2 + 1 },
    { role: 'user' as const, text: `Synthetic case-specific answer ${index + 1}.`, timestamp: index * 2 + 1, seq: index * 2 + 2 },
  ]).flat()
}

function artifact(): LiveInterviewReviewArtifactV2 {
  const review = parseLiveInterviewReviewV2({
    version: 2,
    reviewed_through_seq: 24,
    domains: COMPREHENSIVE_HISTORY_DOMAINS.map((domain, index) => ({
      domain: domain.id,
      status: 'covered',
      patient_seqs: [2 + (index % 12) * 2],
    })),
    critical_gaps: [],
    contradictions: [],
    repetitions: [],
    medications: [],
    active_safety_concern: { present: false, patient_seqs: [] },
    diagnostic_depth: {
      dimensions: LIVE_REVIEW_DEPTH_DIMENSIONS.map((dimension, index) => ({
        dimension,
        status: 'adequate',
        patient_seqs: [2 + (index % 12) * 2],
      })),
      depth_sufficient: true,
    },
    ready_to_close: true,
    next_question_intents: [],
    confidence: 'high',
  }, transcript())
  return {
    review,
    provenance: {
      modelId: 'synthetic-reviewer',
      promptVersion: LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION,
      generatedAt: '2026-08-25T12:00:00.000Z',
    },
    attestation: 'a'.repeat(43),
  }
}

function closedMedication() {
  const state = createMedicationReconciliationState()
  state.inventoryStatus = 'answered'
  state.inventoryPatientSeq = 24
  return state
}

describe('server-derived diagnostic sufficiency', () => {
  it('allows DDx only for a current v4 depth review and closed medication ledger', () => {
    const result = deriveDiagnosticSufficiency({
      transcript: transcript(),
      promptVersion: 'comprehensive-v4',
      completionStatus: 'complete',
      terminationReason: 'coverage_complete',
      reviewArtifact: artifact(),
      medicationState: closedMedication(),
      generatedAt: new Date('2026-08-25T12:30:00.000Z'),
    })
    expect(result.outcome).toBe('sufficient')
    expect(result.ddx_allowed).toBe(true)
    expect(result.dimensions).toHaveLength(8)
    expect(result.input_digest).toMatch(/^[0-9a-f]{64}$/)
    expect(diagnosticSufficiencyAllowsDdx(result)).toBe(true)
  })

  it.each([
    ['transport_lost', 'insufficient_partial'],
    ['safety_escalated', 'insufficient_partial'],
    ['hard_stop', 'insufficient_partial'],
  ] as const)('withholds DDx for %s partial termination', (terminationReason, outcome) => {
    const result = deriveDiagnosticSufficiency({
      transcript: transcript().slice(0, 8),
      promptVersion: 'comprehensive-v4',
      completionStatus: 'ended_early',
      terminationReason,
      reviewArtifact: null,
      medicationState: null,
    })
    expect(result).toMatchObject({ outcome, ddx_allowed: false })
    expect(buildWithheldFinalDifferential(result).status).toBe('withheld_partial')
  })

  it('fails closed when a complete row lacks the v4 gate', () => {
    const result = deriveDiagnosticSufficiency({
      transcript: transcript(),
      promptVersion: 'comprehensive-v3',
      completionStatus: 'complete',
      terminationReason: 'coverage_complete',
      reviewArtifact: null,
      medicationState: closedMedication(),
    })
    expect(result).toMatchObject({ outcome: 'gate_unavailable', ddx_allowed: false })
    expect(buildWithheldFinalDifferential(result).status).toBe('withheld_gate_error')
  })

  it('withholds DDx when the twice-repaired reviewer remains inconsistent', () => {
    const reviewArtifact = artifact()
    reviewArtifact.review = {
      ...reviewArtifact.review,
      integrity: 'inconsistent',
      domains: reviewArtifact.review.domains.map((item) => ({
        ...item,
        status: 'missing',
        patientSeqs: [],
      })),
      criticalGaps: [],
      contradictions: [],
      repetitions: [],
      medications: [],
      activeSafetyConcern: { present: false, patientSeqs: [] },
      diagnosticDepth: {
        dimensions: reviewArtifact.review.diagnosticDepth.dimensions.map((item) => ({
          ...item,
          status: 'missing',
          patientSeqs: [],
        })),
        depthSufficient: false,
      },
      readyToClose: false,
      nextQuestionIntents: [],
      confidence: 'low',
    }
    const result = deriveDiagnosticSufficiency({
      transcript: transcript(),
      promptVersion: 'comprehensive-v4',
      completionStatus: 'complete',
      terminationReason: 'complete_with_uncertainty',
      reviewArtifact,
      medicationState: closedMedication(),
    })
    expect(result).toMatchObject({
      outcome: 'gate_unavailable',
      ddx_allowed: false,
      medication: { status: 'incomplete', unresolved_count: 1 },
    })
    expect(buildWithheldFinalDifferential(result).status).toBe('withheld_gate_error')
  })
})
