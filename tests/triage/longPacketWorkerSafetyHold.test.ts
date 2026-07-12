import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  escalationMock,
  partialHoldMock,
  completeChunkJobMock,
  completeFinalizationJobMock,
} = vi.hoisted(
  () => ({
    escalationMock: vi.fn(),
    partialHoldMock: vi.fn(),
    completeChunkJobMock: vi.fn(),
    completeFinalizationJobMock: vi.fn(),
  }),
)

vi.mock('@/lib/triage/longPacketSafetyEscalation', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/triage/longPacketSafetyEscalation')
  >()
  return { ...actual, persistLongPacketSafetyEscalation: escalationMock }
})

vi.mock('@/lib/triage/longPacketPartialSafetyHold', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/triage/longPacketPartialSafetyHold')
  >()
  return { ...actual, persistLongPacketPartialSafetyHold: partialHoldMock }
})

import { buildLongPacketIngestionArtifacts } from '@/lib/triage/longPacketIngestion'
import {
  LONG_PACKET_MODEL_PIPELINE_VERSION,
  LONG_PACKET_NARRATIVE_REDUCER_MODEL,
  LONG_PACKET_NARRATIVE_REDUCER_PROMPT_VERSION,
  runLongPacketModelPipeline,
  type LongPacketMapperBranchOutcome,
  type LongPacketSafetyBranchOutcome,
} from '@/lib/triage/longPacketModelPipeline'
import type { LongPacketChunk } from '@/lib/triage/longPacketPlanner'
import { validateModelSafetyExtraction } from '@/lib/triage/modelSafetyExtraction'
import { hashLongPacketPlan } from '@/lib/triage/longPacketCanonicalHash'
import {
  buildFinalizedExtractionPersistence,
  createRuntimeWorkerDependencies,
} from '@/workers/triageLongPacketWorker'
import { mergeLongPacketPartialSafetyHold } from '@/lib/triage/longPacketPartialSafetyHold'

function artifacts() {
  return buildLongPacketIngestionArtifacts({
    packetId: 'durable-partial-hold-packet',
    documentId: 'durable-partial-hold-document',
    text: 'Synthetic durable worker source detail. '.repeat(30),
    singlePassCharacterLimit: 50,
  })
}

function emptyMap(chunk: LongPacketChunk) {
  return {
    chunkId: chunk.id,
    chunkProvenanceSha256: chunk.provenanceSha256,
    sourceCharacterCount: chunk.text.length,
    coverageStatus: 'complete' as const,
    facts: [],
    conflicts: [],
  }
}

async function safetyOutcome(
  carePathway: 'emergency_now' | 'same_day_clinician_review',
) {
  const packet = artifacts()
  let captured: LongPacketSafetyBranchOutcome | undefined
  const pipeline = await runLongPacketModelPipeline(packet.plan, {
    mapChunk: async (chunk) => emptyMap(chunk),
    extractSafety: async (chunk) => {
      const quote = chunk.text.slice(0, 40)
      return validateModelSafetyExtraction(
        {
          care_pathway: carePathway,
          data_quality: 'sufficient',
          critical_unknowns: [],
          signals: [
            {
              code:
                carePathway === 'emergency_now'
                  ? 'durable_emergency'
                  : 'durable_same_day',
              syndrome: 'other_time_critical',
              assertion:
                carePathway === 'emergency_now' ? 'present' : 'uncertain',
              temporality:
                carePathway === 'emergency_now' ? 'current' : 'unknown',
              experiencer: 'patient',
              action:
                carePathway === 'emergency_now'
                  ? 'emergency_now'
                  : 'immediate_clinician_review',
              evidence: [{ quote, occurrence_index: 0 }],
            },
          ],
        },
        chunk.text,
      )
    },
    onSafetyOutcome: async (outcome) => {
      captured ??= outcome
    },
    reduceNarrative: async (input) => ({
      narrative: 'Synthetic durable aggregate narrative.',
      timelineNarrative: '',
      medicationNarrative: '',
      testNarrative: '',
      functionalNarrative: '',
      conflictNarrative: '',
      preservedSafetyEvidenceIds: input.requiredSafetyEvidenceIds,
    }),
  })
  return { packet, outcome: captured!, pipeline }
}

async function mapperOutcome() {
  const packet = artifacts()
  let captured: LongPacketMapperBranchOutcome | undefined
  await runLongPacketModelPipeline(packet.plan, {
    mapChunk: async (chunk) => {
      const span = chunk.sourceSpans[0]
      const quote = chunk.text.slice(span.chunkStartOffset, span.chunkStartOffset + 30)
      return {
        ...emptyMap(chunk),
        facts: [
          {
            category: 'red_flag' as const,
            key: 'durable_mapper_red_flag',
            statement: 'Current durable mapper red flag.',
            assertion: 'present' as const,
            temporality: 'current' as const,
            eventDateText: null,
            evidence: [
              {
                packetId: chunk.packetId,
                documentId: chunk.documentId,
                pageNumber: span.pageNumber,
                startOffset: span.pageStartOffset,
                endOffset: span.pageStartOffset + quote.length,
                quote,
                extractionMethod: span.extractionMethod,
                extractionConfidence: span.extractionConfidence,
              },
            ],
          },
        ],
      }
    },
    extractSafety: async (chunk) =>
      validateModelSafetyExtraction(
        {
          care_pathway: 'no_time_critical_signal',
          data_quality: 'sufficient',
          critical_unknowns: [],
          signals: [],
        },
        chunk.text,
      ),
    onMapperOutcome: async (outcome) => {
      captured ??= outcome
    },
  })
  return { packet, outcome: captured! }
}

async function crossChunkSameDayPipeline(options?: {
  narrativeFailure?: boolean
}) {
  const packet = buildLongPacketIngestionArtifacts({
    packetId: 'durable-cross-chunk-packet',
    documentId: 'durable-cross-chunk-document',
    text: 'Synthetic current medication source detail. '.repeat(500),
    singlePassCharacterLimit: 50,
  })
  const pipeline = await runLongPacketModelPipeline(packet.plan, {
    mapChunk: async (chunk) => {
      const span = chunk.sourceSpans[0]
      const quote = chunk.text.slice(
        span.chunkStartOffset,
        Math.min(span.chunkEndOffset, span.chunkStartOffset + 45),
      )
      return {
        ...emptyMap(chunk),
        facts: [
          {
            category: 'medication' as const,
            key: 'current_lacosamide_dose',
            statement: `Current lacosamide dose is ${100 + chunk.chunkIndex * 50} mg twice daily.`,
            assertion: 'present' as const,
            temporality: 'current' as const,
            eventDateText: null,
            evidence: [
              {
                packetId: chunk.packetId,
                documentId: chunk.documentId,
                pageNumber: span.pageNumber,
                startOffset: span.pageStartOffset,
                endOffset: span.pageStartOffset + quote.length,
                quote,
                extractionMethod: span.extractionMethod,
                extractionConfidence: span.extractionConfidence,
              },
            ],
          },
        ],
      }
    },
    extractSafety: async (chunk) =>
      validateModelSafetyExtraction(
        {
          care_pathway: 'no_time_critical_signal',
          data_quality: 'sufficient',
          critical_unknowns: [],
          signals: [],
        },
        chunk.text,
      ),
    reduceNarrative: async (input) => {
      if (options?.narrativeFailure) {
        throw new Error('synthetic narrative reducer failure')
      }
      return {
        narrative: 'Synthetic durable cross-chunk narrative.',
        timelineNarrative: '',
        medicationNarrative: 'Conflicting current doses were preserved.',
        testNarrative: '',
        functionalNarrative: '',
        conflictNarrative: 'Current medication dose conflicts across pages.',
        preservedSafetyEvidenceIds: input.requiredSafetyEvidenceIds,
      }
    },
  })
  return { packet, pipeline }
}

function dependencies() {
  return createRuntimeWorkerDependencies({
    service: {
      completeChunkJob: completeChunkJobMock,
      completeFinalizationJob: completeFinalizationJobMock,
    } as never,
    workerId: 'worker-test',
  })
}

function finalizerClaim(packet: ReturnType<typeof artifacts>) {
  return {
    kind: 'finalize' as const,
    jobId: 'job-finalize',
    leaseToken: 'lease-finalize',
    attemptCount: 1,
    durable: {
      id: 'job-finalize',
      runId: 'run-1',
      tenantId: 'tenant-1',
      extractionId: 'extraction-1',
      leaseToken: 'lease-finalize',
      sourceSha256: packet.sourceSha256,
      planSha256: hashLongPacketPlan(packet.plan),
      plannerVersion: packet.plan.version,
      pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
      modelId: LONG_PACKET_NARRATIVE_REDUCER_MODEL,
      promptVersion: LONG_PACKET_NARRATIVE_REDUCER_PROMPT_VERSION,
    },
  } as never
}

function finalizerExecution(
  packet: ReturnType<typeof artifacts>,
  pipeline: Awaited<ReturnType<typeof safetyOutcome>>['pipeline'],
) {
  return {
    executionKind: 'finalize' as const,
    pipeline,
    extraction: buildFinalizedExtractionPersistence({
      pipeline,
      packetEmergencyResult: packet.emergency,
    }),
    context: {
      extractionId: 'extraction-1',
      tenantId: 'tenant-1',
      runId: 'run-1',
      plan: packet.plan,
      sourceSha256: packet.sourceSha256,
      modelId: LONG_PACKET_NARRATIVE_REDUCER_MODEL,
      promptVersion: LONG_PACKET_NARRATIVE_REDUCER_PROMPT_VERSION,
      plannerVersion: packet.plan.version,
      pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
    },
  }
}

function claim(branch: 'mapper' | 'safety') {
  return {
    kind: 'chunk' as const,
    jobId: `job-${branch}`,
    leaseToken: 'lease-1',
    attemptCount: 1,
    durable: {
      tenantId: 'tenant-1',
      branch,
      sourceSha256: 'a'.repeat(64),
      planSha256: 'b'.repeat(64),
      plannerVersion: 'neurology-long-packet-planner-v1',
      pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
    },
  } as never
}

function execution(
  packet: ReturnType<typeof artifacts>,
  outcome: LongPacketMapperBranchOutcome | LongPacketSafetyBranchOutcome,
  branch: 'mapper' | 'safety',
) {
  return {
    executionKind: 'chunk' as const,
    outcome,
    context: {
      extractionId: 'extraction-1',
      tenantId: 'tenant-1',
      chunkId: outcome.chunkId,
      branch,
      modelId:
        branch === 'safety'
          ? 'us.anthropic.claude-sonnet-5'
          : 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      promptVersion:
        branch === 'safety'
          ? 'neurology-safety-extractor-v3'
          : 'neurology-long-packet-clinical-mapper-v1',
      pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
      plan: packet.plan,
      sourceSha256: packet.sourceSha256,
    },
  }
}

describe('durable worker partial safety holds', () => {
  afterEach(() => vi.unstubAllEnvs())
  beforeEach(() => {
    vi.clearAllMocks()
    escalationMock.mockResolvedValue({
      ok: false,
      reason: 'persistence_failed',
    })
    partialHoldMock.mockResolvedValue({ ok: true, artifact: {} })
  })

  it.each(['10', '299'])(
    'rejects a %s-second production lease that cannot cover finalization plus safety margin',
    async (seconds) => {
      vi.stubEnv('TRIAGE_LONG_PACKET_LEASE_SECONDS', seconds)
      const claimJobByRef = vi.fn()
      const runtime = createRuntimeWorkerDependencies({
        service: { claimJobByRef } as never,
        workerId: 'worker-test',
      })

      await expect(
        runtime.claim({ version: 1, kind: 'chunk', job_id: 'job-1' }),
      ).rejects.toThrow('lease configuration is invalid')
      expect(claimJobByRef).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['300', 300_000],
    ['360', 360_000],
    ['', 360_000],
  ] as const)(
    'accepts a %s-second production lease budget',
    async (seconds, expectedMs) => {
      vi.stubEnv('TRIAGE_LONG_PACKET_LEASE_SECONDS', seconds)
      const claimJobByRef = vi.fn().mockResolvedValue(null)
      const runtime = createRuntimeWorkerDependencies({
        service: { claimJobByRef } as never,
        workerId: 'worker-test',
      })

      await expect(
        runtime.claim({ version: 1, kind: 'chunk', job_id: 'job-1' }),
      ).resolves.toBeNull()
      expect(claimJobByRef).toHaveBeenCalledWith(
        expect.objectContaining({ leaseDurationMs: expectedMs }),
      )
    },
  )

  it.each(['emergency_now', 'same_day_clinician_review'] as const)(
    'checkpoints validated durable %s evidence even when workflow escalation succeeds',
    async (carePathway) => {
      const { packet, outcome } = await safetyOutcome(carePathway)
      escalationMock.mockResolvedValueOnce({
        ok: true,
        triageSessionId: 'triage-success',
        emergencyActionId:
          carePathway === 'emergency_now' ? 'action-success' : null,
        actionRequired: true,
      })

      await dependencies().complete(
        claim('safety'),
        execution(packet, outcome, 'safety'),
      )

      expect(escalationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          durableAuthority: expect.objectContaining({
            jobId: 'job-safety',
            leaseToken: 'lease-1',
            branch: 'safety',
            chunkId: outcome.chunkId,
            chunkProvenanceSha256: outcome.chunkProvenanceSha256,
          }),
          checkpoint: {
            kind: 'chunk_projection',
            plan: packet.plan,
            sourceSha256: packet.sourceSha256,
            projection: expect.objectContaining({ outcome }),
          },
        }),
      )
      expect(partialHoldMock).not.toHaveBeenCalled()
      expect(completeChunkJobMock).toHaveBeenCalledOnce()
    },
  )

  it('passes the exact source checkpoint and current lease into one durable emergency escalation', async () => {
    const { packet, outcome } = await safetyOutcome('emergency_now')
    escalationMock.mockResolvedValueOnce({
      ok: true,
      triageSessionId: 'triage-atomic-durable',
      emergencyActionId: 'action-atomic-durable',
      actionRequired: true,
    })

    await dependencies().complete(
      claim('safety'),
      execution(packet, outcome, 'safety'),
    )

    expect(escalationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        durableAuthority: expect.objectContaining({
          jobId: 'job-safety',
          leaseToken: 'lease-1',
          branch: 'safety',
          chunkId: outcome.chunkId,
        }),
        checkpoint: {
          kind: 'chunk_projection',
          plan: packet.plan,
          sourceSha256: packet.sourceSha256,
          projection: expect.objectContaining({ outcome }),
        },
      }),
    )
    expect(partialHoldMock).not.toHaveBeenCalled()
    expect(completeChunkJobMock).toHaveBeenCalledOnce()
  })

  it('does not depend on a separate durable checkpoint write before atomic escalation', async () => {
    const { packet, outcome } = await safetyOutcome('emergency_now')
    partialHoldMock.mockResolvedValue({
      ok: false,
      reason: 'persistence_failed',
    })
    escalationMock.mockResolvedValueOnce({
      ok: true,
      triageSessionId: 'triage-checkpoint-retry',
      emergencyActionId: 'action-checkpoint-retry',
      actionRequired: true,
    })

    await dependencies().complete(
      claim('safety'),
      execution(packet, outcome, 'safety'),
    )

    expect(escalationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        checkpoint: {
          kind: 'chunk_projection',
          plan: packet.plan,
          sourceSha256: packet.sourceSha256,
          projection: expect.objectContaining({ outcome }),
        },
      }),
    )
    expect(partialHoldMock).not.toHaveBeenCalled()
    expect(completeChunkJobMock).toHaveBeenCalledOnce()
  })

  it.each(['emergency_now', 'same_day_clinician_review'] as const)(
    'persists a terminal hold when a validated durable %s escalation fails',
    async (carePathway) => {
      const { packet, outcome } = await safetyOutcome(carePathway)

      await expect(
        dependencies().complete(
          claim('safety'),
          execution(packet, outcome, 'safety'),
        ),
      ).rejects.toThrow('Model safety escalation persistence failed')
      expect(partialHoldMock).toHaveBeenCalledWith(
        expect.objectContaining({
          extractionId: 'extraction-1',
          tenantId: 'tenant-1',
          plan: packet.plan,
          sourceSha256: packet.sourceSha256,
          mode: 'workflow_persistence_failed',
          projection: expect.objectContaining({ outcome }),
        }),
      )
      expect(partialHoldMock).toHaveBeenCalledOnce()
      expect(escalationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          checkpoint: expect.objectContaining({
            projection: expect.objectContaining({ outcome }),
          }),
        }),
      )
      expect(completeChunkJobMock).not.toHaveBeenCalled()
    },
  )

  it('persists the same terminal hold for a durable mapper same-day floor', async () => {
    const { packet, outcome } = await mapperOutcome()

    await expect(
      dependencies().complete(
        claim('mapper'),
        execution(packet, outcome, 'mapper'),
      ),
    ).rejects.toThrow('Model safety escalation persistence failed')
    expect(escalationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyResult: expect.objectContaining({
          carePathway: 'same_day_clinician_review',
        }),
        checkpoint: expect.objectContaining({
          projection: expect.objectContaining({ outcome }),
        }),
      }),
    )
    expect(partialHoldMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'workflow_persistence_failed',
        projection: expect.objectContaining({ outcome }),
      }),
    )
    expect(completeChunkJobMock).not.toHaveBeenCalled()
  })

  it('remains fatal when both durable escalation and partial-hold persistence fail', async () => {
    const { packet, outcome } = await safetyOutcome('emergency_now')
    partialHoldMock.mockResolvedValueOnce({
      ok: false,
      reason: 'persistence_failed',
    })

    await expect(
      dependencies().complete(
        claim('safety'),
        execution(packet, outcome, 'safety'),
      ),
    ).rejects.toThrow('partial-hold persistence failed')
    expect(completeChunkJobMock).not.toHaveBeenCalled()
  })

  it('persists the partial hold when durable escalation throws', async () => {
    const { packet, outcome } = await safetyOutcome('emergency_now')
    escalationMock.mockRejectedValueOnce(
      new Error('synthetic escalation throw'),
    )

    await expect(
      dependencies().complete(
        claim('safety'),
        execution(packet, outcome, 'safety'),
      ),
    ).rejects.toThrow('Model safety escalation persistence failed')
    expect(partialHoldMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionId: 'extraction-1',
        mode: 'workflow_persistence_failed',
        projection: expect.objectContaining({ outcome }),
      }),
    )
    expect(completeChunkJobMock).not.toHaveBeenCalled()
  })

  it.each(['emergency_now', 'same_day_clinician_review'] as const)(
    'atomically binds a durable aggregate %s workflow to its exact full pipeline before completion',
    async (carePathway) => {
      const { packet, pipeline } = await safetyOutcome(carePathway)
      escalationMock.mockResolvedValueOnce({
        ok: true,
        triageSessionId: 'triage-finalized',
        emergencyActionId:
          carePathway === 'emergency_now' ? 'action-finalized' : null,
        actionRequired: true,
      })

      await dependencies().complete(
        finalizerClaim(packet),
        finalizerExecution(packet, pipeline) as never,
      )

      expect(escalationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          safetyResult: expect.objectContaining({ carePathway }),
          checkpoint: {
            kind: 'validated_pipeline',
            plan: packet.plan,
            sourceSha256: packet.sourceSha256,
            safetyPromptVersions: expect.any(Object),
            modelMapResult: pipeline.mapperCoverage,
            modelReduceResult: pipeline,
          },
          durableAuthority: expect.objectContaining({
            kind: 'finalizer',
            jobId: 'job-finalize',
            leaseToken: 'lease-finalize',
            runId: 'run-1',
          }),
        }),
      )
      expect(completeFinalizationJobMock).toHaveBeenCalledWith(
        expect.objectContaining({
          result: pipeline,
          extraction: expect.objectContaining({ outcome: 'success' }),
        }),
      )
    },
  )

  it('terminalizes durable aggregate safety when its atomic workflow transaction fails', async () => {
    const { packet, pipeline } = await safetyOutcome('emergency_now')

    await dependencies().complete(
      finalizerClaim(packet),
      finalizerExecution(packet, pipeline) as never,
    )

    expect(completeFinalizationJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        result: pipeline,
        extraction: expect.objectContaining({ outcome: 'error' }),
      }),
    )
    expect(completeFinalizationJobMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        extraction: expect.objectContaining({ outcome: 'success' }),
      }),
    )
  })

  it('persists a durable cross-chunk-only conflict through the aggregate workflow checkpoint', async () => {
    const { packet, pipeline } = await crossChunkSameDayPipeline()
    expect(pipeline.carePathway).toBe('same_day_clinician_review')
    expect(pipeline.conflicts.length).toBeGreaterThan(0)
    expect(
      pipeline.mapperOutcomes.every(
        (outcome) =>
          outcome.result?.conflicts.length === 0 &&
          outcome.result.facts.every(
            (fact) =>
              fact.category !== 'red_flag' &&
              fact.category !== 'critical_unknown',
          ),
      ),
    ).toBe(true)
    escalationMock.mockResolvedValueOnce({
      ok: true,
      triageSessionId: 'triage-cross-chunk',
      emergencyActionId: null,
      actionRequired: true,
    })

    await dependencies().complete(
      finalizerClaim(packet),
      finalizerExecution(packet, pipeline) as never,
    )

    expect(escalationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyResult: expect.objectContaining({
          carePathway: 'same_day_clinician_review',
          dataQuality: 'conflicting',
        }),
        checkpoint: expect.objectContaining({
          kind: 'validated_pipeline',
          modelReduceResult: pipeline,
        }),
      }),
    )
    expect(completeFinalizationJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extraction: expect.objectContaining({ outcome: 'success' }),
      }),
    )
  })

  it('preserves a durable cross-chunk conflict when narrative reduction alone fails', async () => {
    const { packet, pipeline } = await crossChunkSameDayPipeline({
      narrativeFailure: true,
    })
    expect(pipeline).toMatchObject({
      status: 'partial',
      coverageStatus: 'partial',
      carePathway: 'same_day_clinician_review',
      failureCodes: ['narrative_reducer_failed'],
    })
    escalationMock.mockResolvedValueOnce({
      ok: true,
      triageSessionId: 'triage-cross-chunk-narrative-failure',
      emergencyActionId: null,
      actionRequired: true,
    })

    const execution = finalizerExecution(packet, pipeline)
    expect(execution.extraction.outcome).toBe('error')
    await dependencies().complete(
      finalizerClaim(packet),
      execution as never,
    )

    expect(escalationMock).toHaveBeenCalledOnce()
    expect(escalationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyResult: expect.objectContaining({
          carePathway: 'same_day_clinician_review',
          dataQuality: 'conflicting',
        }),
        checkpoint: expect.objectContaining({
          kind: 'validated_pipeline',
          modelReduceResult: pipeline,
        }),
      }),
    )
    expect(completeFinalizationJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        result: pipeline,
        extraction: expect.objectContaining({ outcome: 'error' }),
      }),
    )
  })

  it('reuses an already committed chunk checkpoint instead of sampling a divergent retry', async () => {
    const { packet, outcome, pipeline } = await safetyOutcome('emergency_now')
    const finalized = buildFinalizedExtractionPersistence({
      pipeline,
      packetEmergencyResult: packet.emergency,
    })
    const safetyPromptVersions = finalized.safetyPromptVersions
    const checkpoint = mergeLongPacketPartialSafetyHold({
      plan: packet.plan,
      sourceSha256: packet.sourceSha256,
      safetyPromptVersions,
      existing: null,
      mode: 'safety_checkpoint',
      projection: {
        outcome,
        modelProfile: safetyPromptVersions.safetyExtractorModel,
        promptVersion: safetyPromptVersions.safetyExtractor,
        pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
      },
    })
    const chunk = packet.plan.chunks.find(
      (candidate) => candidate.id === outcome.chunkId,
    )!
    const claimedPayload = {
      jobId: 'job-safety',
      runId: 'run-1',
      tenantId: 'tenant-1',
      extractionId: 'extraction-1',
      packetEmergencyResult: packet.emergency,
      plan: packet.plan,
      chunkId: chunk.id,
      branch: 'safety',
      chunk,
      modelId: safetyPromptVersions.safetyExtractorModel,
      promptVersion: safetyPromptVersions.safetyExtractor,
      configurationSha256: 'c'.repeat(64),
      sourceSha256: packet.sourceSha256,
      planSha256: hashLongPacketPlan(packet.plan),
      plannerVersion: packet.plan.version,
      pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
      safetyPromptVersions,
      modelReduceResult: checkpoint,
    }
    const loadClaimedChunkPayload = vi.fn().mockResolvedValue(claimedPayload)
    const runtime = createRuntimeWorkerDependencies({
      service: { loadClaimedChunkPayload } as never,
      workerId: 'worker-test',
    })

    const result = await runtime.executeChunk({
      kind: 'chunk',
      jobId: 'job-safety',
      leaseToken: 'lease-1',
      attemptCount: 2,
      durable: {
        id: 'job-safety',
        runId: 'run-1',
        tenantId: 'tenant-1',
        extractionId: 'extraction-1',
        branch: 'safety',
        chunkId: chunk.id,
        leaseToken: 'lease-1',
      },
    } as never)

    expect(result).toMatchObject({
      executionKind: 'chunk',
      outcome,
    })
    expect(loadClaimedChunkPayload).toHaveBeenCalledOnce()

    const terminalCheckpoint = mergeLongPacketPartialSafetyHold({
      plan: packet.plan,
      sourceSha256: packet.sourceSha256,
      safetyPromptVersions,
      existing: checkpoint,
      mode: 'workflow_persistence_failed',
      projection: {
        outcome,
        modelProfile: safetyPromptVersions.safetyExtractorModel,
        promptVersion: safetyPromptVersions.safetyExtractor,
        pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
      },
    })
    loadClaimedChunkPayload.mockResolvedValueOnce({
      ...claimedPayload,
      modelReduceResult: terminalCheckpoint,
    })
    await expect(
      runtime.executeChunk({
        kind: 'chunk',
        jobId: 'job-safety',
        leaseToken: 'lease-2',
        attemptCount: 3,
        durable: {
          id: 'job-safety',
          runId: 'run-1',
          tenantId: 'tenant-1',
          extractionId: 'extraction-1',
          branch: 'safety',
          chunkId: chunk.id,
          leaseToken: 'lease-2',
        },
      } as never),
    ).rejects.toThrow('cannot replace a terminal safety checkpoint')
  })

  it('reuses an already staged aggregate pipeline after finalizer completion persistence fails', async () => {
    const { packet, pipeline } = await crossChunkSameDayPipeline({
      narrativeFailure: true,
    })
    const finalized = buildFinalizedExtractionPersistence({
      pipeline,
      packetEmergencyResult: packet.emergency,
    })
    const readCompletedChunkOutcomes = vi.fn(() => {
      throw new Error('staged aggregate should suppress reducer resampling')
    })
    const runtime = createRuntimeWorkerDependencies({
      service: {
        loadClaimedFinalizationContext: vi.fn().mockResolvedValue({
          jobId: 'job-finalize',
          runId: 'run-1',
          tenantId: 'tenant-1',
          extractionId: 'extraction-1',
          packetEmergencyResult: packet.emergency,
          plan: packet.plan,
          expectedChunkCount: packet.plan.chunks.length,
          modelId: LONG_PACKET_NARRATIVE_REDUCER_MODEL,
          promptVersion: LONG_PACKET_NARRATIVE_REDUCER_PROMPT_VERSION,
          configurationSha256: 'c'.repeat(64),
          sourceSha256: packet.sourceSha256,
          planSha256: hashLongPacketPlan(packet.plan),
          plannerVersion: packet.plan.version,
          pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
          safetyPromptVersions: finalized.safetyPromptVersions,
          modelMapResult: pipeline.mapperCoverage,
          modelReduceResult: pipeline,
        }),
        readCompletedChunkOutcomes,
      } as never,
      workerId: 'worker-test',
    })

    const result = await runtime.executeFinalizer(finalizerClaim(packet))

    expect(result).toMatchObject({
      executionKind: 'finalize',
      pipeline,
      extraction: { outcome: 'error' },
    })
    expect(readCompletedChunkOutcomes).not.toHaveBeenCalled()
  })
})
