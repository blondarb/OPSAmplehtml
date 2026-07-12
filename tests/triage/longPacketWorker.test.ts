import { describe, expect, it } from 'vitest'

import type { PersistableEmergencyGatewayResult } from '@/lib/triage/gatewayPersistence'
import {
  LONG_PACKET_MODEL_PIPELINE_VERSION,
  type LongPacketModelPipelineResult,
} from '@/lib/triage/longPacketModelPipeline'
import { buildFinalizedExtractionPersistence } from '@/workers/triageLongPacketWorker'

function packetEmergency(): PersistableEmergencyGatewayResult {
  return {
    status: 'completed',
    failureCode: null,
    carePathway: 'emergency_now',
    reviewRequirement: 'emergency_action',
    schedulingLocked: true,
    version: 'neurology-long-packet-emergency-map-reduce-v3',
    lexicalHits: [],
    signals: [
      {
        code: 'NEURO_EMERGENCY_ACUTE_CEREBROVASCULAR',
        syndrome: 'acute_cerebrovascular',
        source: 'deterministic',
        action: 'emergency_now',
        assertion: 'present',
        temporality: 'current',
        experiencer: 'patient',
        evidence: [
          {
            packetId: 'packet-1',
            documentId: 'doc-1',
            pageNumber: 8,
            startOffset: 0,
            endOffset: 14,
            quote: 'sudden weakness',
            extractionMethod: 'native_text',
            extractionConfidence: 1,
          },
        ],
      },
    ],
  }
}

function pipeline(
  status: LongPacketModelPipelineResult['status'] = 'completed',
  coverageStatus: LongPacketModelPipelineResult['coverageStatus'] = 'complete',
): LongPacketModelPipelineResult {
  return {
    version: LONG_PACKET_MODEL_PIPELINE_VERSION,
    status,
    coverageStatus,
    clinicianHold: status !== 'completed',
    carePathway: status === 'completed' ? 'routine_outpatient' : 'undetermined',
    reviewRequirement:
      status === 'completed'
        ? 'clinician_confirmation'
        : 'immediate_clinician_review',
    schedulingLocked: true,
    mapperCoverage: {
      status: coverageStatus === 'complete' ? 'complete' : 'failed',
      expectedChunkCount: 1,
      receivedOutcomeCount: 1,
      acceptedChunkCount: coverageStatus === 'complete' ? 1 : 0,
      completedChunkCount: coverageStatus === 'complete' ? 1 : 0,
      partialChunkCount: 0,
      failedChunkCount: coverageStatus === 'complete' ? 0 : 1,
      missingChunkCount: 0,
      duplicateChunkCount: 0,
      unexpectedChunkCount: 0,
      tamperedChunkCount: 0,
    },
    safetyCoverage: {
      status: coverageStatus === 'complete' ? 'complete' : 'failed',
      expectedChunkCount: 1,
      receivedOutcomeCount: 1,
      acceptedChunkCount: coverageStatus === 'complete' ? 1 : 0,
      completedChunkCount: coverageStatus === 'complete' ? 1 : 0,
      partialChunkCount: 0,
      failedChunkCount: coverageStatus === 'complete' ? 0 : 1,
      missingChunkCount: 0,
      duplicateChunkCount: 0,
      unexpectedChunkCount: 0,
      tamperedChunkCount: 0,
    },
    mapperOutcomes: [],
    safetyOutcomes: [],
    factsByCategory: {
      chief_complaint: [],
      neurologic_symptom: [],
      timeline_event: [],
      medication: [],
      failed_therapy: [],
      test_result: [],
      functional_finding: [],
      red_flag: [],
      critical_unknown: [],
      relevant_history: [],
    },
    conflicts: [],
    criticalUnknowns: [],
    safetySignals: [],
    requiredSafetyEvidenceIds: [],
    narrativeSafetyManifestId: null,
    narrative:
      status === 'completed'
        ? {
            narrative: 'Synthetic complete-packet narrative.',
            timelineNarrative: '',
            medicationNarrative: '',
            testNarrative: '',
            functionalNarrative: '',
            conflictNarrative: '',
            preservedSafetyEvidenceIds: [],
          }
        : null,
    failureCodes: status === 'completed' ? [] : ['clinical_mapper_chunk_failed'],
  }
}

describe('durable worker extraction finalization', () => {
  it('builds a complete extraction and retains deterministic safety evidence', () => {
    const result = buildFinalizedExtractionPersistence({
      pipeline: pipeline(),
      packetEmergencyResult: packetEmergency(),
      safetyPromptVersions: { planner: 'planner-v1' },
      safetyScreenedAt: new Date('2026-07-11T12:00:00.000Z'),
    })

    expect(result).toMatchObject({
      outcome: 'success',
      extractionConfidence: 'high',
      safetyPromptVersions: { planner: 'planner-v1' },
      keyFindings: {
        red_flags_noted: ['sudden weakness'],
      },
    })
    expect(result.outcome === 'success' && result.extractedSummary).toContain(
      'Complete-source safety evidence: sudden weakness',
    )
  })

  it('returns only a fail-closed error persistence shape for incomplete coverage', () => {
    const result = buildFinalizedExtractionPersistence({
      pipeline: pipeline('failed', 'failed'),
      packetEmergencyResult: packetEmergency(),
      safetyPromptVersions: { planner: 'planner-v1' },
      safetyScreenedAt: new Date('2026-07-11T12:00:00.000Z'),
    })

    expect(result).toEqual({
      outcome: 'error',
      modelMapResult: expect.objectContaining({ status: 'failed' }),
      safetyPromptVersions: { planner: 'planner-v1' },
      safetyScreenedAt: new Date('2026-07-11T12:00:00.000Z'),
    })
    expect(result).not.toHaveProperty('extractedSummary')
    expect(result).not.toHaveProperty('keyFindings')
  })
})
