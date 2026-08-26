import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQSEvent } from 'aws-lambda'

const {
  generateFinalDifferentialMock,
  generateClinicianHistoryReportMock,
  runThoroughnessJudgeMock,
  runIndependentMock,
} = vi.hoisted(() => ({
  generateFinalDifferentialMock: vi.fn(),
  generateClinicianHistoryReportMock: vi.fn(),
  runThoroughnessJudgeMock: vi.fn(),
  runIndependentMock: vi.fn(),
}))

vi.mock('@/lib/historian/eval/finalDifferential', () => ({
  generateFinalDifferential: generateFinalDifferentialMock,
}))
vi.mock('@/lib/historian/eval/clinicianHistoryReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/historian/eval/clinicianHistoryReport')>()),
  generateClinicianHistoryReport: generateClinicianHistoryReportMock,
}))
vi.mock('@/lib/historian/eval/thoroughnessJudge', () => ({
  runThoroughnessJudge: runThoroughnessJudgeMock,
}))
vi.mock('@/lib/historian/eval/independentDdx', () => ({
  runIndependentDdxAndAgreement: runIndependentMock,
}))

import { processHistorianEvalEvent } from '@/workers/historianEvalWorker'
import { COMPREHENSIVE_HISTORY_DOMAINS } from '@/lib/historianTypes'
import {
  LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION,
  LIVE_REVIEW_DEPTH_DIMENSIONS,
} from '@/lib/historian/liveReviewContract'
import { createMedicationReconciliationState } from '@/lib/historian/medicationReconciliation'
import { MEDICATION_INVENTORY_QUESTION } from '@/lib/historian/medicationReconciliation'
import { ADAPTIVE_PRE_CLOSE_QUESTION } from '@/lib/historian/adaptiveQuestionContract'
import { buildDiagnosticInputProjection } from '@/lib/historian/eval/diagnosticInput'
import { deriveDiagnosticSufficiency } from '@/lib/historian/diagnosticSufficiency'

const jobId = '11111111-1111-4111-8111-111111111111'
const event = (body: string): SQSEvent => ({
  Records: [{ messageId: 'message-1', body }] as SQSEvent['Records'],
})

function completeTranscript() {
  return Array.from({ length: 12 }, (_, index) => [
    {
      role: 'assistant' as const,
      text: index === 10
        ? MEDICATION_INVENTORY_QUESTION
        : index === 11
          ? ADAPTIVE_PRE_CLOSE_QUESTION
          : `Question ${index + 1}?`,
      timestamp: index * 2,
      seq: index * 2 + 1,
    },
    {
      role: 'user' as const,
      text: index === 10
        ? 'No other medicines.'
        : index === 11
          ? 'No, that covers it.'
          : `Detailed synthetic answer ${index + 1}.`,
      timestamp: index * 2 + 1,
      seq: index * 2 + 2,
    },
  ]).flat()
}

function v2ReviewArtifact() {
  return {
    review: {
      version: 2,
      reviewedThroughSeq: 24,
      patientTurnCount: 12,
      integrity: 'valid',
      domains: COMPREHENSIVE_HISTORY_DOMAINS.map((domain, index) => ({
        domain: domain.id,
        status: 'covered',
        patientSeqs: [2 + (index % 12) * 2],
      })),
      criticalGaps: [],
      contradictions: [],
      repetitions: [],
      medications: [],
      activeSafetyConcern: { present: false, patientSeqs: [] },
      diagnosticDepth: {
        dimensions: LIVE_REVIEW_DEPTH_DIMENSIONS.map((dimension, index) => ({
          dimension,
          status: 'adequate',
          patientSeqs: [2 + (index % 12) * 2],
        })),
        depthSufficient: true,
      },
      readyToClose: true,
      nextQuestionIntents: [],
      confidence: 'high',
    },
    provenance: {
      modelId: 'synthetic-reviewer',
      promptVersion: LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION,
      generatedAt: '2026-08-25T12:00:00.000Z',
    },
    attestation: 'a'.repeat(43),
  }
}

function completeClaim() {
  const medication = createMedicationReconciliationState()
  medication.inventoryStatus = 'answered'
  medication.inventoryPatientSeq = 22
  return {
    jobId,
    sessionId: '22222222-2222-4222-8222-222222222222',
    tenantId: 'tenant-a',
    leaseToken: '33333333-3333-4333-8333-333333333333',
    attemptCount: 1,
    pipelineVersion: 2,
    currentStage: 'report_pending',
    transcript: completeTranscript(),
    chiefComplaint: 'Gait concern',
    structuredOutput: {
      interview_prompt_version: 'comprehensive-v4' as const,
      live_review_v2: v2ReviewArtifact(),
      medication_reconciliation_v1: medication,
    },
    narrativeSummary: undefined,
    promptVersion: 'comprehensive-v4' as const,
    completionStatus: 'complete' as const,
    terminationReason: 'coverage_complete' as const,
    diagnosticSufficiency: null,
    clinicianHistoryReport: null,
    finalDifferential: null,
  }
}

function mockReport() {
  return {
    version: 1,
    report_status: 'complete',
    input_digest: 'b'.repeat(64),
    sections: [],
    medication_reconciliation: createMedicationReconciliationState(),
    limitations: [],
    completion: { termination_reason: 'coverage_complete', patient_turn_count: 12, reviewed_through_seq: 24 },
    provenance: {},
  }
}

function reverseObjectKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeyOrder)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .reverse()
      .map(([key, nested]) => [key, reverseObjectKeyOrder(nested)]),
  )
}

describe('durable historian evaluation worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.HISTORIAN_EVAL_QA_AUTORUN
    generateClinicianHistoryReportMock.mockResolvedValue(mockReport())
  })

  it('persists sufficiency and report before the allowed differential, then completes', async () => {
    const claim = completeClaim()
    const order: string[] = []
    const service = {
      claim: vi.fn(async () => claim),
      persistDiagnosticSufficiency: vi.fn(async () => { order.push('sufficiency') }),
      persistClinicianHistoryReport: vi.fn(async () => { order.push('report') }),
      persistFinalDifferential: vi.fn(async () => { order.push('ddx') }),
      complete: vi.fn(async () => { order.push('complete') }),
      fail: vi.fn(),
    }
    generateFinalDifferentialMock.mockResolvedValueOnce({
      status: 'ok', differential: [], summary: 'Synthetic', provenance: {}, dropped_quotes: 0,
    })

    const result = await processHistorianEvalEvent(
      event(JSON.stringify({ v: 1, kind: 'historian_eval', job_id: jobId })),
      service as never,
    )
    expect(result.batchItemFailures).toEqual([])
    expect(order).toEqual(['sufficiency', 'report', 'ddx', 'complete'])
    const diagnosticProjection = buildDiagnosticInputProjection(
      claim.transcript,
      claim.structuredOutput.medication_reconciliation_v1,
    )
    expect(generateFinalDifferentialMock).toHaveBeenCalledWith(
      diagnosticProjection.transcript,
      claim.chiefComplaint,
      diagnosticProjection.trustedMedicationContext,
    )
    expect(runThoroughnessJudgeMock).toHaveBeenCalledTimes(1)
    expect(runIndependentMock).toHaveBeenCalledTimes(1)
    expect(runIndependentMock).toHaveBeenCalledWith(
      claim.sessionId,
      diagnosticProjection.transcript,
      claim.chiefComplaint,
      expect.stringMatching(/^[0-9a-f]{64}$/),
      diagnosticProjection.trustedMedicationContext,
    )
    expect(service.fail).not.toHaveBeenCalled()
  })

  it('accepts equivalent persisted sufficiency after a JSONB key-order round trip', async () => {
    process.env.HISTORIAN_EVAL_QA_AUTORUN = 'false'
    const claim = completeClaim()
    const persisted = deriveDiagnosticSufficiency({
      transcript: claim.transcript,
      promptVersion: claim.promptVersion,
      completionStatus: claim.completionStatus,
      terminationReason: claim.terminationReason,
      reviewArtifact: claim.structuredOutput.live_review_v2,
      medicationState: claim.structuredOutput.medication_reconciliation_v1,
      generatedAt: new Date('2026-08-25T12:30:00.000Z'),
    })
    claim.diagnosticSufficiency = reverseObjectKeyOrder(persisted) as typeof persisted

    const service = {
      claim: vi.fn(async () => claim),
      persistDiagnosticSufficiency: vi.fn(),
      persistClinicianHistoryReport: vi.fn(),
      persistFinalDifferential: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    }
    generateFinalDifferentialMock.mockResolvedValueOnce({
      status: 'ok', differential: [], summary: 'Synthetic', provenance: {}, dropped_quotes: 0,
    })

    const result = await processHistorianEvalEvent(
      event(JSON.stringify({ v: 1, kind: 'historian_eval', job_id: jobId })),
      service as never,
    )

    expect(result.batchItemFailures).toEqual([])
    expect(service.persistDiagnosticSufficiency).not.toHaveBeenCalled()
    expect(service.persistClinicianHistoryReport).toHaveBeenCalledTimes(1)
    expect(service.persistFinalDifferential).toHaveBeenCalledTimes(1)
    expect(service.complete).toHaveBeenCalledWith(claim)
    expect(service.fail).not.toHaveBeenCalled()
  })

  it('still rejects a persisted sufficiency value that differs from the session evidence', async () => {
    process.env.HISTORIAN_EVAL_QA_AUTORUN = 'false'
    const claim = completeClaim()
    const persisted = deriveDiagnosticSufficiency({
      transcript: claim.transcript,
      promptVersion: claim.promptVersion,
      completionStatus: claim.completionStatus,
      terminationReason: claim.terminationReason,
      reviewArtifact: claim.structuredOutput.live_review_v2,
      medicationState: claim.structuredOutput.medication_reconciliation_v1,
      generatedAt: new Date('2026-08-25T12:30:00.000Z'),
    })
    claim.diagnosticSufficiency = {
      ...persisted,
      patient_turn_count: persisted.patient_turn_count + 1,
    }

    const service = {
      claim: vi.fn(async () => claim),
      persistDiagnosticSufficiency: vi.fn(),
      persistClinicianHistoryReport: vi.fn(),
      persistFinalDifferential: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(async () => undefined),
    }

    const result = await processHistorianEvalEvent(
      event(JSON.stringify({ v: 1, kind: 'historian_eval', job_id: jobId })),
      service as never,
    )

    expect(result.batchItemFailures).toEqual([])
    expect(service.fail).toHaveBeenCalledWith(claim, 'HistorianEvaluationIntegrityError')
    expect(service.persistClinicianHistoryReport).not.toHaveBeenCalled()
    expect(service.persistFinalDifferential).not.toHaveBeenCalled()
    expect(service.complete).not.toHaveBeenCalled()
  })

  it('preserves the legacy pipeline for a migration-era version-1 job', async () => {
    process.env.HISTORIAN_EVAL_QA_AUTORUN = 'false'
    const claim = {
      ...completeClaim(),
      pipelineVersion: 1,
      currentStage: 'legacy',
      promptVersion: 'comprehensive-v3' as const,
      diagnosticSufficiency: null,
      clinicianHistoryReport: null,
      finalDifferential: null,
    }
    const legacyDifferential = {
      status: 'ok', differential: [], summary: 'Legacy result', provenance: {}, dropped_quotes: 0,
    }
    generateFinalDifferentialMock.mockResolvedValueOnce(legacyDifferential)
    const service = {
      claim: vi.fn(async () => claim),
      persistDiagnosticSufficiency: vi.fn(),
      persistClinicianHistoryReport: vi.fn(),
      persistFinalDifferential: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    }

    const result = await processHistorianEvalEvent(
      event(JSON.stringify({ v: 1, kind: 'historian_eval', job_id: jobId })),
      service as never,
    )

    expect(result.batchItemFailures).toEqual([])
    expect(generateFinalDifferentialMock).toHaveBeenCalledWith(
      claim.transcript,
      claim.chiefComplaint,
    )
    expect(service.persistFinalDifferential).toHaveBeenCalledWith(claim, legacyDifferential)
    expect(service.persistDiagnosticSufficiency).not.toHaveBeenCalled()
    expect(service.persistClinicianHistoryReport).not.toHaveBeenCalled()
    expect(service.complete).toHaveBeenCalledWith(claim)
    expect(service.fail).not.toHaveBeenCalled()
  })

  it('generates a partial report but withholds every DDx model for an interrupted interview', async () => {
    const base = completeClaim()
    const claim = {
      ...base,
      transcript: base.transcript.slice(0, 6),
      promptVersion: 'comprehensive-v3' as const,
      completionStatus: 'ended_early' as const,
      terminationReason: 'transport_lost' as const,
      structuredOutput: { interview_prompt_version: 'comprehensive-v3' as const },
    }
    const service = {
      claim: vi.fn(async () => claim),
      persistDiagnosticSufficiency: vi.fn(),
      persistClinicianHistoryReport: vi.fn(),
      persistFinalDifferential: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    }
    const result = await processHistorianEvalEvent(
      event(JSON.stringify({ v: 1, kind: 'historian_eval', job_id: jobId })),
      service as never,
    )
    expect(result.batchItemFailures).toEqual([])
    expect(generateClinicianHistoryReportMock).toHaveBeenCalledTimes(1)
    expect(generateFinalDifferentialMock).not.toHaveBeenCalled()
    expect(runThoroughnessJudgeMock).not.toHaveBeenCalled()
    expect(runIndependentMock).not.toHaveBeenCalled()
    expect(service.persistFinalDifferential).toHaveBeenCalledWith(
      claim,
      expect.objectContaining({ status: 'withheld_partial' }),
      expect.objectContaining({ withheld: true }),
    )
    expect(service.complete).toHaveBeenCalledTimes(1)
  })

  it('persists a retry decision when required differential generation fails', async () => {
    const claim = completeClaim()
    const service = {
      claim: vi.fn(async () => claim),
      persistDiagnosticSufficiency: vi.fn(),
      persistClinicianHistoryReport: vi.fn(),
      persistFinalDifferential: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(async () => undefined),
    }
    generateFinalDifferentialMock.mockRejectedValueOnce(
      Object.assign(new Error('provider unavailable'), { name: 'ProviderError' }),
    )

    const result = await processHistorianEvalEvent(
      event(JSON.stringify({ v: 1, kind: 'historian_eval', job_id: jobId })),
      service as never,
    )
    expect(result.batchItemFailures).toEqual([])
    expect(service.fail).toHaveBeenCalledWith(claim, 'ProviderError')
    expect(service.complete).not.toHaveBeenCalled()
  })

  it('acknowledges duplicate delivery when the database says no work is claimable', async () => {
    const service = {
      claim: vi.fn(async () => null),
      persistFinalDifferential: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    }
    const result = await processHistorianEvalEvent(
      event(JSON.stringify({ v: 1, kind: 'historian_eval', job_id: jobId })),
      service as never,
    )
    expect(result.batchItemFailures).toEqual([])
    expect(generateFinalDifferentialMock).not.toHaveBeenCalled()
  })
})
