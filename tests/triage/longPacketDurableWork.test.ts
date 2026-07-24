import type { Pool, PoolClient, QueryResult } from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPostgresLongPacketDurableWorkService,
  LongPacketDurableWorkError,
  type LongPacketRunConfiguration,
} from '@/lib/triage/longPacketDurableWork'
import {
  hashLongPacketConfiguration,
  hashLongPacketEmergency,
  hashLongPacketPlan,
  hashLongPacketResult,
} from '@/lib/triage/longPacketCanonicalHash'
import {
  buildLongPacketIngestionArtifacts,
  longPacketPipelineToPersistedClinicalExtraction,
} from '@/lib/triage/longPacketIngestion'
import { scanLongPacketEmergency } from '@/lib/triage/longPacketEmergency'
import { runLongPacketModelPipeline } from '@/lib/triage/longPacketModelPipeline'
import {
  LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
  mergeLongPacketPartialSafetyHold,
} from '@/lib/triage/longPacketPartialSafetyHold'
import { validateModelSafetyExtraction } from '@/lib/triage/modelSafetyExtraction'

type QueryCall = { sql: string; values: unknown[] }

function result(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length,
): QueryResult<Record<string, unknown>> {
  return { rows, rowCount } as QueryResult<Record<string, unknown>>
}

function mockTransactionalPool(
  handler: (sql: string, values: unknown[]) => QueryResult<Record<string, unknown>>,
) {
  const calls: QueryCall[] = []
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values })
    return handler(sql, values)
  })
  const release = vi.fn()
  const client = { query, release } as unknown as PoolClient
  const pool = {
    connect: vi.fn(async () => client),
    query: vi.fn(),
  } as unknown as Pool
  return { pool, calls, query, release }
}

function mockDirectPool(
  handler: (sql: string, values: unknown[]) => QueryResult<Record<string, unknown>>,
) {
  const calls: QueryCall[] = []
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values })
    return handler(sql, values)
  })
  return {
    pool: { query } as unknown as Pool,
    calls,
    query,
  }
}

const plan = {
  version: 'planner-v1',
  packetId: 'synthetic-packet',
  options: { maxChunkCharacters: 8000, overlapCharacters: 1000 },
  chunks: [
    {
      id: 'chunk-1',
      provenanceSha256: 'd'.repeat(64),
      text: 'Synthetic chunk one.',
      sourceSpans: [],
    },
    {
      id: 'chunk-2',
      provenanceSha256: 'e'.repeat(64),
      text: 'Synthetic chunk two.',
      sourceSpans: [],
    },
  ],
  coverage: {
    status: 'complete',
    sourceCharacterCount: 40,
    coveredCharacterCount: 40,
    uncoveredCharacterCount: 0,
    pageCount: 2,
    chunkCount: 2,
  },
}

const configuration: LongPacketRunConfiguration = {
  plannerVersion: 'planner-v1',
  pipelineVersion: 'pipeline-v1',
  mapperModelId: 'mapper-model-v1',
  mapperPromptVersion: 'mapper-prompt-v1',
  safetyModelId: 'safety-model-v1',
  safetyPromptVersion: 'safety-prompt-v1',
  reducerModelId: 'reducer-model-v1',
  reducerPromptVersion: 'reducer-prompt-v1',
  maxAttempts: 3,
}

const packetEmergencyResult = {
  status: 'completed',
  failureCode: null,
  carePathway: 'routine_outpatient',
  reviewRequirement: 'clinician_confirmation',
  schedulingLocked: true,
  signals: [],
  lexicalHits: [],
  expectedChunkCount: 2,
  scannedChunkCount: 2,
  chunkEvaluations: plan.chunks.map((chunk) => ({
    chunkId: chunk.id,
    gateway: {
      status: 'completed',
      failureCode: null,
      carePathway: 'routine_outpatient',
      reviewRequirement: 'clinician_confirmation',
      schedulingLocked: true,
      signals: [],
      lexicalHits: [],
      version: 'neurology-emergency-gateway-v3',
    },
  })),
  plannerVersion: plan.version,
  version: 'neurology-long-packet-emergency-map-reduce-v3',
}

const extractionRow = {
  id: 'extraction-1',
  tenant_id: 'tenant-1',
  status: 'pending',
  ingestion_mode: 'long_packet',
  source_sha256: 'a'.repeat(64),
  packet_plan: plan,
  packet_plan_sha256: hashLongPacketPlan(plan),
}

async function durableSafetyFixture() {
  const artifacts = buildLongPacketIngestionArtifacts({
    packetId: 'durable-finalization-safety-packet',
    documentId: 'durable-finalization-safety-document',
    text: 'Synthetic durable finalization source. '.repeat(35),
    singlePassCharacterLimit: 50,
  })
  const run = async (emergency: boolean, narrativeFailure = false) =>
    runLongPacketModelPipeline(artifacts.plan, {
      mapChunk: async (chunk) => ({
        chunkId: chunk.id,
        chunkProvenanceSha256: chunk.provenanceSha256,
        sourceCharacterCount: chunk.text.length,
        coverageStatus: 'complete',
        facts: [],
        conflicts: [],
      }),
      extractSafety: async (chunk) => {
        const quote = chunk.text.slice(0, 40)
        return validateModelSafetyExtraction(
          emergency
            ? {
                care_pathway: 'emergency_now',
                data_quality: 'sufficient',
                critical_unknowns: [],
                signals: [{
                  code: 'durable_finalization_emergency',
                  syndrome: 'other_time_critical',
                  assertion: 'present',
                  temporality: 'current',
                  experiencer: 'patient',
                  action: 'emergency_now',
                  evidence: [{ quote, occurrence_index: 0 }],
                }],
              }
            : {
                care_pathway: 'no_time_critical_signal',
                data_quality: 'sufficient',
                critical_unknowns: [],
                signals: [],
              },
          chunk.text,
        )
      },
      reduceNarrative: async (input) => {
        if (narrativeFailure) {
          throw new Error('synthetic narrative reducer failure')
        }
        return {
          narrative: 'Synthetic durable finalization narrative.',
          timelineNarrative: '',
          medicationNarrative: '',
          testNarrative: '',
          functionalNarrative: '',
          conflictNarrative: '',
          preservedSafetyEvidenceIds: input.requiredSafetyEvidenceIds,
        }
      },
    })
  const emergencyPipeline = await run(true)
  const narrativeFailurePipeline = await run(true, true)
  const routinePipeline = await run(false)
  const checkpoint = mergeLongPacketPartialSafetyHold({
    plan: artifacts.plan,
    sourceSha256: artifacts.sourceSha256,
    safetyPromptVersions: LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
    existing: null,
    mode: 'safety_checkpoint',
    projection: {
      outcome: emergencyPipeline.safetyOutcomes[0],
      modelProfile:
        LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS.safetyExtractorModel,
      promptVersion:
        LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS.safetyExtractor,
      pipelineVersion: emergencyPipeline.version,
    },
  })
  return {
    artifacts,
    emergencyPipeline,
    narrativeFailurePipeline,
    routinePipeline,
    checkpoint,
  }
}

function successfulFinalizedExtraction(
  plan: Parameters<typeof scanLongPacketEmergency>[0],
  pipeline: Awaited<ReturnType<typeof runLongPacketModelPipeline>>,
) {
  const clinical = longPacketPipelineToPersistedClinicalExtraction({
    pipeline,
    deterministicGateway: scanLongPacketEmergency(plan),
  })
  return {
    outcome: 'success' as const,
    ...clinical,
    modelMapResult: pipeline.mapperCoverage,
    safetyPromptVersions: LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
    safetyScreenedAt: new Date('2026-07-11T11:59:00.000Z'),
  }
}

describe('Postgres long-packet durable work service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('transactionally creates exactly two branch jobs per chunk plus one finalizer and starts the run', async () => {
    const { pool, calls, release } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/FROM triage_extractions/.test(sql)) {
        return result([{ ...extractionRow, packet_plan_sha256: null }])
      }
      if (/UPDATE triage_extractions/.test(sql)) {
        return result([{ id: 'extraction-1' }], 1)
      }
      if (/FROM triage_long_packet_runs/.test(sql)) return result([])
      if (/INSERT INTO triage_long_packet_runs/.test(sql)) {
        return result([{ id: 'run-1' }], 1)
      }
      if (/INSERT INTO triage_long_packet_chunk_jobs/.test(sql)) {
        return result([], 4)
      }
      if (/INSERT INTO triage_long_packet_finalization_jobs/.test(sql)) {
        return result([], 1)
      }
      if (/UPDATE triage_long_packet_runs/.test(sql)) {
        return result([{ id: 'run-1', status: 'running' }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool, {
      now: () => new Date('2026-07-11T12:00:00.000Z'),
      randomUUID: () => '05240000-0000-4000-8000-000000000001',
    })

    const initialized = await service.initializeOrGetRun({
      extractionId: 'extraction-1',
      tenantId: 'tenant-1',
      runPurpose: 'primary',
      sourceSha256: 'a'.repeat(64),
      plan,
      configuration,
    })

    expect(initialized).toMatchObject({
      runId: 'run-1',
      status: 'running',
      created: true,
      planSha256: hashLongPacketPlan(plan),
    })
    const chunkInsert = calls.find((call) =>
      call.sql.includes('INSERT INTO triage_long_packet_chunk_jobs'),
    )
    const jobs = JSON.parse(String(chunkInsert?.values.at(-1))) as Array<{
      chunk_id: string
      branch: string
      model_id: string
      prompt_version: string
    }>
    expect(jobs).toHaveLength(4)
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chunk_id: 'chunk-1',
          branch: 'mapper',
          model_id: configuration.mapperModelId,
          prompt_version: configuration.mapperPromptVersion,
        }),
        expect.objectContaining({
          chunk_id: 'chunk-1',
          branch: 'safety',
          model_id: configuration.safetyModelId,
          prompt_version: configuration.safetyPromptVersion,
        }),
      ]),
    )
    expect(
      calls.find((call) =>
        call.sql.includes('UPDATE triage_long_packet_runs'),
      )?.sql,
    ).toContain("status = 'pending'")
    const planDigestUpdate = calls.find((call) =>
      call.sql.includes('UPDATE triage_extractions'),
    )
    expect(planDigestUpdate?.sql).toContain('packet_plan_sha256 IS NULL')
    expect(planDigestUpdate?.sql).toContain("status = 'pending'")
    expect(planDigestUpdate?.values[2]).toBe(hashLongPacketPlan(plan))
    expect(calls.some((call) => call.sql === 'COMMIT')).toBe(true)
    expect(release).toHaveBeenCalledOnce()
  })

  it('rolls back if the database creates fewer than 2N chunk jobs', async () => {
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/FROM triage_extractions/.test(sql)) return result([extractionRow])
      if (/FROM triage_long_packet_runs/.test(sql)) return result([])
      if (/INSERT INTO triage_long_packet_runs/.test(sql)) {
        return result([{ id: 'run-1' }], 1)
      }
      if (/INSERT INTO triage_long_packet_chunk_jobs/.test(sql)) {
        return result([], 3)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool)

    await expect(
      service.initializeOrGetRun({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        runPurpose: 'primary',
        sourceSha256: 'a'.repeat(64),
        plan,
        configuration,
      }),
    ).rejects.toMatchObject({ code: 'persistence_failed' })
    expect(calls.some((call) => call.sql === 'ROLLBACK')).toBe(true)
    expect(calls.some((call) => call.sql === 'COMMIT')).toBe(false)
  })

  it('idempotently returns a fully verified existing run without recreating work', async () => {
    const planSha256 = hashLongPacketPlan(plan)
    const configurationSha256 = hashLongPacketConfiguration({
      sourceSha256: 'a'.repeat(64),
      planSha256,
      expectedChunkCount: 2,
      ...configuration,
    })
    const manifest = plan.chunks.flatMap((chunk) => [
      {
        chunk_id: chunk.id,
        branch: 'mapper',
        status: 'pending',
        configuration_sha256: configurationSha256,
        source_sha256: 'a'.repeat(64),
        plan_sha256: planSha256,
        planner_version: configuration.plannerVersion,
        pipeline_version: configuration.pipelineVersion,
        chunk_provenance_sha256: chunk.provenanceSha256,
        model_id: configuration.mapperModelId,
        prompt_version: configuration.mapperPromptVersion,
        max_attempts: configuration.maxAttempts,
      },
      {
        chunk_id: chunk.id,
        branch: 'safety',
        status: 'pending',
        configuration_sha256: configurationSha256,
        source_sha256: 'a'.repeat(64),
        plan_sha256: planSha256,
        planner_version: configuration.plannerVersion,
        pipeline_version: configuration.pipelineVersion,
        chunk_provenance_sha256: chunk.provenanceSha256,
        model_id: configuration.safetyModelId,
        prompt_version: configuration.safetyPromptVersion,
        max_attempts: configuration.maxAttempts,
      },
    ])
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/FROM triage_extractions/.test(sql)) return result([extractionRow])
      if (/FROM triage_long_packet_runs/.test(sql)) {
        return result([
          {
            id: 'run-existing',
            extraction_id: 'extraction-1',
            tenant_id: 'tenant-1',
            configuration_sha256: configurationSha256,
            run_purpose: 'primary',
            source_sha256: 'a'.repeat(64),
            plan_sha256: planSha256,
            expected_chunk_count: 2,
            planner_version: configuration.plannerVersion,
            pipeline_version: configuration.pipelineVersion,
            mapper_model_id: configuration.mapperModelId,
            mapper_prompt_version: configuration.mapperPromptVersion,
            safety_model_id: configuration.safetyModelId,
            safety_prompt_version: configuration.safetyPromptVersion,
            reducer_model_id: configuration.reducerModelId,
            reducer_prompt_version: configuration.reducerPromptVersion,
            status: 'running',
            started_at: '2026-07-11T11:59:00.000Z',
          },
        ])
      }
      if (/FROM triage_long_packet_chunk_jobs/.test(sql)) return result(manifest)
      if (/FROM triage_long_packet_finalization_jobs/.test(sql)) {
        return result([
          {
            run_id: 'run-existing',
            tenant_id: 'tenant-1',
            configuration_sha256: configurationSha256,
            source_sha256: 'a'.repeat(64),
            plan_sha256: planSha256,
            planner_version: configuration.plannerVersion,
            pipeline_version: configuration.pipelineVersion,
            expected_chunk_count: 2,
            model_id: configuration.reducerModelId,
            prompt_version: configuration.reducerPromptVersion,
            max_attempts: configuration.maxAttempts,
          },
        ])
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool)

    await expect(
      service.initializeOrGetRun({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        runPurpose: 'shadow',
        sourceSha256: 'a'.repeat(64),
        plan,
        configuration,
      }),
    ).resolves.toMatchObject({
      runId: 'run-existing',
      runPurpose: 'primary',
      status: 'running',
      created: false,
    })
    expect(
      calls.some(
        (call) =>
          /INSERT INTO|UPDATE triage_long_packet_(runs|chunk|finalization)/.test(
            call.sql,
          ),
      ),
    ).toBe(false)
  })

  it('claims retryable or expired chunk work with a conditional locked update', async () => {
    const { pool, calls } = mockDirectPool((sql) => {
      if (/UPDATE triage_long_packet_chunk_jobs/.test(sql)) {
        return result(
          [
            {
              id: 'job-1',
              run_id: 'run-1',
              chunk_id: 'chunk-1',
              branch: 'mapper',
              tenant_id: 'tenant-1',
              previous_status: 'failed',
              lease_token: '05240000-0000-4000-8000-000000000001',
              attempt_count: 2,
            },
          ],
          1,
        )
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool, {
      now: () => new Date('2026-07-11T12:00:00.000Z'),
      randomUUID: () => '05240000-0000-4000-8000-000000000001',
    })

    const claimed = await service.claimChunkJob({
      tenantId: 'tenant-1',
      workerId: 'worker-1',
      leaseDurationMs: 60_000,
      branch: 'mapper',
    })

    expect(claimed).toMatchObject({ claimKind: 'retry', leaseToken: expect.any(String) })
    const sql = calls[0].sql
    expect(sql).toContain('FOR UPDATE OF job SKIP LOCKED')
    expect(sql).toContain("job.status = 'pending'")
    expect(sql).toContain("job.status = 'failed'")
    expect(sql).toContain("job.status = 'leased'")
    expect(sql).toContain('job.attempt_count < job.max_attempts')
    expect(sql).toContain('candidate.previous_status')
  })

  it('returns no work only when a conditional claim mutates zero rows', async () => {
    const { pool } = mockDirectPool(() => result([], 0))
    const service = createPostgresLongPacketDurableWorkService(pool)

    await expect(
      service.claimChunkJob({
        tenantId: 'tenant-1',
        workerId: 'worker-1',
        leaseDurationMs: 60_000,
      }),
    ).resolves.toBeNull()
  })

  it('lists only opaque dispatch references without tenant or clinical payloads', async () => {
    const { pool, calls } = mockDirectPool(() =>
      result([
        { kind: 'chunk', job_id: 'job-1' },
        { kind: 'finalize', job_id: 'final-1' },
      ]),
    )
    const service = createPostgresLongPacketDurableWorkService(pool)

    await expect(service.listDispatchableJobRefs(10)).resolves.toEqual([
      { kind: 'chunk', jobId: 'job-1' },
      { kind: 'finalize', jobId: 'final-1' },
    ])
    expect(calls[0].sql).not.toContain('packet_plan')
    expect(calls[0].sql).not.toMatch(/SELECT[^;]+tenant_id/i)
    expect(calls[0].sql).toContain('job.expected_chunk_count * 2')
  })

  it('claims an opaque job reference while resolving tenant and run provenance inside the locked mutation', async () => {
    const { pool, calls } = mockDirectPool(() =>
      result(
        [
          {
            id: 'job-1',
            run_id: 'run-1',
            tenant_id: 'tenant-1',
            extraction_id: 'extraction-1',
            run_purpose: 'primary',
            expected_chunk_count: 2,
            chunk_id: 'chunk-1',
            branch: 'mapper',
            configuration_sha256: 'c'.repeat(64),
            source_sha256: 'a'.repeat(64),
            plan_sha256: 'b'.repeat(64),
            planner_version: configuration.plannerVersion,
            pipeline_version: configuration.pipelineVersion,
            chunk_provenance_sha256: 'd'.repeat(64),
            model_id: configuration.mapperModelId,
            prompt_version: configuration.mapperPromptVersion,
            previous_status: 'pending',
            lease_token: '05240000-0000-4000-8000-000000000001',
            attempt_count: 1,
          },
        ],
        1,
      ),
    )
    const service = createPostgresLongPacketDurableWorkService(pool, {
      now: () => new Date('2026-07-11T12:00:00.000Z'),
      randomUUID: () => '05240000-0000-4000-8000-000000000001',
    })

    const claim = await service.claimJobByRef({
      kind: 'chunk',
      jobId: 'job-1',
      workerId: 'queue-worker',
      leaseDurationMs: 60_000,
    })

    expect(claim).toMatchObject({
      id: 'job-1',
      tenantId: 'tenant-1',
      runId: 'run-1',
      extractionId: 'extraction-1',
      runPurpose: 'primary',
      expectedChunkCount: 2,
      chunkId: 'chunk-1',
      branch: 'mapper',
    })
    expect(calls[0].values).not.toContain('tenant-1')
    expect(calls[0].sql).toContain('FOR UPDATE OF job SKIP LOCKED')
    expect(calls[0].sql).toContain('job.tenant_id')
    expect(calls[0].sql).toContain(
      'job.lease_token IS NOT DISTINCT FROM candidate.previous_lease_token',
    )
    expect(calls[0].sql).toContain('run.extraction_id')
    expect(calls[0].sql).toContain('run.run_purpose')
    expect(calls[0].sql).toContain('run.expected_chunk_count')
  })

  it('claims a finalizer only when both branches and the exact 2N chunk manifest are complete', async () => {
    const { pool, calls } = mockDirectPool(() => result([], 0))
    const service = createPostgresLongPacketDurableWorkService(pool)

    await expect(
      service.claimJobByRef({
        kind: 'finalize',
        jobId: 'final-1',
        workerId: 'queue-worker',
        leaseDurationMs: 60_000,
      }),
    ).resolves.toBeNull()

    expect(calls[0].sql).toContain("completed.branch = 'mapper'")
    expect(calls[0].sql).toContain("completed.branch = 'safety'")
    expect(calls[0].sql).toContain('job.expected_chunk_count * 2')
  })

  it('loads the exact persisted chunk only for its active opaque lease', async () => {
    const { pool, calls } = mockDirectPool(() =>
      result([
        {
          id: 'job-1',
          run_id: 'run-1',
          tenant_id: 'tenant-1',
          extraction_id: 'extraction-1',
          source_filename: 'synthetic-packet.pdf',
          packet_emergency_result: packetEmergencyResult,
          safety_prompt_versions: { safety: 'safety-prompt-v1' },
          model_reduce_result: { kind: 'partial_safety_hold' },
          chunk_id: 'chunk-1',
          branch: 'mapper',
          configuration_sha256: 'c'.repeat(64),
          source_sha256: 'a'.repeat(64),
          plan_sha256: hashLongPacketPlan(plan),
          planner_version: configuration.plannerVersion,
          pipeline_version: configuration.pipelineVersion,
          chunk_provenance_sha256: 'd'.repeat(64),
          model_id: configuration.mapperModelId,
          prompt_version: configuration.mapperPromptVersion,
          packet_plan: plan,
          extraction_source_sha256: 'a'.repeat(64),
          extraction_plan_sha256: hashLongPacketPlan(plan),
          run_configuration_sha256: 'c'.repeat(64),
          run_source_sha256: 'a'.repeat(64),
          run_plan_sha256: hashLongPacketPlan(plan),
          run_planner_version: configuration.plannerVersion,
          run_pipeline_version: configuration.pipelineVersion,
          expected_model_id: configuration.mapperModelId,
          expected_prompt_version: configuration.mapperPromptVersion,
        },
      ]),
    )
    const service = createPostgresLongPacketDurableWorkService(pool, {
      now: () => new Date('2026-07-11T12:00:00.000Z'),
    })

    const payload = await service.loadClaimedChunkPayload({
      jobId: 'job-1',
      leaseToken: '05240000-0000-4000-8000-000000000001',
    })

    expect(payload).toMatchObject({
      tenantId: 'tenant-1',
      extractionId: 'extraction-1',
      sourceType: 'pdf',
      packetEmergencyResult,
      packetEmergencySha256: hashLongPacketEmergency(packetEmergencyResult),
      chunkId: 'chunk-1',
      chunk: plan.chunks[0],
      modelId: configuration.mapperModelId,
      promptVersion: configuration.mapperPromptVersion,
      safetyPromptVersions: { safety: 'safety-prompt-v1' },
      modelReduceResult: { kind: 'partial_safety_hold' },
    })
    expect(calls[0].sql).toContain("job.status = 'leased'")
    expect(calls[0].sql).toContain('job.lease_token = $2')
    expect(calls[0].sql).toContain('job.lease_expires_at > $3')
  })

  it('loads finalizer context with exact plan and extraction/session bindings behind its lease', async () => {
    const { pool } = mockDirectPool(() =>
      result([
        {
          id: 'final-1',
          run_id: 'run-1',
          tenant_id: 'tenant-1',
          extraction_id: 'extraction-1',
          triage_session_id: 'session-1',
          source_filename: 'synthetic-packet.pdf',
          packet_emergency_result: packetEmergencyResult,
          safety_prompt_versions: { reducer: 'reducer-prompt-v1' },
          model_map_result: { status: 'complete' },
          model_reduce_result: { status: 'partial' },
          configuration_sha256: 'c'.repeat(64),
          source_sha256: 'a'.repeat(64),
          plan_sha256: hashLongPacketPlan(plan),
          planner_version: configuration.plannerVersion,
          pipeline_version: configuration.pipelineVersion,
          expected_chunk_count: 2,
          model_id: configuration.reducerModelId,
          prompt_version: configuration.reducerPromptVersion,
          packet_plan: plan,
          extraction_source_sha256: 'a'.repeat(64),
          extraction_plan_sha256: hashLongPacketPlan(plan),
          run_configuration_sha256: 'c'.repeat(64),
          run_source_sha256: 'a'.repeat(64),
          run_plan_sha256: hashLongPacketPlan(plan),
          run_planner_version: configuration.plannerVersion,
          run_pipeline_version: configuration.pipelineVersion,
          run_reducer_model_id: configuration.reducerModelId,
          run_reducer_prompt_version: configuration.reducerPromptVersion,
        },
      ]),
    )
    const service = createPostgresLongPacketDurableWorkService(pool, {
      now: () => new Date('2026-07-11T12:00:00.000Z'),
    })

    await expect(
      service.loadClaimedFinalizationContext({
        jobId: 'final-1',
        leaseToken: '05240000-0000-4000-8000-000000000001',
      }),
    ).resolves.toMatchObject({
      tenantId: 'tenant-1',
      runId: 'run-1',
      extractionId: 'extraction-1',
      triageSessionId: 'session-1',
      sourceType: 'pdf',
      packetEmergencyResult,
      packetEmergencySha256: hashLongPacketEmergency(packetEmergencyResult),
      plan,
      safetyPromptVersions: { reducer: 'reducer-prompt-v1' },
      modelMapResult: { status: 'complete' },
      modelReduceResult: { status: 'partial' },
    })
  })

  it.each([
    [
      'chunk order',
      {
        ...packetEmergencyResult,
        chunkEvaluations: [...packetEmergencyResult.chunkEvaluations].reverse(),
      },
    ],
    [
      'version',
      { ...packetEmergencyResult, version: 'obsolete-emergency-version' },
    ],
  ])('rejects deterministic emergency evidence whose %s is not bound to the persisted plan', async (_case, invalidEmergency) => {
    const { pool } = mockDirectPool(() =>
      result([
        {
          id: 'final-1',
          run_id: 'run-1',
          tenant_id: 'tenant-1',
          extraction_id: 'extraction-1',
          triage_session_id: null,
          source_filename: 'synthetic-packet.pdf',
          packet_emergency_result: invalidEmergency,
          configuration_sha256: 'c'.repeat(64),
          source_sha256: 'a'.repeat(64),
          plan_sha256: hashLongPacketPlan(plan),
          planner_version: configuration.plannerVersion,
          pipeline_version: configuration.pipelineVersion,
          expected_chunk_count: 2,
          model_id: configuration.reducerModelId,
          prompt_version: configuration.reducerPromptVersion,
          packet_plan: plan,
          extraction_source_sha256: 'a'.repeat(64),
          extraction_plan_sha256: hashLongPacketPlan(plan),
          run_configuration_sha256: 'c'.repeat(64),
          run_source_sha256: 'a'.repeat(64),
          run_plan_sha256: hashLongPacketPlan(plan),
          run_planner_version: configuration.plannerVersion,
          run_pipeline_version: configuration.pipelineVersion,
          run_reducer_model_id: configuration.reducerModelId,
          run_reducer_prompt_version: configuration.reducerPromptVersion,
        },
      ]),
    )
    const service = createPostgresLongPacketDurableWorkService(pool)

    await expect(
      service.loadClaimedFinalizationContext({
        jobId: 'final-1',
        leaseToken: '05240000-0000-4000-8000-000000000001',
      }),
    ).rejects.toMatchObject({ code: 'binding_mismatch' })
  })

  it('rejects a stale completion and predicates the mutation on status, token, tenant, and lease expiry', async () => {
    const { pool, calls } = mockDirectPool(() => result([], 0))
    const service = createPostgresLongPacketDurableWorkService(pool, {
      now: () => new Date('2026-07-11T12:00:00.000Z'),
    })

    await expect(
      service.completeChunkJob({
        jobId: 'job-1',
        tenantId: 'tenant-1',
        leaseToken: '05240000-0000-4000-8000-000000000001',
        branch: 'mapper',
        result: { status: 'completed' },
      }),
    ).rejects.toMatchObject({ code: 'stale_or_missing_lease' })
    expect(calls[0].sql).toContain("status = 'leased'")
    expect(calls[0].sql).toContain('lease_token = $3')
    expect(calls[0].sql).toContain('tenant_id = $2')
    expect(calls[0].sql).toContain('lease_expires_at > $4')
  })

  it('sanitizes worker failures before conditionally persisting retry evidence', async () => {
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_long_packet_chunk_jobs/.test(sql)) {
        return result(
          [
            {
              id: 'job-1',
              run_id: 'run-1',
              status: 'failed',
              attempt_count: 1,
              max_attempts: 3,
            },
          ],
          1,
        )
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool, {
      now: () => new Date('2026-07-11T12:00:00.000Z'),
    })
    const rawSecret = 'AWS credential AKIA-SYNTHETIC and patient-like raw text'

    await service.failChunkJob({
      jobId: 'job-1',
      tenantId: 'tenant-1',
      leaseToken: '05240000-0000-4000-8000-000000000001',
      error: new Error(rawSecret),
      nextRetryAt: new Date('2026-07-11T12:01:00.000Z'),
    })

    const failureMutation = calls.find((call) =>
      call.sql.includes('UPDATE triage_long_packet_chunk_jobs'),
    )
    const serialized = JSON.stringify(failureMutation?.values)
    expect(serialized).not.toContain(rawSecret)
    expect(serialized).not.toContain('AKIA-SYNTHETIC')
    expect(failureMutation?.sql).toContain("status = 'leased'")
    expect(failureMutation?.sql).toContain('lease_token = $3')
    expect(
      calls.some((call) => call.sql.includes('UPDATE triage_extractions')),
    ).toBe(false)
  })

  it('atomically fails the parent run when a job exhausts its bounded attempts', async () => {
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_long_packet_chunk_jobs/.test(sql)) {
        return result(
          [
            {
              id: 'job-1',
              run_id: 'run-1',
              status: 'failed',
              attempt_count: 3,
              max_attempts: 3,
            },
          ],
          1,
        )
      }
      if (/UPDATE triage_long_packet_runs/.test(sql)) {
        return result([{ id: 'run-1', extraction_id: 'extraction-1' }], 1)
      }
      if (/UPDATE triage_extractions/.test(sql)) {
        return result([{ id: 'extraction-1' }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool, {
      now: () => new Date('2026-07-11T12:00:00.000Z'),
    })

    await service.failChunkJob({
      jobId: 'job-1',
      tenantId: 'tenant-1',
      leaseToken: '05240000-0000-4000-8000-000000000001',
      error: new Error('synthetic timeout'),
      nextRetryAt: new Date('2026-07-11T12:01:00.000Z'),
    })

    expect(
      calls.find((call) =>
        call.sql.includes('UPDATE triage_long_packet_chunk_jobs'),
      )?.sql,
    ).toContain('WHEN attempt_count < max_attempts THEN $7')
    expect(
      calls.find((call) =>
        call.sql.includes('UPDATE triage_long_packet_runs'),
      )?.sql,
    ).toContain("status = 'running'")
    const extractionFailure = calls.find((call) =>
      call.sql.includes('UPDATE triage_extractions'),
    )
    expect(extractionFailure?.sql).toContain("status = 'error'")
    expect(extractionFailure?.sql).not.toContain('model_map_result =')
    expect(JSON.stringify(extractionFailure?.values)).toContain(
      'timed out before producing a validated result',
    )
    expect(calls.some((call) => call.sql === 'COMMIT')).toBe(true)
  })

  it('marks the extraction error when a finalizer exhausts attempts while preserving evidence columns', async () => {
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_long_packet_finalization_jobs/.test(sql)) {
        return result(
          [
            {
              id: 'final-1',
              run_id: 'run-1',
              status: 'failed',
              attempt_count: 3,
              max_attempts: 3,
            },
          ],
          1,
        )
      }
      if (/UPDATE triage_long_packet_runs/.test(sql)) {
        return result([{ id: 'run-1', extraction_id: 'extraction-1' }], 1)
      }
      if (/UPDATE triage_extractions/.test(sql)) {
        return result([{ id: 'extraction-1' }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool, {
      now: () => new Date('2026-07-11T12:00:00.000Z'),
    })

    await service.failFinalizationJob({
      jobId: 'final-1',
      tenantId: 'tenant-1',
      leaseToken: '05240000-0000-4000-8000-000000000001',
      error: new Error('synthetic invalid result schema'),
    })

    const extractionFailure = calls.find((call) =>
      call.sql.includes('UPDATE triage_extractions'),
    )
    expect(extractionFailure?.sql).toContain("status = 'error'")
    expect(extractionFailure?.sql).not.toContain('packet_emergency_result =')
    expect(extractionFailure?.sql).not.toContain('model_reduce_result =')
    expect(calls.some((call) => call.sql === 'COMMIT')).toBe(true)
  })

  it('uses the authoritative parent failure detail when concurrent terminal jobs race', async () => {
    const authoritativeDetail =
      'The model service was unavailable before a validated result was produced.'
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_long_packet_chunk_jobs/.test(sql)) {
        return result(
          [
            {
              id: 'job-2',
              run_id: 'run-1',
              status: 'failed',
              attempt_count: 3,
              max_attempts: 3,
            },
          ],
          1,
        )
      }
      if (/UPDATE triage_long_packet_runs/.test(sql)) return result([], 0)
      if (/SELECT id, extraction_id/.test(sql)) {
        return result([
          {
            id: 'run-1',
            extraction_id: 'extraction-1',
            last_error_detail: authoritativeDetail,
          },
        ])
      }
      if (/UPDATE triage_extractions/.test(sql)) {
        return result([{ id: 'extraction-1' }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool)

    await service.failChunkJob({
      jobId: 'job-2',
      tenantId: 'tenant-1',
      leaseToken: '05240000-0000-4000-8000-000000000002',
      error: new Error('synthetic timeout'),
    })

    const extractionFailure = calls.find((call) =>
      call.sql.includes('UPDATE triage_extractions'),
    )
    expect(extractionFailure?.values).toContain(authoritativeDetail)
    expect(extractionFailure?.values).not.toContain(
      'The model worker timed out before producing a validated result.',
    )
  })

  it('atomically completes finalization, run, and extraction, rolling all back if extraction finalization loses its predicate', async () => {
    const fixture = await durableSafetyFixture()
    const { pool, calls, release } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_long_packet_finalization_jobs/.test(sql)) {
        return result([{ id: 'final-1', run_id: 'run-1' }], 1)
      }
      if (/UPDATE triage_long_packet_runs/.test(sql)) {
        return result([{ id: 'run-1', extraction_id: 'extraction-1' }], 1)
      }
      if (/SELECT[\s\S]+FROM triage_extractions/.test(sql)) {
        return result([{
          id: 'extraction-1',
          status: 'pending',
          source_sha256: fixture.artifacts.sourceSha256,
          packet_plan: fixture.artifacts.plan,
          safety_prompt_versions:
            LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
          model_reduce_result: null,
        }], 1)
      }
      if (/UPDATE triage_extractions/.test(sql)) return result([], 0)
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool, {
      now: () => new Date('2026-07-11T12:00:00.000Z'),
    })

    await expect(
      service.completeFinalizationJob({
        jobId: 'final-1',
        tenantId: 'tenant-1',
        leaseToken: '05240000-0000-4000-8000-000000000001',
        result: fixture.emergencyPipeline,
        extraction: successfulFinalizedExtraction(
          fixture.artifacts.plan,
          fixture.emergencyPipeline,
        ),
      }),
    ).rejects.toMatchObject({ code: 'persistence_failed' })
    expect(calls.some((call) => call.sql === 'ROLLBACK')).toBe(true)
    expect(calls.some((call) => call.sql === 'COMMIT')).toBe(false)
    expect(
      calls.find((call) =>
        call.sql.includes('UPDATE triage_long_packet_finalization_jobs'),
      )?.sql,
    ).toContain('lease_token = $3')
    expect(
      calls.find((call) =>
        call.sql.includes('UPDATE triage_long_packet_runs'),
      )?.sql,
    ).toContain("run.status = 'running'")
    expect(
      calls.find((call) => call.sql.includes('UPDATE triage_extractions'))?.sql,
    ).toContain("extraction.status IN ('pending', 'error')")
    expect(
      calls.find((call) =>
        /SELECT[\s\S]+FROM triage_extractions/.test(call.sql),
      )?.sql,
    ).toContain('FOR UPDATE')
    expect(
      calls.find((call) => call.sql.includes('UPDATE triage_extractions'))?.sql,
    ).toContain("model_reduce_result->>'kind'")
    expect(release).toHaveBeenCalledOnce()
  })

  it('terminally completes computation but persists incomplete reduction as an extraction error', async () => {
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_long_packet_finalization_jobs/.test(sql)) {
        return result([{ id: 'final-1', run_id: 'run-1' }], 1)
      }
      if (/UPDATE triage_long_packet_runs/.test(sql)) {
        return result([{ id: 'run-1', extraction_id: 'extraction-1' }], 1)
      }
      if (/SELECT[\s\S]+FROM triage_extractions/.test(sql)) {
        return result([{
          id: 'extraction-1',
          status: 'pending',
          source_sha256: null,
          packet_plan: null,
          safety_prompt_versions: { pipeline: 'pipeline-v1' },
          model_reduce_result: null,
        }], 1)
      }
      if (/UPDATE triage_extractions/.test(sql)) {
        return result([{ id: 'extraction-1' }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool, {
      now: () => new Date('2026-07-11T12:00:00.000Z'),
    })

    await service.completeFinalizationJob({
      jobId: 'final-1',
      tenantId: 'tenant-1',
      leaseToken: '05240000-0000-4000-8000-000000000001',
      result: { status: 'partial', coverageStatus: 'partial' },
      extraction: {
        outcome: 'error',
        modelMapResult: {
          status: 'partial',
          expectedChunkCount: 2,
          completedChunkCount: 1,
        },
        safetyPromptVersions: { pipeline: 'pipeline-v1' },
        safetyScreenedAt: new Date('2026-07-11T11:59:00.000Z'),
      },
    })

    const extractionMutation = calls.find((call) =>
      call.sql.includes('UPDATE triage_extractions'),
    )
    expect(extractionMutation?.sql).toContain("status = 'error'")
    expect(extractionMutation?.sql).toContain("model_reduce_result->>'kind'")
    expect(extractionMutation?.sql).toContain('note_type_detected = NULL')
    expect(extractionMutation?.sql).toContain('key_findings = NULL')
    expect(JSON.stringify(extractionMutation?.values)).toContain(
      'Partial evidence was preserved',
    )
    expect(calls.some((call) => call.sql === 'COMMIT')).toBe(true)
  })

  it('replaces a locked safety checkpoint only with a complete pipeline containing its exact projection', async () => {
    const fixture = await durableSafetyFixture()
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_long_packet_finalization_jobs/.test(sql)) {
        return result([{ id: 'final-1', run_id: 'run-1' }], 1)
      }
      if (/UPDATE triage_long_packet_runs/.test(sql)) {
        return result([{ id: 'run-1', extraction_id: 'extraction-1' }], 1)
      }
      if (/SELECT[\s\S]+FROM triage_extractions/.test(sql)) {
        return result([{
          id: 'extraction-1',
          status: 'pending',
          source_sha256: fixture.artifacts.sourceSha256,
          packet_plan: fixture.artifacts.plan,
          safety_prompt_versions:
            LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
          model_reduce_result: fixture.checkpoint,
        }], 1)
      }
      if (/UPDATE triage_extractions/.test(sql)) {
        return result([{ id: 'extraction-1' }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool)

    await service.completeFinalizationJob({
      jobId: 'final-1',
      tenantId: 'tenant-1',
      leaseToken: '05240000-0000-4000-8000-000000000001',
      result: fixture.emergencyPipeline,
      extraction: successfulFinalizedExtraction(
        fixture.artifacts.plan,
        fixture.emergencyPipeline,
      ),
    })

    expect(
      calls.find((call) =>
        /SELECT[\s\S]+FROM triage_extractions/.test(call.sql),
      )?.sql,
    ).toContain('FOR UPDATE')
    expect(calls.some((call) => call.sql === 'COMMIT')).toBe(true)
  })

  it('accepts only the byte-identical full pipeline already staged by the atomic safety workflow', async () => {
    const fixture = await durableSafetyFixture()
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_long_packet_finalization_jobs/.test(sql)) {
        return result([{ id: 'final-1', run_id: 'run-1' }], 1)
      }
      if (/UPDATE triage_long_packet_runs/.test(sql)) {
        return result([{ id: 'run-1', extraction_id: 'extraction-1' }], 1)
      }
      if (/SELECT[\s\S]+FROM triage_extractions/.test(sql)) {
        return result([{
          id: 'extraction-1',
          status: 'pending',
          source_sha256: fixture.artifacts.sourceSha256,
          packet_plan: fixture.artifacts.plan,
          safety_prompt_versions:
            LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
          model_map_result: fixture.emergencyPipeline.mapperCoverage,
          model_reduce_result: fixture.emergencyPipeline,
        }], 1)
      }
      if (/UPDATE triage_extractions/.test(sql)) {
        return result([{ id: 'extraction-1' }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool)

    await service.completeFinalizationJob({
      jobId: 'final-1',
      tenantId: 'tenant-1',
      leaseToken: '05240000-0000-4000-8000-000000000001',
      result: fixture.emergencyPipeline,
      extraction: successfulFinalizedExtraction(
        fixture.artifacts.plan,
        fixture.emergencyPipeline,
      ),
    })

    expect(calls.some((call) => call.sql === 'COMMIT')).toBe(true)
    expect(
      calls.find((call) => call.sql.includes('UPDATE triage_extractions'))
        ?.sql,
    ).toContain("status = 'complete'")
  })

  it('rolls back durable success when caller-supplied clinical fields differ from the canonical source-bound extraction', async () => {
    const fixture = await durableSafetyFixture()
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_long_packet_finalization_jobs/.test(sql)) {
        return result([{ id: 'final-1', run_id: 'run-1' }], 1)
      }
      if (/UPDATE triage_long_packet_runs/.test(sql)) {
        return result([{ id: 'run-1', extraction_id: 'extraction-1' }], 1)
      }
      if (/SELECT[\s\S]+FROM triage_extractions/.test(sql)) {
        return result([{
          id: 'extraction-1',
          status: 'pending',
          source_sha256: fixture.artifacts.sourceSha256,
          packet_plan: fixture.artifacts.plan,
          safety_prompt_versions:
            LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
          model_map_result: fixture.emergencyPipeline.mapperCoverage,
          model_reduce_result: fixture.emergencyPipeline,
        }], 1)
      }
      if (/UPDATE triage_extractions/.test(sql)) {
        return result([{ id: 'extraction-1' }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool)
    const extraction = successfulFinalizedExtraction(
      fixture.artifacts.plan,
      fixture.emergencyPipeline,
    )

    await expect(
      service.completeFinalizationJob({
        jobId: 'final-1',
        tenantId: 'tenant-1',
        leaseToken: '05240000-0000-4000-8000-000000000001',
        result: fixture.emergencyPipeline,
        extraction: {
          ...extraction,
          keyFindings: {
            ...extraction.keyFindings,
            timeline: `${extraction.keyFindings.timeline}\nForged caller addition.`,
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'persistence_failed' })
    expect(calls.some((call) => call.sql === 'ROLLBACK')).toBe(true)
    expect(
      calls.some((call) => call.sql.includes('UPDATE triage_extractions')),
    ).toBe(false)
  })

  it('accepts the byte-identical narrative-failure aggregate staged by its atomic safety workflow', async () => {
    const fixture = await durableSafetyFixture()
    const staged = fixture.narrativeFailurePipeline
    expect(staged).toMatchObject({
      status: 'partial',
      coverageStatus: 'partial',
      carePathway: 'emergency_now',
      failureCodes: ['narrative_reducer_failed'],
    })
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_long_packet_finalization_jobs/.test(sql)) {
        return result([{ id: 'final-1', run_id: 'run-1' }], 1)
      }
      if (/UPDATE triage_long_packet_runs/.test(sql)) {
        return result([{ id: 'run-1', extraction_id: 'extraction-1' }], 1)
      }
      if (/SELECT[\s\S]+FROM triage_extractions/.test(sql)) {
        return result([{
          id: 'extraction-1',
          status: 'error',
          source_sha256: fixture.artifacts.sourceSha256,
          packet_plan: fixture.artifacts.plan,
          safety_prompt_versions:
            LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
          model_map_result: staged.mapperCoverage,
          model_reduce_result: staged,
        }], 1)
      }
      if (/UPDATE triage_extractions/.test(sql)) {
        return result([{ id: 'extraction-1' }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool)

    await service.completeFinalizationJob({
      jobId: 'final-1',
      tenantId: 'tenant-1',
      leaseToken: '05240000-0000-4000-8000-000000000001',
      result: staged,
      extraction: {
        outcome: 'error',
        modelMapResult: staged.mapperCoverage,
        safetyPromptVersions:
          LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
        safetyScreenedAt: new Date('2026-07-11T11:59:00.000Z'),
      },
    })

    expect(calls.some((call) => call.sql === 'COMMIT')).toBe(true)
    expect(
      calls.find((call) => call.sql.includes('UPDATE triage_extractions'))
        ?.sql,
    ).toContain("status = 'error'")
  })

  it('rolls back job, run, and extraction when a complete replacement omits a checkpoint projection', async () => {
    const fixture = await durableSafetyFixture()
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_long_packet_finalization_jobs/.test(sql)) {
        return result([{ id: 'final-1', run_id: 'run-1' }], 1)
      }
      if (/UPDATE triage_long_packet_runs/.test(sql)) {
        return result([{ id: 'run-1', extraction_id: 'extraction-1' }], 1)
      }
      if (/SELECT[\s\S]+FROM triage_extractions/.test(sql)) {
        return result([{
          id: 'extraction-1',
          status: 'pending',
          source_sha256: fixture.artifacts.sourceSha256,
          packet_plan: fixture.artifacts.plan,
          safety_prompt_versions:
            LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
          model_reduce_result: fixture.checkpoint,
        }], 1)
      }
      if (/UPDATE triage_extractions/.test(sql)) {
        return result([{ id: 'extraction-1' }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool)

    await expect(
      service.completeFinalizationJob({
        jobId: 'final-1',
        tenantId: 'tenant-1',
        leaseToken: '05240000-0000-4000-8000-000000000001',
        result: fixture.routinePipeline,
        extraction: successfulFinalizedExtraction(
          fixture.artifacts.plan,
          fixture.routinePipeline,
        ),
      }),
    ).rejects.toMatchObject({ code: 'persistence_failed' })
    expect(calls.some((call) => call.sql === 'ROLLBACK')).toBe(true)
    expect(
      calls.some((call) => call.sql.includes('UPDATE triage_extractions')),
    ).toBe(false)
  })

  it('preserves a checkpoint artifact when durable finalization is incomplete', async () => {
    const fixture = await durableSafetyFixture()
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_long_packet_finalization_jobs/.test(sql)) {
        return result([{ id: 'final-1', run_id: 'run-1' }], 1)
      }
      if (/UPDATE triage_long_packet_runs/.test(sql)) {
        return result([{ id: 'run-1', extraction_id: 'extraction-1' }], 1)
      }
      if (/SELECT[\s\S]+FROM triage_extractions/.test(sql)) {
        return result([{
          id: 'extraction-1',
          status: 'pending',
          source_sha256: fixture.artifacts.sourceSha256,
          packet_plan: fixture.artifacts.plan,
          safety_prompt_versions:
            LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
          model_reduce_result: fixture.checkpoint,
        }], 1)
      }
      if (/UPDATE triage_extractions/.test(sql)) {
        return result([{ id: 'extraction-1' }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool)

    await service.completeFinalizationJob({
      jobId: 'final-1',
      tenantId: 'tenant-1',
      leaseToken: '05240000-0000-4000-8000-000000000001',
      result: { status: 'partial', coverageStatus: 'partial' },
      extraction: {
        outcome: 'error',
        modelMapResult: { status: 'partial' },
        safetyPromptVersions: LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
        safetyScreenedAt: new Date('2026-07-11T11:59:00.000Z'),
      },
    })

    const mutation = calls.find((call) =>
      call.sql.includes('UPDATE triage_extractions'),
    )
    expect(mutation?.sql).toContain(
      "THEN extraction.model_reduce_result",
    )
    expect(calls.some((call) => call.sql === 'COMMIT')).toBe(true)
  })

  it('terminalizes a failed aggregate workflow with the validated complete pipeline instead of a lower partial checkpoint', async () => {
    const fixture = await durableSafetyFixture()
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_long_packet_finalization_jobs/.test(sql)) {
        return result([{ id: 'final-1', run_id: 'run-1' }], 1)
      }
      if (/UPDATE triage_long_packet_runs/.test(sql)) {
        return result([{ id: 'run-1', extraction_id: 'extraction-1' }], 1)
      }
      if (/SELECT[\s\S]+FROM triage_extractions/.test(sql)) {
        return result([{
          id: 'extraction-1',
          status: 'pending',
          source_sha256: fixture.artifacts.sourceSha256,
          packet_plan: fixture.artifacts.plan,
          safety_prompt_versions:
            LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
          model_reduce_result: fixture.checkpoint,
        }], 1)
      }
      if (/UPDATE triage_extractions/.test(sql)) {
        return result([{ id: 'extraction-1' }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool)

    await service.completeFinalizationJob({
      jobId: 'final-1',
      tenantId: 'tenant-1',
      leaseToken: '05240000-0000-4000-8000-000000000001',
      result: fixture.emergencyPipeline,
      extraction: {
        outcome: 'error',
        terminalReason: 'safety_workflow_persistence_failed',
        modelMapResult: fixture.emergencyPipeline.mapperCoverage,
        safetyPromptVersions: LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
        safetyScreenedAt: new Date('2026-07-11T11:59:00.000Z'),
      },
    })

    const mutation = calls.find((call) =>
      call.sql.includes('UPDATE triage_extractions'),
    )
    expect(mutation?.sql).toContain('$10::boolean = false')
    expect(mutation?.values?.[9]).toBe(true)
    expect(calls.some((call) => call.sql === 'COMMIT')).toBe(true)
  })

  it('blocks replacement of an absorbing workflow-persistence-failed audit even while the row is pending', async () => {
    const fixture = await durableSafetyFixture()
    const terminal = mergeLongPacketPartialSafetyHold({
      plan: fixture.artifacts.plan,
      sourceSha256: fixture.artifacts.sourceSha256,
      safetyPromptVersions: LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
      existing: fixture.checkpoint,
      mode: 'workflow_persistence_failed',
      projection: {
        outcome: fixture.emergencyPipeline.safetyOutcomes[0],
        modelProfile:
          LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS.safetyExtractorModel,
        promptVersion:
          LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS.safetyExtractor,
        pipelineVersion: fixture.emergencyPipeline.version,
      },
    })
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_long_packet_finalization_jobs/.test(sql)) {
        return result([{ id: 'final-1', run_id: 'run-1' }], 1)
      }
      if (/UPDATE triage_long_packet_runs/.test(sql)) {
        return result([{ id: 'run-1', extraction_id: 'extraction-1' }], 1)
      }
      if (/SELECT[\s\S]+FROM triage_extractions/.test(sql)) {
        return result([{
          id: 'extraction-1',
          status: 'pending',
          source_sha256: fixture.artifacts.sourceSha256,
          packet_plan: fixture.artifacts.plan,
          safety_prompt_versions:
            LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
          model_reduce_result: terminal,
        }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool)

    await expect(
      service.completeFinalizationJob({
        jobId: 'final-1',
        tenantId: 'tenant-1',
        leaseToken: '05240000-0000-4000-8000-000000000001',
        result: fixture.emergencyPipeline,
        extraction: successfulFinalizedExtraction(
          fixture.artifacts.plan,
          fixture.emergencyPipeline,
        ),
      }),
    ).rejects.toMatchObject({ code: 'persistence_failed' })
    expect(calls.some((call) => call.sql === 'ROLLBACK')).toBe(true)
    expect(
      calls.some((call) => call.sql.includes('UPDATE triage_extractions')),
    ).toBe(false)
  })

  it('rolls back when finalized prompt provenance differs from the full locked artifact', async () => {
    const lockedPromptVersions = {
      pipeline: 'pipeline-v1',
      planner: 'planner-v1',
      narrativeReducer: 'reducer-v1',
    }
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_long_packet_finalization_jobs/.test(sql)) {
        return result([{ id: 'final-1', run_id: 'run-1' }], 1)
      }
      if (/UPDATE triage_long_packet_runs/.test(sql)) {
        return result([{ id: 'run-1', extraction_id: 'extraction-1' }], 1)
      }
      if (/SELECT[\s\S]+FROM triage_extractions/.test(sql)) {
        return result([{
          id: 'extraction-1',
          status: 'pending',
          source_sha256: null,
          packet_plan: null,
          safety_prompt_versions: lockedPromptVersions,
          model_reduce_result: null,
        }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool)

    await expect(
      service.completeFinalizationJob({
        jobId: 'final-1',
        tenantId: 'tenant-1',
        leaseToken: '05240000-0000-4000-8000-000000000001',
        result: { status: 'completed', coverageStatus: 'complete' },
        extraction: {
          outcome: 'success',
          noteTypeDetected: 'unknown',
          extractionConfidence: 'high',
          extractedSummary: 'Must not persist.',
          keyFindings: {
            chief_complaint: '',
            neurological_symptoms: [],
            timeline: '',
            relevant_history: '',
            medications_and_therapies: [],
            failed_therapies: [],
            imaging_results: [],
            red_flags_noted: [],
            functional_status: '',
          },
          modelMapResult: { status: 'complete' },
          safetyPromptVersions: {
            ...lockedPromptVersions,
            narrativeReducer: 'reducer-drifted',
          },
          safetyScreenedAt: new Date('2026-07-11T11:59:00.000Z'),
        },
      }),
    ).rejects.toMatchObject({ code: 'persistence_failed' })
    expect(calls.some((call) => call.sql === 'ROLLBACK')).toBe(true)
    expect(
      calls.some((call) => call.sql.includes('UPDATE triage_extractions')),
    ).toBe(false)
  })

  it('rolls back a malformed successful pipeline even when no checkpoint exists', async () => {
    const fixture = await durableSafetyFixture()
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_long_packet_finalization_jobs/.test(sql)) {
        return result([{ id: 'final-1', run_id: 'run-1' }], 1)
      }
      if (/UPDATE triage_long_packet_runs/.test(sql)) {
        return result([{ id: 'run-1', extraction_id: 'extraction-1' }], 1)
      }
      if (/SELECT[\s\S]+FROM triage_extractions/.test(sql)) {
        return result([{
          id: 'extraction-1',
          status: 'pending',
          source_sha256: fixture.artifacts.sourceSha256,
          packet_plan: fixture.artifacts.plan,
          safety_prompt_versions:
            LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS,
          model_reduce_result: null,
        }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool)

    await expect(
      service.completeFinalizationJob({
        jobId: 'final-1',
        tenantId: 'tenant-1',
        leaseToken: '05240000-0000-4000-8000-000000000001',
        result: { status: 'completed', coverageStatus: 'complete' },
        extraction: successfulFinalizedExtraction(
          fixture.artifacts.plan,
          fixture.emergencyPipeline,
        ),
      }),
    ).rejects.toMatchObject({ code: 'persistence_failed' })
    expect(calls.some((call) => call.sql === 'ROLLBACK')).toBe(true)
    expect(
      calls.some((call) => call.sql.includes('UPDATE triage_extractions')),
    ).toBe(false)
  })

  it('rejects a success extraction outcome for a partial or failed reduction', async () => {
    const { pool, query } = mockTransactionalPool(() => result())
    const service = createPostgresLongPacketDurableWorkService(pool)

    await expect(
      service.completeFinalizationJob({
        jobId: 'final-1',
        tenantId: 'tenant-1',
        leaseToken: '05240000-0000-4000-8000-000000000001',
        result: { status: 'partial', coverageStatus: 'partial' },
        extraction: {
          outcome: 'success',
          noteTypeDetected: 'unknown',
          extractionConfidence: 'high',
          extractedSummary: 'Must not be persisted.',
          keyFindings: extractionRow.packet_plan as never,
          modelMapResult: { status: 'partial' },
          safetyPromptVersions: { pipeline: 'pipeline-v1' },
          safetyScreenedAt: new Date('2026-07-11T11:59:00.000Z'),
        },
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    expect(query).not.toHaveBeenCalled()
  })

  it('claims finalization only behind complete mapper and safety coverage', async () => {
    const { pool, calls } = mockDirectPool(() => result([], 0))
    const service = createPostgresLongPacketDurableWorkService(pool)

    await service.claimFinalizationJob({
      tenantId: 'tenant-1',
      workerId: 'finalizer-1',
      leaseDurationMs: 60_000,
    })

    expect(calls[0].sql).toContain("chunk.branch = 'mapper'")
    expect(calls[0].sql).toContain("chunk.branch = 'safety'")
    expect(calls[0].sql).toContain("chunk.status = 'complete'")
    expect(calls[0].sql).toContain('FOR UPDATE OF job SKIP LOCKED')
  })

  it('reads only a complete, exact 2N outcome set and verifies every result digest', async () => {
    const mapperResult = { status: 'completed', facts: [] }
    const safetyResult = { carePathway: 'no_time_critical_signal', signals: [] }
    const rows = plan.chunks.flatMap((chunk) => [
      {
        chunk_id: chunk.id,
        branch: 'mapper',
        status: 'complete',
        configuration_sha256: 'c'.repeat(64),
        source_sha256: 'a'.repeat(64),
        plan_sha256: 'b'.repeat(64),
        planner_version: configuration.plannerVersion,
        pipeline_version: configuration.pipelineVersion,
        result: mapperResult,
        result_sha256: hashLongPacketResult('mapper', mapperResult),
        chunk_provenance_sha256: chunk.provenanceSha256,
        model_id: configuration.mapperModelId,
        prompt_version: configuration.mapperPromptVersion,
      },
      {
        chunk_id: chunk.id,
        branch: 'safety',
        status: 'complete',
        configuration_sha256: 'c'.repeat(64),
        source_sha256: 'a'.repeat(64),
        plan_sha256: 'b'.repeat(64),
        planner_version: configuration.plannerVersion,
        pipeline_version: configuration.pipelineVersion,
        result: safetyResult,
        result_sha256: hashLongPacketResult('safety', safetyResult),
        chunk_provenance_sha256: chunk.provenanceSha256,
        model_id: configuration.safetyModelId,
        prompt_version: configuration.safetyPromptVersion,
      },
    ])
    const { pool } = mockDirectPool((sql) => {
      if (/FROM triage_long_packet_runs run/.test(sql)) {
        return result([
          {
            id: 'run-1',
            tenant_id: 'tenant-1',
            expected_chunk_count: 2,
            packet_plan: plan,
            configuration_sha256: 'c'.repeat(64),
            source_sha256: 'a'.repeat(64),
            plan_sha256: 'b'.repeat(64),
            planner_version: configuration.plannerVersion,
            pipeline_version: configuration.pipelineVersion,
            mapper_model_id: configuration.mapperModelId,
            mapper_prompt_version: configuration.mapperPromptVersion,
            safety_model_id: configuration.safetyModelId,
            safety_prompt_version: configuration.safetyPromptVersion,
          },
        ])
      }
      if (/FROM triage_long_packet_chunk_jobs/.test(sql)) return result(rows)
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool)

    const outcomes = await service.readCompletedChunkOutcomes({
      runId: 'run-1',
      tenantId: 'tenant-1',
    })

    expect(outcomes.mapper).toHaveLength(2)
    expect(outcomes.safety).toHaveLength(2)
  })

  it('fails closed when a persisted completed result hash is inconsistent', async () => {
    const { pool } = mockDirectPool((sql) => {
      if (/FROM triage_long_packet_runs run/.test(sql)) {
        return result([
          {
            id: 'run-1',
            tenant_id: 'tenant-1',
            expected_chunk_count: 1,
            packet_plan: { ...plan, chunks: [plan.chunks[0]] },
            configuration_sha256: 'c'.repeat(64),
            source_sha256: 'a'.repeat(64),
            plan_sha256: 'b'.repeat(64),
            planner_version: configuration.plannerVersion,
            pipeline_version: configuration.pipelineVersion,
            mapper_model_id: configuration.mapperModelId,
            mapper_prompt_version: configuration.mapperPromptVersion,
            safety_model_id: configuration.safetyModelId,
            safety_prompt_version: configuration.safetyPromptVersion,
          },
        ])
      }
      return result([
        {
          chunk_id: 'chunk-1',
          branch: 'mapper',
          status: 'complete',
          configuration_sha256: 'c'.repeat(64),
          source_sha256: 'a'.repeat(64),
          plan_sha256: 'b'.repeat(64),
          planner_version: configuration.plannerVersion,
          pipeline_version: configuration.pipelineVersion,
          result: { status: 'completed' },
          result_sha256: '0'.repeat(64),
          chunk_provenance_sha256: 'd'.repeat(64),
          model_id: configuration.mapperModelId,
          prompt_version: configuration.mapperPromptVersion,
        },
        {
          chunk_id: 'chunk-1',
          branch: 'safety',
          status: 'complete',
          configuration_sha256: 'c'.repeat(64),
          source_sha256: 'a'.repeat(64),
          plan_sha256: 'b'.repeat(64),
          planner_version: configuration.plannerVersion,
          pipeline_version: configuration.pipelineVersion,
          result: { status: 'completed' },
          result_sha256: '0'.repeat(64),
          chunk_provenance_sha256: 'd'.repeat(64),
          model_id: configuration.safetyModelId,
          prompt_version: configuration.safetyPromptVersion,
        },
      ])
    })
    const service = createPostgresLongPacketDurableWorkService(pool)

    await expect(
      service.readCompletedChunkOutcomes({ runId: 'run-1', tenantId: 'tenant-1' }),
    ).rejects.toBeInstanceOf(LongPacketDurableWorkError)
  })
})

describe('sql type safety', () => {
  it('pins the next_retry_at bind parameter to timestamptz inside the bare CASE...THEN', async () => {
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_long_packet_chunk_jobs/.test(sql)) {
        return result(
          [
            {
              id: 'job-1',
              run_id: 'run-1',
              status: 'failed',
              attempt_count: 1,
              max_attempts: 3,
            },
          ],
          1,
        )
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const service = createPostgresLongPacketDurableWorkService(pool, {
      now: () => new Date('2026-07-11T12:00:00.000Z'),
    })

    await service.failChunkJob({
      jobId: 'job-1',
      tenantId: 'tenant-1',
      leaseToken: '05240000-0000-4000-8000-000000000001',
      error: new Error('synthetic timeout'),
      nextRetryAt: new Date('2026-07-11T12:01:00.000Z'),
    })

    const failureMutation = calls.find((call) =>
      call.sql.includes('UPDATE triage_long_packet_chunk_jobs'),
    )
    expect(failureMutation?.sql).toContain('$7::timestamptz')
  })
})
