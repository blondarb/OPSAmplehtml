import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LongPacketModelPipelineResult } from '@/lib/triage/longPacketModelPipeline'
import type { SentinelCase } from '@/lib/triage/sentinel/types'

const { pipelineMock, scorerMock, adjudicatorMock } = vi.hoisted(() => ({ pipelineMock: vi.fn(), scorerMock: vi.fn(), adjudicatorMock: vi.fn() }))
vi.mock('@/lib/triage/longPacketModelPipeline', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/triage/longPacketModelPipeline')>(), runLongPacketModelPipeline: pipelineMock,
}))
vi.mock('@/lib/triage/runTriage', () => ({ runTriage: scorerMock }))
vi.mock('@/lib/triage/modelAdjudicator', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/triage/modelAdjudicator')>(), runTriageAdjudicator: adjudicatorMock,
}))

import { LONG_PACKET_FACT_CATEGORIES } from '@/lib/triage/longPacketClinicalMapper'
import { planLongPacketChunks } from '@/lib/triage/longPacketPlanner'
import { scanLongPacketEmergency } from '@/lib/triage/longPacketEmergency'
import { buildLongPacketAdjudicationText, longPacketPipelineToPersistedClinicalExtraction, safetyArtifactsFromValidatedPipeline } from '@/lib/triage/longPacketIngestion'
import { runLiveSentinelCase } from '@/lib/triage/sentinel/liveRunner'

const coverage = { status: 'complete' as const, expectedChunkCount: 1, receivedOutcomeCount: 1, acceptedChunkCount: 1, completedChunkCount: 1, partialChunkCount: 0, failedChunkCount: 0, missingChunkCount: 0, duplicateChunkCount: 0, unexpectedChunkCount: 0, tamperedChunkCount: 0 }
const pipeline: LongPacketModelPipelineResult = {
  version: 'neurology-long-packet-model-pipeline-v1', status: 'completed', coverageStatus: 'complete', clinicianHold: false,
  carePathway: 'routine_outpatient', reviewRequirement: 'clinician_confirmation', schedulingLocked: true,
  mapperCoverage: coverage, safetyCoverage: coverage, mapperOutcomes: [], safetyOutcomes: [],
  factsByCategory: Object.fromEntries(LONG_PACKET_FACT_CATEGORIES.map(category => [category, []])) as LongPacketModelPipelineResult['factsByCategory'],
  conflicts: [], criticalUnknowns: [], safetySignals: [], requiredSafetyEvidenceIds: [], narrativeSafetyManifestId: null,
  narrative: { narrative: 'Synthetic clinical summary.', timelineNarrative: 'Synthetic source timeline retained.', medicationNarrative: '', testNarrative: '', functionalNarrative: 'Synthetic function retained.', conflictNarrative: '', preservedSafetyEvidenceIds: [] }, failureCodes: [],
}
const sourceText = 'Document date: 2026-09-05\nSudden aphasia and right arm weakness started 30 minutes ago.\n' + 'Synthetic unrelated history. '.repeat(150) + 'RAW_ONLY_TRAILING_MARKER'
const document = { packetId: 'synthetic-packet', expectedDocumentCount: 1, documentId: 'synthetic-document', documentOrder: 1, expectedPageCount: 1, pages: [{ pageNumber: 1, text: sourceText, extractionMethod: 'native_text' as const, extractionConfidence: 1 }] }
const item: SentinelCase = {
  id: 'synthetic-packet-parity', title: 'Synthetic packet parity', synthetic: true, syndrome: 'acute_cerebrovascular', hardNegative: false,
  tags: [], executionModes: ['live_ensemble'], decisionAt: '2026-09-05T12:00:00Z', input: { kind: 'packet', packetStyle: 'standard', documents: [document] },
  expected: { clinicalClass: 'time_critical', pathway: 'emergency_now', acceptablePathways: [], requiredSyndromes: ['acute_cerebrovascular'] },
}

beforeEach(() => {
  vi.clearAllMocks()
  pipelineMock.mockResolvedValue(pipeline)
  scorerMock.mockResolvedValue({ emergent_override: false, insufficient_data: false, redirect_to_non_neuro: false, triage_tier: 'routine', weighted_score: 2, dimension_scores: {}, suggested_workup: [], subspecialty_recommendation: 'General Neurology', redirect_specialty: null })
  adjudicatorMock.mockResolvedValue({ carePathway: 'emergency_now', rationale: 'Synthetic safety floor retained.', evidence: [], unresolvedConflicts: [] })
})

describe('default sentinel packet dependency production parity without cloud calls', () => {
  it('shares the complete production projection between scoring/adjudication, preserves evidence, and reserves raw text for chronology', async () => {
    const plan = planLongPacketChunks([document])
    const gateway = scanLongPacketEmergency(plan)
    const artifacts = safetyArtifactsFromValidatedPipeline({ pages: document.pages.map(page => ({ ...page, documentId: document.documentId })), gateway, pipeline })
    const clinical = longPacketPipelineToPersistedClinicalExtraction({ pipeline, deterministicGateway: gateway })
    const expectedSource = buildLongPacketAdjudicationText({ extractedSummary: clinical.extractedSummary, safetyArtifacts: artifacts })
    const outcome = await runLiveSentinelCase(item, { live: true, branches: ['safety', 'scoring', 'adjudicator'] })
    expect(pipelineMock).toHaveBeenCalledOnce()
    expect(scorerMock).toHaveBeenCalledOnce()
    expect(adjudicatorMock).toHaveBeenCalledOnce()
    expect(scorerMock.mock.calls[0][0].referral_text).toBe(expectedSource)
    expect(adjudicatorMock.mock.calls[0][0]).toBe(expectedSource)
    expect(expectedSource).toContain('Sudden aphasia and right arm weakness')
    expect(expectedSource).toContain('Synthetic source timeline retained.')
    expect(expectedSource).toContain('Synthetic function retained.')
    expect(expectedSource).not.toContain('RAW_ONLY_TRAILING_MARKER')
    expect(expectedSource.length).toBeLessThanOrEqual(40_000)
    expect(scorerMock.mock.calls[0][0].chronologySourceText).toContain('RAW_ONLY_TRAILING_MARKER')
    expect(scorerMock.mock.calls[0][0].decisionAt).toBe(item.decisionAt)
    expect(outcome.actualPathway).toBe('emergency_now')
  })
})
