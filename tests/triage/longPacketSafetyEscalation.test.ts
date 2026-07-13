import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  deriveLongPacketPipelineSafetyResult,
  mergeLongPacketModelSafety,
  persistLongPacketSafetyEscalation,
} from '@/lib/triage/longPacketSafetyEscalation'
import type { ValidatedModelSafetyExtraction } from '@/lib/triage/modelSafetyExtraction'
import { hashLongPacketPlan } from '@/lib/triage/longPacketCanonicalHash'
import { buildLongPacketIngestionArtifacts } from '@/lib/triage/longPacketIngestion'
import {
  LONG_PACKET_MODEL_PIPELINE_VERSION,
  runLongPacketModelPipeline,
  type LongPacketSafetyBranchOutcome,
} from '@/lib/triage/longPacketModelPipeline'
import type { LongPacketChunk } from '@/lib/triage/longPacketPlanner'
import { validateModelSafetyExtraction } from '@/lib/triage/modelSafetyExtraction'
import {
  LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
  mergeLongPacketPartialSafetyHold,
} from '@/lib/triage/longPacketPartialSafetyHold'

const { getPoolMock, connectMock, queryMock, releaseMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

function safety(
  carePathway: ValidatedModelSafetyExtraction['carePathway'],
): ValidatedModelSafetyExtraction {
  return {
    carePathway,
    dataQuality: 'sufficient',
    criticalUnknowns:
      carePathway === 'undetermined' ? ['Current timing is unclear.'] : [],
    signals:
      carePathway === 'emergency_now'
        ? [
            {
              code: 'acute_focal_deficit',
              syndrome: 'acute_cerebrovascular',
              source: 'safety_model',
              action: 'emergency_now',
              assertion: 'present',
              temporality: 'current',
              experiencer: 'patient',
              evidence: [
                {
                  packetId: 'packet-1',
                  documentId: 'doc-1',
                  pageNumber: 8,
                  startOffset: 4,
                  endOffset: 18,
                  quote: 'sudden weakness',
                  extractionMethod: 'native_text',
                  extractionConfidence: 1,
                },
              ],
            },
          ]
        : [],
  }
}

const input = {
  extractionId: 'extraction-1',
  tenantId: 'tenant-1',
  jobId: '05240000-0000-4000-8000-000000000001',
  chunkId: 'chunk-8',
  modelProfile: 'us.anthropic.claude-sonnet-5',
  promptVersion: 'neurology-safety-extractor-v3',
  pipelineVersion: 'neurology-long-packet-model-pipeline-v1',
}

const durablePlan = {
  version: 'neurology-long-packet-planner-v1',
  packetId: 'packet-1',
  options: { maxChunkCharacters: 8_000, overlapCharacters: 1_000 },
  chunks: [{ id: 'chunk-8', provenanceSha256: 'c'.repeat(64) }],
  coverage: { status: 'complete' },
} as never

const durableAuthority = {
  jobId: input.jobId,
  leaseToken: 'lease-1',
  branch: 'safety' as const,
  chunkId: input.chunkId,
  chunkProvenanceSha256: 'c'.repeat(64),
  modelId: input.modelProfile,
  promptVersion: input.promptVersion,
  sourceSha256: 'd'.repeat(64),
  planSha256: hashLongPacketPlan(durablePlan),
  plannerVersion: 'neurology-long-packet-planner-v1',
  pipelineVersion: input.pipelineVersion,
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

async function atomicSafetyFixture(
  carePathway: 'emergency_now' | 'same_day_clinician_review',
) {
  const artifacts = buildLongPacketIngestionArtifacts({
    packetId: 'atomic-safety-packet',
    documentId: 'atomic-safety-document',
    text: 'Synthetic source with sudden current weakness. '.repeat(30),
    singlePassCharacterLimit: 50,
  })
  let outcome: LongPacketSafetyBranchOutcome | undefined
  const pipeline = await runLongPacketModelPipeline(artifacts.plan, {
    mapChunk: async (chunk) => emptyMap(chunk),
    extractSafety: async (chunk) => {
      const quote = chunk.text.slice(0, Math.min(45, chunk.text.length))
      return validateModelSafetyExtraction(
        {
          care_pathway: carePathway,
          data_quality: 'sufficient',
          critical_unknowns: [],
          signals: [
            {
              code:
                carePathway === 'emergency_now'
                  ? 'atomic_emergency'
                  : 'atomic_same_day',
              syndrome: 'acute_cerebrovascular',
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
    onSafetyOutcome: async (candidate) => {
      outcome ??= candidate
    },
    reduceNarrative: async (input) => ({
      narrative: 'Synthetic atomic safety narrative.',
      timelineNarrative: '',
      medicationNarrative: '',
      testNarrative: '',
      functionalNarrative: '',
      conflictNarrative: '',
      preservedSafetyEvidenceIds: input.requiredSafetyEvidenceIds,
    }),
  })
  const captured = outcome!
  const escalationInput = {
    ...input,
    chunkId: captured.chunkId,
    safetyResult: captured.result!,
    checkpoint: {
      kind: 'chunk_projection' as const,
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      projection: {
        outcome: captured,
        modelProfile:
          LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS.safetyExtractorModel,
        promptVersion:
          LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS.safetyExtractor,
        pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
      },
    },
  }
  return { artifacts, captured, pipeline, escalationInput }
}

async function crossChunkSameDayFixture(narrativeFails = false) {
  const artifacts = buildLongPacketIngestionArtifacts({
    packetId: 'atomic-cross-chunk-packet',
    documentId: 'atomic-cross-chunk-document',
    text: 'Synthetic current medication source detail. '.repeat(500),
    singlePassCharacterLimit: 50,
  })
  const pipeline = await runLongPacketModelPipeline(artifacts.plan, {
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
            key: 'current_levetiracetam_dose',
            statement: `Current levetiracetam dose is ${500 + chunk.chunkIndex * 250} mg twice daily.`,
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
      if (narrativeFails) {
        throw new Error('synthetic narrative reducer failure')
      }
      return {
        narrative: 'Synthetic cross-chunk conflict narrative.',
        timelineNarrative: '',
        medicationNarrative: 'Conflicting current doses were preserved.',
        testNarrative: '',
        functionalNarrative: '',
        conflictNarrative: 'Current medication dose conflicts across pages.',
        preservedSafetyEvidenceIds: input.requiredSafetyEvidenceIds,
      }
    },
  })
  return { artifacts, pipeline }
}

type AtomicSafetyFixture = Awaited<ReturnType<typeof atomicSafetyFixture>>
let emergencyFixture: AtomicSafetyFixture
let sameDayFixture: AtomicSafetyFixture

function extractionRow(
  fixture: AtomicSafetyFixture = emergencyFixture,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'extraction-1',
    status: 'pending',
    text_input: 'Synthetic referral source.',
    source_filename: 'packet.pdf',
    patient_age: 72,
    patient_sex: 'Female',
    packet_emergency_result: { version: 'deterministic-v1' },
    source_sha256: fixture.artifacts.sourceSha256,
    packet_plan: fixture.artifacts.plan,
    safety_prompt_versions: LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
    model_reduce_result: null,
    ...overrides,
  }
}

describe('long-packet model-safety escalation', () => {
  beforeAll(async () => {
    emergencyFixture = await atomicSafetyFixture('emergency_now')
    sameDayFixture = await atomicSafetyFixture('same_day_clinician_review')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ connect: connectMock })
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock })
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return {
          rows: [
            extractionRow(),
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('FROM triage_sessions') && sql.includes('source_extraction_id')) {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('UPDATE triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO triage_sessions')) {
        return { rows: [{ id: 'triage-1' }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO triage_emergency_actions')) {
        return { rows: [{ id: 'action-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })
  })

  it('does no database work for a validated no-signal chunk', async () => {
    await expect(
      persistLongPacketSafetyEscalation({
        ...input,
        safetyResult: safety('no_time_critical_signal'),
      }),
    ).resolves.toEqual({
      ok: true,
      triageSessionId: null,
      emergencyActionId: null,
      actionRequired: false,
    })
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('atomically creates a model-attributed emergency workflow and action', async () => {
    await expect(
      persistLongPacketSafetyEscalation({
        ...emergencyFixture.escalationInput,
      }),
    ).resolves.toMatchObject({
      ok: true,
      triageSessionId: 'triage-1',
      emergencyActionId: 'action-1',
    })

    const sql = queryMock.mock.calls.map(([statement]) => String(statement)).join('\n')
    expect(sql).toContain("status IN ('pending', 'error')")
    expect(sql).toContain('INSERT INTO triage_sessions')
    expect(sql).toContain('INSERT INTO triage_emergency_actions')
    expect(sql).toContain("'long_packet_model_safety_escalated', 'model'")
    expect(sql).toContain('WHERE NOT EXISTS')
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
  })

  it('commits the exact source-bound emergency checkpoint with the workflow in one transaction', async () => {
    const { artifacts, captured, escalationInput } = emergencyFixture
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return {
          rows: [
            extractionRow(emergencyFixture),
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (
        sql.includes('FROM triage_sessions') &&
        sql.includes('source_extraction_id')
      ) {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('INSERT INTO triage_sessions')) {
        return { rows: [{ id: 'triage-atomic' }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO triage_emergency_actions')) {
        return { rows: [{ id: 'action-atomic' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistLongPacketSafetyEscalation(escalationInput),
    ).resolves.toMatchObject({
      ok: true,
      triageSessionId: 'triage-atomic',
      emergencyActionId: 'action-atomic',
    })

    const checkpointCall = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE triage_extractions'),
    )
    expect(checkpointCall).toBeDefined()
    const persisted = JSON.parse(String(checkpointCall?.[1]?.[2]))
    expect(persisted).toMatchObject({
      mode: 'safety_checkpoint',
      sourceSha256: artifacts.sourceSha256,
      carePathway: 'emergency_now',
      projections: [expect.objectContaining({ outcome: captured })],
    })
    const checkpointOrder = queryMock.mock.calls.findIndex(([sql]) =>
      String(sql).includes('UPDATE triage_extractions'),
    )
    const workflowOrder = queryMock.mock.calls.findIndex(([sql]) =>
      String(sql).includes('INSERT INTO triage_sessions'),
    )
    expect(checkpointOrder).toBeGreaterThan(-1)
    expect(checkpointOrder).toBeLessThan(workflowOrder)
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
  })

  it('rolls back without workflow, action, notification, or event writes when the in-transaction checkpoint fails', async () => {
    const { escalationInput } = emergencyFixture
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return {
          rows: [
            extractionRow(emergencyFixture),
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_extractions')) {
        throw new Error('synthetic atomic checkpoint write failure')
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistLongPacketSafetyEscalation(escalationInput),
    ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })

    const statements = queryMock.mock.calls.map(([sql]) => String(sql))
    expect(statements).toContain('ROLLBACK')
    expect(
      statements.some((sql) => sql.includes('INSERT INTO triage_sessions')),
    ).toBe(false)
    expect(
      statements.some((sql) =>
        sql.includes('INSERT INTO triage_emergency_actions'),
      ),
    ).toBe(false)
    expect(
      statements.some((sql) => sql.includes('INSERT INTO notifications')),
    ).toBe(false)
    expect(
      statements.some((sql) => sql.includes('INSERT INTO triage_workflow_events')),
    ).toBe(false)
  })

  it('does not create a workflow on retry after a workflow-persistence checkpoint became terminal', async () => {
    const { artifacts, escalationInput } = emergencyFixture
    const terminal = mergeLongPacketPartialSafetyHold({
      plan: artifacts.plan,
      sourceSha256: artifacts.sourceSha256,
      safetyPromptVersions: LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
      existing: null,
      mode: 'workflow_persistence_failed',
      projection: escalationInput.checkpoint.projection,
    })
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return {
          rows: [
            extractionRow(emergencyFixture, {
              status: 'error',
              model_reduce_result: terminal,
            }),
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO triage_sessions')) {
        return { rows: [{ id: 'triage-should-not-exist' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistLongPacketSafetyEscalation(escalationInput),
    ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })

    const statements = queryMock.mock.calls.map(([sql]) => String(sql))
    expect(statements).toContain('ROLLBACK')
    expect(
      statements.some((sql) => sql.includes('INSERT INTO triage_sessions')),
    ).toBe(false)
  })

  it('rejects a workflow safety result that is not the exact validated checkpoint projection', async () => {
    const inconsistent = {
      ...emergencyFixture.escalationInput,
      safetyResult: {
        ...emergencyFixture.escalationInput.safetyResult,
        signals: [],
      },
    }

    await expect(
      persistLongPacketSafetyEscalation(inconsistent),
    ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })

    const statements = queryMock.mock.calls.map(([sql]) => String(sql))
    expect(statements).toContain('ROLLBACK')
    expect(
      statements.some((sql) => sql.includes('INSERT INTO triage_sessions')),
    ).toBe(false)
  })

  it('atomically stages an exact validated full pipeline before committing its aggregate emergency workflow', async () => {
    const aggregateInput = {
      ...emergencyFixture.escalationInput,
      jobId: 'inline-finalize:extraction-1',
      chunkId: 'inline-finalization',
      checkpoint: {
        kind: 'validated_pipeline' as const,
        plan: emergencyFixture.artifacts.plan,
        sourceSha256: emergencyFixture.artifacts.sourceSha256,
        safetyPromptVersions: LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
        modelMapResult: emergencyFixture.pipeline.mapperCoverage,
        modelReduceResult: emergencyFixture.pipeline,
      },
    }

    await expect(
      persistLongPacketSafetyEscalation(aggregateInput),
    ).resolves.toMatchObject({
      ok: true,
      triageSessionId: 'triage-1',
      emergencyActionId: 'action-1',
    })

    const staged = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE triage_extractions'),
    )
    expect(String(staged?.[0])).toContain('model_map_result')
    expect(String(staged?.[0])).toContain('model_reduce_result')
    expect(JSON.parse(String(staged?.[1]?.[2]))).toEqual(
      emergencyFixture.pipeline.mapperCoverage,
    )
    expect(JSON.parse(String(staged?.[1]?.[3]))).toEqual(
      emergencyFixture.pipeline,
    )
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
  })

  it('atomically stages a cross-chunk-only same-day conflict that has no actionable per-chunk projection', async () => {
    const fixture = await crossChunkSameDayFixture()
    expect(fixture.pipeline.carePathway).toBe('same_day_clinician_review')
    expect(fixture.pipeline.conflicts.length).toBeGreaterThan(0)
    expect(
      deriveLongPacketPipelineSafetyResult(fixture.pipeline),
    ).toMatchObject({
      carePathway: 'same_day_clinician_review',
      dataQuality: 'conflicting',
    })
    expect(
      fixture.pipeline.mapperOutcomes.every(
        (outcome) =>
          outcome.result?.conflicts.length === 0 &&
          outcome.result.facts.every(
            (fact) =>
              fact.category !== 'red_flag' &&
              fact.category !== 'critical_unknown',
          ),
      ),
    ).toBe(true)
    expect(
      fixture.pipeline.safetyOutcomes.every(
        (outcome) =>
          outcome.result?.carePathway === 'no_time_critical_signal',
      ),
    ).toBe(true)
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return {
          rows: [
            extractionRow(emergencyFixture, {
              source_sha256: fixture.artifacts.sourceSha256,
              packet_plan: fixture.artifacts.plan,
              model_map_result: null,
              model_reduce_result: null,
            }),
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (
        sql.includes('FROM triage_sessions') &&
        sql.includes('source_extraction_id')
      ) {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('INSERT INTO triage_sessions')) {
        return { rows: [{ id: 'triage-cross-chunk' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistLongPacketSafetyEscalation({
        ...input,
        jobId: 'inline-finalize:cross-chunk',
        chunkId: 'inline-finalization',
        safetyResult: deriveLongPacketPipelineSafetyResult(fixture.pipeline),
        checkpoint: {
          kind: 'validated_pipeline',
          plan: fixture.artifacts.plan,
          sourceSha256: fixture.artifacts.sourceSha256,
          safetyPromptVersions: LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
          modelMapResult: fixture.pipeline.mapperCoverage,
          modelReduceResult: fixture.pipeline,
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      triageSessionId: 'triage-cross-chunk',
      actionRequired: true,
    })
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
  })

  it('marks aggregate critical unknowns partial instead of falsely sufficient', () => {
    const derived = deriveLongPacketPipelineSafetyResult({
      ...emergencyFixture.pipeline,
      carePathway: 'same_day_clinician_review',
      reviewRequirement: 'immediate_clinician_review',
      safetySignals: [],
      conflicts: [],
      criticalUnknowns: [
        {
          text: 'Current anticoagulant exposure is unresolved.',
          source: 'safety_extractor',
          chunkIds: [emergencyFixture.captured.chunkId],
          evidence: [],
        },
      ],
    })

    expect(derived).toMatchObject({
      carePathway: 'same_day_clinician_review',
      dataQuality: 'partial',
      criticalUnknowns: ['Current anticoagulant exposure is unresolved.'],
    })
  })

  it('still atomically persists cross-chunk same-day safety when only narrative reduction fails', async () => {
    const fixture = await crossChunkSameDayFixture(true)
    expect(fixture.pipeline).toMatchObject({
      status: 'partial',
      coverageStatus: 'partial',
      carePathway: 'same_day_clinician_review',
      mapperCoverage: { status: 'complete' },
      safetyCoverage: { status: 'complete' },
      failureCodes: ['narrative_reducer_failed'],
    })
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return {
          rows: [
            extractionRow(emergencyFixture, {
              source_sha256: fixture.artifacts.sourceSha256,
              packet_plan: fixture.artifacts.plan,
              model_map_result: null,
              model_reduce_result: null,
            }),
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (
        sql.includes('FROM triage_sessions') &&
        sql.includes('source_extraction_id')
      ) {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('INSERT INTO triage_sessions')) {
        return { rows: [{ id: 'triage-partial-aggregate' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistLongPacketSafetyEscalation({
        ...input,
        jobId: 'inline-finalize:partial-aggregate',
        chunkId: 'inline-finalization',
        safetyResult: deriveLongPacketPipelineSafetyResult(fixture.pipeline),
        checkpoint: {
          kind: 'validated_pipeline',
          plan: fixture.artifacts.plan,
          sourceSha256: fixture.artifacts.sourceSha256,
          safetyPromptVersions: LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
          modelMapResult: fixture.pipeline.mapperCoverage,
          modelReduceResult: fixture.pipeline,
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      triageSessionId: 'triage-partial-aggregate',
    })
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
  })

  it('rejects a stale durable finalizer lease before staging a pipeline or mutating a workflow', async () => {
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes('FROM triage_long_packet_finalization_jobs')
        ? { rows: [], rowCount: 0 }
        : { rows: [], rowCount: 1 },
    )
    const aggregateInput = {
      ...emergencyFixture.escalationInput,
      jobId: 'job-finalize-stale',
      chunkId: 'finalization',
      modelProfile: 'us.anthropic.claude-sonnet-4-6',
      promptVersion: 'neurology-long-packet-narrative-reducer-v1',
      durableAuthority: {
        kind: 'finalizer' as const,
        jobId: 'job-finalize-stale',
        leaseToken: 'stale-finalizer-lease',
        runId: 'run-1',
        modelId: 'us.anthropic.claude-sonnet-4-6',
        promptVersion: 'neurology-long-packet-narrative-reducer-v1',
        sourceSha256: emergencyFixture.artifacts.sourceSha256,
        planSha256: hashLongPacketPlan(emergencyFixture.artifacts.plan),
        plannerVersion: emergencyFixture.artifacts.plan.version,
        pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
      },
      checkpoint: {
        kind: 'validated_pipeline' as const,
        plan: emergencyFixture.artifacts.plan,
        sourceSha256: emergencyFixture.artifacts.sourceSha256,
        safetyPromptVersions: LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
        modelMapResult: emergencyFixture.pipeline.mapperCoverage,
        modelReduceResult: emergencyFixture.pipeline,
      },
    }

    await expect(
      persistLongPacketSafetyEscalation(aggregateInput),
    ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })

    const statements = queryMock.mock.calls.map(([sql]) => String(sql))
    expect(
      statements.some((sql) => sql.includes('FROM triage_extractions')),
    ).toBe(false)
    expect(
      statements.some((sql) => sql.includes('triage_sessions')),
    ).toBe(false)
    expect(
      statements.some((sql) => sql.includes('UPDATE triage_extractions')),
    ).toBe(false)
    expect(statements).toContain('ROLLBACK')
  })

  it('creates an idempotent server notification for a model-only same-day workflow', async () => {
    await persistLongPacketSafetyEscalation({
      ...sameDayFixture.escalationInput,
    })

    const notificationCall = queryMock.mock.calls.find(([statement]) =>
      String(statement).includes('INSERT INTO notifications'),
    )
    expect(notificationCall).toBeDefined()
    expect(String(notificationCall?.[0])).toContain('WHERE NOT EXISTS')
    expect(notificationCall?.[1]).toEqual(
      expect.arrayContaining([
        'tenant-1',
        'triage-1',
        'same_day_clinician_review',
      ]),
    )
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
  })

  it('escalates an existing tenant-bound workflow without lowering its floor', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return {
          rows: [extractionRow(sameDayFixture)],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM triage_sessions') && sql.includes('source_extraction_id')) {
        return {
          rows: [
            {
              id: 'triage-existing',
              workflow_status: 'emergency_hold',
              care_pathway: 'emergency_now',
              data_quality: 'partial',
              safety_shadow_result: null,
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('FROM triage_emergency_actions')) {
        return { rows: [{ id: 'action-existing' }], rowCount: 1 }
      }
      if (sql.includes('UPDATE triage_sessions')) {
        return { rows: [{ id: 'triage-existing' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await persistLongPacketSafetyEscalation({
      ...sameDayFixture.escalationInput,
    })

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE triage_sessions'),
      expect.arrayContaining([
        'triage-existing',
        'tenant-1',
        'emergency_now',
        'partial',
        'emergency_action',
        'emergency_hold',
      ]),
    )
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO triage_emergency_actions'),
      ),
    ).toBe(false)
  })

  it('rolls back and fails closed when the pending extraction is unavailable', async () => {
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes('FROM triage_extractions')
        ? { rows: [], rowCount: 0 }
        : { rows: [], rowCount: 1 },
    )

    await expect(
      persistLongPacketSafetyEscalation({
        ...emergencyFixture.escalationInput,
      }),
    ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
    expect(releaseMock).toHaveBeenCalled()
  })

  it('rejects a stale durable lease before reading or mutating the extraction workflow', async () => {
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes('FROM triage_long_packet_chunk_jobs')
        ? { rows: [], rowCount: 0 }
        : { rows: [], rowCount: 1 },
    )

    await expect(
      persistLongPacketSafetyEscalation({
        ...emergencyFixture.escalationInput,
        durableAuthority,
      }),
    ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })

    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('FROM triage_extractions'),
      ),
    ).toBe(false)
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('triage_sessions'),
      ),
    ).toBe(false)
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
  })

  it('returns a persistence failure when pool acquisition rejects', async () => {
    getPoolMock.mockRejectedValueOnce(new Error('synthetic pool outage'))

    await expect(
      persistLongPacketSafetyEscalation({
        ...emergencyFixture.escalationInput,
      }),
    ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('returns a persistence failure when connecting rejects', async () => {
    connectMock.mockRejectedValueOnce(new Error('synthetic connect outage'))

    await expect(
      persistLongPacketSafetyEscalation({
        ...emergencyFixture.escalationInput,
      }),
    ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })
    expect(releaseMock).not.toHaveBeenCalled()
  })

  it('still returns a persistence failure when rollback also rejects', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'ROLLBACK') {
        throw new Error('synthetic rollback outage')
      }
      if (sql.includes('FROM triage_extractions')) {
        throw new Error('synthetic write outage')
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistLongPacketSafetyEscalation({
        ...emergencyFixture.escalationInput,
      }),
    ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })
    expect(releaseMock).toHaveBeenCalled()
  })

  it('merges multiple safety chunks without allowing a later lower signal to erase an emergency', () => {
    const prior = safety('emergency_now')
    prior.dataQuality = 'conflicting'
    const incoming = safety('same_day_clinician_review')
    incoming.criticalUnknowns = ['Timing unclear.']

    expect(mergeLongPacketModelSafety(prior, incoming)).toMatchObject({
      carePathway: 'emergency_now',
      dataQuality: 'conflicting',
      criticalUnknowns: ['Timing unclear.'],
      signals: prior.signals,
    })
  })

  it('retains emergency evidence when the bounded snapshot already has many lower-priority signals', () => {
    const prior = safety('same_day_clinician_review')
    prior.signals = Array.from({ length: 50 }, (_, index) => ({
      ...safety('emergency_now').signals[0],
      code: `same_day_${index}`,
      action: 'immediate_clinician_review' as const,
      assertion: 'uncertain' as const,
      temporality: 'unknown' as const,
    }))
    const emergency = safety('emergency_now')

    const merged = mergeLongPacketModelSafety(prior, emergency)

    expect(merged.signals).toHaveLength(50)
    expect(merged.signals[0]).toMatchObject({
      code: 'acute_focal_deficit',
      action: 'emergency_now',
    })
  })
})
