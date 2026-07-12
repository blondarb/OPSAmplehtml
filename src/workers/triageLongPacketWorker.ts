import type { Context, SQSEvent, SQSBatchResponse } from 'aws-lambda'

import { getPool } from '@/lib/db'
import type { PersistableEmergencyGatewayResult } from '@/lib/triage/gatewayPersistence'
import { hashLongPacketPlan } from '@/lib/triage/longPacketCanonicalHash'
import {
  LONG_PACKET_CLINICAL_MAPPER_PROMPT_VERSION,
} from '@/lib/triage/longPacketClinicalMapper'
import {
  createPostgresLongPacketDurableWorkService,
  type ClaimedLongPacketJob,
  type FinalizedExtractionPersistence,
} from '@/lib/triage/longPacketDurableWork'
import { LONG_PACKET_EMERGENCY_VERSION } from '@/lib/triage/longPacketEmergency'
import {
  longPacketPipelineToPersistedClinicalExtraction,
  validateLongPacketFullPipelinePromptBindings,
} from '@/lib/triage/longPacketIngestion'
import {
  LONG_PACKET_MODEL_PIPELINE_VERSION,
  LONG_PACKET_NARRATIVE_REDUCER_MODEL,
  LONG_PACKET_NARRATIVE_REDUCER_PROMPT_VERSION,
  reduceLongPacketModelOutcomes,
  runLongPacketChunkBranch,
  validatePersistedLongPacketAggregateSafety,
  validatePersistedLongPacketModelPipeline,
  type LongPacketChunkBranchOutcome,
  type LongPacketMapperBranchOutcome,
  type LongPacketModelPipelineResult,
  type LongPacketSafetyBranchOutcome,
} from '@/lib/triage/longPacketModelPipeline'
import {
  LONG_PACKET_PLANNER_VERSION,
  type LongPacketChunk,
  type LongPacketPlan,
} from '@/lib/triage/longPacketPlanner'
import {
  deriveLongPacketPipelineSafetyResult,
  persistLongPacketSafetyEscalation,
  type LongPacketSafetyEscalationResult,
} from '@/lib/triage/longPacketSafetyEscalation'
import {
  deriveLongPacketMapperSafetyFloor,
  persistLongPacketPartialSafetyHold,
  validateLongPacketPartialSafetyHold,
} from '@/lib/triage/longPacketPartialSafetyHold'
import { resolveTriageModelRegistry } from '@/lib/triage/modelRegistry'
import {
  MODEL_SAFETY_EXTRACTION_PROMPT_VERSION,
} from '@/lib/triage/modelSafetyExtractor'
import { runClinicalModelWithTimeout } from '@/lib/triage/modelTimeout'
import type { ValidatedModelSafetyExtraction } from '@/lib/triage/modelSafetyExtraction'
import type { LongPacketWorkMessage } from './triageLongPacketMessage'
import {
  processLongPacketSqsEvent,
  type ClaimedLongPacketWork,
  type LongPacketWorkerDependencies,
} from './triageLongPacketWorkerCore'

const CHUNK_DEADLINE_MS = 90_000
const FINALIZER_DEADLINE_MS = 240_000
const DEFAULT_LEASE_SECONDS = 360
const MIN_LEASE_SECONDS = 300

async function persistLongPacketSafetyEscalationFailClosed(
  input: Parameters<typeof persistLongPacketSafetyEscalation>[0],
): Promise<LongPacketSafetyEscalationResult> {
  try {
    return await persistLongPacketSafetyEscalation(input)
  } catch {
    console.error(
      '[triage/long-packet-worker] safety escalation rejected unexpectedly',
    )
    return { ok: false, reason: 'persistence_failed' }
  }
}

interface RuntimeClaim extends ClaimedLongPacketWork {
  durable: ClaimedLongPacketJob
}

interface ChunkExecutionResult {
  executionKind: 'chunk'
  outcome: LongPacketChunkBranchOutcome
  context: {
    extractionId: string
    tenantId: string
    chunkId: string
    branch: 'mapper' | 'safety'
    modelId: string
    promptVersion: string
    pipelineVersion: string
    plan: LongPacketPlan
    sourceSha256: string
  }
}

interface FinalizerExecutionResult {
  executionKind: 'finalize'
  pipeline: LongPacketModelPipelineResult
  extraction: FinalizedExtractionPersistence
  context: {
    extractionId: string
    tenantId: string
    runId: string
    plan: LongPacketPlan
    sourceSha256: string
    modelId: string
    promptVersion: string
    plannerVersion: string
    pipelineVersion: string
  }
}

type RuntimeExecutionResult = ChunkExecutionResult | FinalizerExecutionResult

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Durable ${field} binding is unavailable.`)
  }
  return value
}

function leaseDurationMs(): number {
  const raw = process.env.TRIAGE_LONG_PACKET_LEASE_SECONDS
  const seconds = raw ? Number(raw) : DEFAULT_LEASE_SECONDS
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < MIN_LEASE_SECONDS ||
    seconds > 900
  ) {
    throw new Error('Durable work lease configuration is invalid.')
  }
  return seconds * 1_000
}

function runtimeSafetyPromptVersions() {
  const models = resolveTriageModelRegistry()
  return {
    planner: LONG_PACKET_PLANNER_VERSION,
    deterministicEmergency: LONG_PACKET_EMERGENCY_VERSION,
    clinicalMapper: LONG_PACKET_CLINICAL_MAPPER_PROMPT_VERSION,
    safetyExtractor: MODEL_SAFETY_EXTRACTION_PROMPT_VERSION,
    narrativeReducer: LONG_PACKET_NARRATIVE_REDUCER_PROMPT_VERSION,
    clinicalMapperModel: models.longPacketMapper,
    safetyExtractorModel: models.safetyExtractor,
    narrativeReducerModel: LONG_PACKET_NARRATIVE_REDUCER_MODEL,
  }
}

export function buildFinalizedExtractionPersistence(input: {
  pipeline: LongPacketModelPipelineResult
  packetEmergencyResult: PersistableEmergencyGatewayResult
  safetyPromptVersions?: Record<string, string>
  safetyScreenedAt?: Date
}): FinalizedExtractionPersistence {
  const common = {
    modelMapResult: input.pipeline.mapperCoverage,
    safetyPromptVersions:
      input.safetyPromptVersions ?? runtimeSafetyPromptVersions(),
    safetyScreenedAt: input.safetyScreenedAt ?? new Date(),
  }
  if (
    input.pipeline.status !== 'completed' ||
    input.pipeline.coverageStatus !== 'complete'
  ) {
    return { outcome: 'error', ...common }
  }

  const clinical = longPacketPipelineToPersistedClinicalExtraction({
    pipeline: input.pipeline,
    deterministicGateway: input.packetEmergencyResult,
  })
  return {
    outcome: 'success',
    ...common,
    noteTypeDetected: clinical.noteTypeDetected,
    extractionConfidence: clinical.extractionConfidence,
    extractedSummary: clinical.extractedSummary,
    keyFindings: clinical.keyFindings,
  }
}

function assertCurrentChunkConfiguration(context: {
  branch: 'mapper' | 'safety'
  modelId: string
  promptVersion: string
  plannerVersion: string
  pipelineVersion: string
}) {
  const models = resolveTriageModelRegistry()
  const expectedModel =
    context.branch === 'mapper'
      ? models.longPacketMapper
      : models.safetyExtractor
  const expectedPrompt =
    context.branch === 'mapper'
      ? LONG_PACKET_CLINICAL_MAPPER_PROMPT_VERSION
      : MODEL_SAFETY_EXTRACTION_PROMPT_VERSION
  if (
    context.modelId !== expectedModel ||
    context.promptVersion !== expectedPrompt ||
    context.plannerVersion !== LONG_PACKET_PLANNER_VERSION ||
    context.pipelineVersion !== LONG_PACKET_MODEL_PIPELINE_VERSION
  ) {
    throw new Error('Durable chunk runtime provenance is incompatible.')
  }
}

function assertCurrentFinalizerConfiguration(context: {
  modelId: string
  promptVersion: string
  plannerVersion: string
  pipelineVersion: string
  packetEmergencyResult: PersistableEmergencyGatewayResult
}) {
  if (
    context.modelId !== LONG_PACKET_NARRATIVE_REDUCER_MODEL ||
    context.promptVersion !== LONG_PACKET_NARRATIVE_REDUCER_PROMPT_VERSION ||
    context.plannerVersion !== LONG_PACKET_PLANNER_VERSION ||
    context.pipelineVersion !== LONG_PACKET_MODEL_PIPELINE_VERSION ||
    context.packetEmergencyResult.version !== LONG_PACKET_EMERGENCY_VERSION
  ) {
    throw new Error('Durable finalizer runtime provenance is incompatible.')
  }
}

function asRuntimeResult(value: unknown): RuntimeExecutionResult {
  if (
    !isRecord(value) ||
    (value.executionKind !== 'chunk' && value.executionKind !== 'finalize')
  ) {
    throw new Error('Durable worker produced an invalid result envelope.')
  }
  return value as unknown as RuntimeExecutionResult
}

function asPlan(value: unknown): LongPacketPlan {
  if (!isRecord(value) || !Array.isArray(value.chunks)) {
    throw new Error('Persisted long-packet plan is invalid.')
  }
  return value as unknown as LongPacketPlan
}

function asChunk(value: unknown): LongPacketChunk {
  if (!isRecord(value) || typeof value.id !== 'string') {
    throw new Error('Persisted long-packet chunk is invalid.')
  }
  return value as unknown as LongPacketChunk
}

function asPacketEmergency(
  value: unknown,
): PersistableEmergencyGatewayResult {
  if (
    !isRecord(value) ||
    value.status !== 'completed' ||
    value.failureCode !== null ||
    typeof value.version !== 'string' ||
    typeof value.carePathway !== 'string' ||
    typeof value.reviewRequirement !== 'string' ||
    value.schedulingLocked !== true ||
    !Array.isArray(value.signals) ||
    !Array.isArray(value.lexicalHits)
  ) {
    throw new Error('Persisted deterministic emergency result is invalid.')
  }
  return value as unknown as PersistableEmergencyGatewayResult
}

function recoverCommittedChunkOutcome(input: {
  plan: LongPacketPlan
  sourceSha256: string
  safetyPromptVersions: unknown
  modelReduceResult: unknown
  chunk: LongPacketChunk
  branch: 'mapper' | 'safety'
  modelId: string
  promptVersion: string
  pipelineVersion: string
}): LongPacketChunkBranchOutcome | null {
  if (input.modelReduceResult === null || input.modelReduceResult === undefined) {
    return null
  }
  if (
    !isRecord(input.modelReduceResult) ||
    input.modelReduceResult.kind !== 'partial_safety_hold'
  ) {
    throw new Error(
      'A durable chunk retry found incompatible staged reducer authority.',
    )
  }
  const audit = validateLongPacketPartialSafetyHold({
    plan: input.plan,
    sourceSha256: input.sourceSha256,
    safetyPromptVersions: input.safetyPromptVersions,
    value: input.modelReduceResult,
  })
  if (audit.artifact.mode === 'workflow_persistence_failed') {
    throw new Error(
      'A durable chunk retry cannot replace a terminal safety checkpoint.',
    )
  }
  const expectedOutcomeBranch =
    input.branch === 'mapper' ? 'clinical_mapper' : 'safety_extractor'
  const matches = audit.artifact.projections.filter(
    (projection) =>
      projection.outcome.branch === expectedOutcomeBranch &&
      projection.outcome.chunkId === input.chunk.id &&
      projection.outcome.chunkProvenanceSha256 ===
        input.chunk.provenanceSha256 &&
      projection.modelProfile === input.modelId &&
      projection.promptVersion === input.promptVersion &&
      projection.pipelineVersion === input.pipelineVersion,
  )
  if (matches.length > 1) {
    throw new Error(
      'A durable chunk retry found divergent committed model observations.',
    )
  }
  return matches[0]?.outcome ?? null
}

function recoverStagedFinalizerPipeline(input: {
  plan: LongPacketPlan
  safetyPromptVersions: unknown
  modelMapResult: unknown
  modelReduceResult: unknown
}): LongPacketModelPipelineResult | null {
  const hasMap =
    input.modelMapResult !== null && input.modelMapResult !== undefined
  const hasReduce =
    input.modelReduceResult !== null && input.modelReduceResult !== undefined
  if (!hasMap && !hasReduce) return null
  if (
    isRecord(input.modelReduceResult) &&
    input.modelReduceResult.kind === 'partial_safety_hold'
  ) {
    return null
  }
  if (!hasMap || !hasReduce || !isRecord(input.modelReduceResult)) {
    throw new Error('Staged durable finalizer authority is incomplete.')
  }
  validateLongPacketFullPipelinePromptBindings(input.safetyPromptVersions)
  try {
    return validatePersistedLongPacketModelPipeline(
      input.plan,
      input.modelMapResult,
      input.modelReduceResult,
    )
  } catch {
    validatePersistedLongPacketAggregateSafety(
      input.plan,
      input.modelMapResult,
      input.modelReduceResult,
    )
    return input.modelReduceResult as unknown as LongPacketModelPipelineResult
  }
}

export function createRuntimeWorkerDependencies(input: {
  service: ReturnType<typeof createPostgresLongPacketDurableWorkService>
  workerId: string
}): LongPacketWorkerDependencies<RuntimeClaim> {
  const { service, workerId } = input

  return {
    claim: async (message: LongPacketWorkMessage) => {
      const durable = await service.claimJobByRef({
        kind: message.kind,
        jobId: message.job_id,
        workerId,
        leaseDurationMs: leaseDurationMs(),
      })
      if (!durable) return null
      return {
        jobId: durable.id,
        kind: message.kind,
        leaseToken: durable.leaseToken,
        attemptCount: durable.attemptCount,
        durable,
      }
    },

    executeChunk: async (claim) => {
      const context = await service.loadClaimedChunkPayload({
        jobId: claim.jobId,
        leaseToken: claim.leaseToken,
      })
      const branch = context.branch as 'mapper' | 'safety'
      assertCurrentChunkConfiguration({
        branch,
        modelId: context.modelId,
        promptVersion: context.promptVersion,
        plannerVersion: context.plannerVersion,
        pipelineVersion: context.pipelineVersion,
      })
      if (
        claim.durable.runId !== context.runId ||
        claim.durable.tenantId !== context.tenantId ||
        claim.durable.extractionId !== context.extractionId ||
        claim.durable.branch !== branch ||
        claim.durable.chunkId !== context.chunkId
      ) {
        throw new Error('Durable chunk claim binding changed after lease.')
      }

      const chunk = asChunk(context.chunk)
      const committedOutcome = recoverCommittedChunkOutcome({
        plan: asPlan(context.plan),
        sourceSha256: context.sourceSha256,
        safetyPromptVersions: context.safetyPromptVersions,
        modelReduceResult: context.modelReduceResult,
        chunk,
        branch,
        modelId: context.modelId,
        promptVersion: context.promptVersion,
        pipelineVersion: context.pipelineVersion,
      })
      const outcome =
        committedOutcome ??
        (await runClinicalModelWithTimeout({
          label: `long_packet_${branch}`,
          timeoutMs: CHUNK_DEADLINE_MS,
          operation: (signal) =>
            runLongPacketChunkBranch(chunk, branch, {
              signal,
              model: context.modelId,
            }),
        }))
      return {
        executionKind: 'chunk' as const,
        outcome,
        context: {
          extractionId: context.extractionId,
          tenantId: context.tenantId,
          chunkId: context.chunkId,
          branch,
          modelId: context.modelId,
          promptVersion: context.promptVersion,
          pipelineVersion: context.pipelineVersion,
          plan: asPlan(context.plan),
          sourceSha256: context.sourceSha256,
        },
      } satisfies ChunkExecutionResult
    },

    executeFinalizer: async (claim) => {
      const context = await service.loadClaimedFinalizationContext({
        jobId: claim.jobId,
        leaseToken: claim.leaseToken,
      })
      const packetEmergencyResult = asPacketEmergency(
        context.packetEmergencyResult,
      )
      assertCurrentFinalizerConfiguration({
        ...context,
        packetEmergencyResult,
      })
      if (
        claim.durable.runId !== context.runId ||
        claim.durable.tenantId !== context.tenantId ||
        claim.durable.extractionId !== context.extractionId
      ) {
        throw new Error('Durable finalizer claim binding changed after lease.')
      }
      const plan = asPlan(context.plan)
      const stagedPipeline = recoverStagedFinalizerPipeline({
        plan,
        safetyPromptVersions: context.safetyPromptVersions,
        modelMapResult: context.modelMapResult,
        modelReduceResult: context.modelReduceResult,
      })
      let pipeline = stagedPipeline
      if (!pipeline) {
        const outcomes = await service.readCompletedChunkOutcomes({
          runId: context.runId,
          tenantId: context.tenantId,
        })
        pipeline = await runClinicalModelWithTimeout({
          label: 'long_packet_finalizer',
          timeoutMs: FINALIZER_DEADLINE_MS,
          operation: (signal) =>
            reduceLongPacketModelOutcomes(
              plan,
              outcomes.mapper.map(
                (outcome) => outcome.result as LongPacketMapperBranchOutcome,
              ),
              outcomes.safety.map(
                (outcome) => outcome.result as LongPacketSafetyBranchOutcome,
              ),
              { signal },
            ),
        })
      }
      return {
        executionKind: 'finalize' as const,
        pipeline,
        extraction: buildFinalizedExtractionPersistence({
          pipeline,
          packetEmergencyResult,
        }),
        context: {
          extractionId: context.extractionId,
          tenantId: context.tenantId,
          runId: context.runId,
          plan: asPlan(context.plan),
          sourceSha256: context.sourceSha256,
          modelId: context.modelId,
          promptVersion: context.promptVersion,
          plannerVersion: context.plannerVersion,
          pipelineVersion: context.pipelineVersion,
        },
      } satisfies FinalizerExecutionResult
    },

    complete: async (claim, rawResult) => {
      const result = asRuntimeResult(rawResult)
      if (claim.kind === 'chunk') {
        if (result.executionKind !== 'chunk') {
          throw new Error('Chunk completion received a finalizer result.')
        }
        let escalationResult: ValidatedModelSafetyExtraction | null = null
        let safetyProjection:
          | Parameters<typeof persistLongPacketPartialSafetyHold>[0]['projection']
          | null = null
        if (result.context.branch === 'safety') {
          escalationResult =
            result.outcome.branch === 'safety_extractor' &&
            result.outcome.result
              ? result.outcome.result
              : {
                  carePathway: 'undetermined',
                  dataQuality: 'insufficient',
                  criticalUnknowns: [
                    'The long-packet safety branch did not produce validated evidence.',
                  ],
                  signals: [],
                }
          if (
            result.outcome.branch === 'safety_extractor' &&
            result.outcome.result !== null &&
            (result.outcome.result.carePathway === 'emergency_now' ||
              result.outcome.result.carePathway ===
                'same_day_clinician_review')
          ) {
            safetyProjection = {
              outcome: result.outcome,
              modelProfile: result.context.modelId,
              promptVersion: result.context.promptVersion,
              pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
            }
          }
        } else if (
          result.outcome.branch === 'clinical_mapper' &&
          result.outcome.result
        ) {
          try {
            escalationResult = deriveLongPacketMapperSafetyFloor(
              result.outcome,
            )
            safetyProjection = {
              outcome: result.outcome,
              modelProfile: result.context.modelId,
              promptVersion: result.context.promptVersion,
              pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
            }
          } catch {
            // Routine mapper outcomes do not create a safety workflow.
          }
        }
        if (escalationResult) {
          const durableAuthority = {
            jobId: claim.jobId,
            leaseToken: claim.leaseToken,
            branch: result.context.branch,
            chunkId: result.context.chunkId,
            chunkProvenanceSha256:
              result.outcome.chunkProvenanceSha256,
            modelId: result.context.modelId,
            promptVersion: result.context.promptVersion,
            sourceSha256: requiredString(
              claim.durable.sourceSha256,
              'sourceSha256',
            ),
            planSha256: requiredString(
              claim.durable.planSha256,
              'planSha256',
            ),
            plannerVersion: requiredString(
              claim.durable.plannerVersion,
              'plannerVersion',
            ),
            pipelineVersion: requiredString(
              claim.durable.pipelineVersion,
              'pipelineVersion',
            ),
          } as const
          const escalated = await persistLongPacketSafetyEscalationFailClosed({
            extractionId: result.context.extractionId,
            tenantId: result.context.tenantId,
            jobId: claim.jobId,
            chunkId: result.context.chunkId,
            safetyResult: escalationResult,
            modelProfile: result.context.modelId,
            promptVersion: result.context.promptVersion,
            pipelineVersion: result.context.pipelineVersion,
            durableAuthority,
            ...(safetyProjection
              ? {
                  checkpoint: {
                    kind: 'chunk_projection',
                    plan: result.context.plan,
                    sourceSha256: result.context.sourceSha256,
                    projection: safetyProjection,
                  },
                }
              : {}),
          })
          if (!escalated.ok) {
            if (safetyProjection) {
              const held = await persistLongPacketPartialSafetyHold({
                extractionId: result.context.extractionId,
                tenantId: result.context.tenantId,
                plan: result.context.plan,
                sourceSha256: result.context.sourceSha256,
                mode: 'workflow_persistence_failed',
                durableAuthority,
                projection: safetyProjection,
              })
              if (!held.ok) {
                throw new Error(
                  'Model safety escalation and partial-hold persistence failed.',
                )
              }
            }
            throw new Error('Model safety escalation persistence failed.')
          }
        }
        await service.completeChunkJob({
          jobId: claim.jobId,
          tenantId: claim.durable.tenantId,
          leaseToken: claim.leaseToken,
          branch: requiredString(claim.durable.branch, 'branch') as
            | 'mapper'
            | 'safety',
          result: result.outcome,
        })
        return
      }

      if (result.executionKind !== 'finalize') {
        throw new Error('Finalizer completion received a chunk result.')
      }
      if (
        claim.durable.runId !== result.context.runId ||
        claim.durable.tenantId !== result.context.tenantId ||
        claim.durable.extractionId !== result.context.extractionId
      ) {
        throw new Error('Durable finalizer result binding changed after lease.')
      }
      const aggregateSafety = deriveLongPacketPipelineSafetyResult(
        result.pipeline,
      )
      const finalizerAuthority = {
        kind: 'finalizer' as const,
        jobId: claim.jobId,
        leaseToken: claim.leaseToken,
        runId: result.context.runId,
        modelId: result.context.modelId,
        promptVersion: result.context.promptVersion,
        sourceSha256: result.context.sourceSha256,
        planSha256: hashLongPacketPlan(result.context.plan),
        plannerVersion: result.context.plannerVersion,
        pipelineVersion: result.context.pipelineVersion,
      }
      const aggregateSafetyActionable =
        aggregateSafety.carePathway === 'emergency_now' ||
        aggregateSafety.carePathway === 'same_day_clinician_review'
      if (aggregateSafetyActionable) {
        const escalated = await persistLongPacketSafetyEscalationFailClosed({
          extractionId: result.context.extractionId,
          tenantId: result.context.tenantId,
          jobId: claim.jobId,
          chunkId: 'finalization',
          safetyResult: aggregateSafety,
          modelProfile: result.context.modelId,
          promptVersion: result.context.promptVersion,
          pipelineVersion: result.context.pipelineVersion,
          durableAuthority: finalizerAuthority,
          checkpoint: {
            kind: 'validated_pipeline',
            plan: result.context.plan,
            sourceSha256: result.context.sourceSha256,
            safetyPromptVersions: result.extraction.safetyPromptVersions,
            modelMapResult: result.extraction.modelMapResult,
            modelReduceResult: result.pipeline,
          },
        })
        if (!escalated.ok) {
          await service.completeFinalizationJob({
            jobId: claim.jobId,
            tenantId: claim.durable.tenantId,
            leaseToken: claim.leaseToken,
            result: result.pipeline,
            extraction:
              result.extraction.outcome === 'success'
                ? {
                    outcome: 'error',
                    terminalReason: 'safety_workflow_persistence_failed',
                    modelMapResult: result.extraction.modelMapResult,
                    safetyPromptVersions:
                      result.extraction.safetyPromptVersions,
                    safetyScreenedAt: result.extraction.safetyScreenedAt,
                  }
                : result.extraction,
          })
          return
        }
      } else if (result.extraction.outcome === 'error') {
        const escalated = await persistLongPacketSafetyEscalationFailClosed({
          extractionId: requiredString(
            claim.durable.extractionId,
            'extraction',
          ),
          tenantId: claim.durable.tenantId,
          jobId: claim.jobId,
          chunkId: 'finalization',
          safetyResult: {
            carePathway: 'undetermined',
            dataQuality: 'insufficient',
            criticalUnknowns: [
              'Long-packet model coverage did not complete and requires clinician review.',
            ],
            signals: [],
          },
          modelProfile: LONG_PACKET_NARRATIVE_REDUCER_MODEL,
          promptVersion: LONG_PACKET_NARRATIVE_REDUCER_PROMPT_VERSION,
          pipelineVersion: LONG_PACKET_MODEL_PIPELINE_VERSION,
          durableAuthority: finalizerAuthority,
        })
        if (!escalated.ok) {
          throw new Error('Incomplete finalization hold could not be persisted.')
        }
      }
      await service.completeFinalizationJob({
        jobId: claim.jobId,
        tenantId: claim.durable.tenantId,
        leaseToken: claim.leaseToken,
        result: result.pipeline,
        extraction: result.extraction,
      })
    },

    fail: async (claim, error, nextRetryAt) => {
      if (claim.kind === 'chunk') {
        await service.failChunkJob({
          jobId: claim.jobId,
          tenantId: claim.durable.tenantId,
          leaseToken: claim.leaseToken,
          error,
          nextRetryAt,
        })
      } else {
        await service.failFinalizationJob({
          jobId: claim.jobId,
          tenantId: claim.durable.tenantId,
          leaseToken: claim.leaseToken,
          error,
          nextRetryAt,
        })
      }
    },
  }
}

export async function handler(
  event: SQSEvent,
  context: Context,
): Promise<SQSBatchResponse> {
  const service = createPostgresLongPacketDurableWorkService(await getPool())
  const result = await processLongPacketSqsEvent(
    event,
    createRuntimeWorkerDependencies({
      service,
      workerId: `lambda:${context.awsRequestId}`,
    }),
  )
  console.info(
    JSON.stringify({
      event: 'triage_long_packet_worker_batch_completed',
      record_count: event.Records.length,
      failed_record_count: result.batchItemFailures.length,
    }),
  )
  return result
}
