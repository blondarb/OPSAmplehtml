import { randomUUID as nodeRandomUUID } from 'node:crypto'

import type { Pool, PoolClient } from 'pg'
import { EMERGENCY_GATEWAY_VERSION } from './emergencyGateway'
import {
  canonicalLongPacketJSONStringify,
  hashLongPacketConfiguration,
  hashLongPacketEmergency,
  hashLongPacketPlan,
  hashLongPacketResult,
  type LongPacketResultHashKind,
} from './longPacketCanonicalHash'
import {
  LONG_PACKET_EMERGENCY_VERSION,
  scanLongPacketEmergency,
} from './longPacketEmergency'
import { assertLongPacketPersistedClinicalExtractionMatches } from './longPacketIngestion'
import {
  validateLongPacketPartialSafetyHold,
  validateLongPacketSafetyAuditReplacement,
} from './longPacketPartialSafetyHold'
import type { LongPacketPlan } from './longPacketPlanner'
import {
  validatePersistedLongPacketAggregateSafety,
  validatePersistedLongPacketModelPipeline,
} from './longPacketModelPipeline'
import type {
  ExtractionKeyFindings,
  SourceType,
  TriageConfidence,
} from './types'

const SHA256_PATTERN = /^[0-9a-f]{64}$/
const MIN_LEASE_MS = 10_000
const MAX_LEASE_MS = 15 * 60_000

export type LongPacketRunPurpose = 'primary' | 'shadow' | 'reprocess'
export type LongPacketJobBranch = 'mapper' | 'safety'

export interface DurableLongPacketPlan {
  version: string
  chunks: Array<{ id: string; provenanceSha256: string }>
}

export interface LongPacketRunConfiguration {
  plannerVersion: string
  pipelineVersion: string
  mapperModelId: string
  mapperPromptVersion: string
  safetyModelId: string
  safetyPromptVersion: string
  reducerModelId: string
  reducerPromptVersion: string
  maxAttempts: number
}

export interface InitializeLongPacketRunInput {
  extractionId: string
  tenantId: string
  runPurpose: LongPacketRunPurpose
  sourceSha256: string
  plan: DurableLongPacketPlan
  configuration: LongPacketRunConfiguration
}

export type LongPacketDurableWorkErrorCode =
  | 'invalid_input'
  | 'binding_mismatch'
  | 'persistence_failed'
  | 'stale_or_missing_lease'
  | 'incomplete_outcomes'

export class LongPacketDurableWorkError extends Error {
  readonly name = 'LongPacketDurableWorkError'

  constructor(
    public readonly code: LongPacketDurableWorkErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export interface ClaimedLongPacketJob {
  id: string
  runId: string
  tenantId: string
  extractionId?: string
  runPurpose?: LongPacketRunPurpose
  expectedChunkCount?: number
  leaseToken: string
  claimKind: 'initial' | 'retry' | 'reclaim'
  attemptCount: number
  chunkId?: string
  branch?: LongPacketJobBranch
  configurationSha256?: string
  sourceSha256?: string
  planSha256?: string
  plannerVersion?: string
  pipelineVersion?: string
  chunkProvenanceSha256?: string
  modelId?: string
  promptVersion?: string
}

interface FinalizedExtractionEvidence {
  modelMapResult: unknown
  safetyPromptVersions: Record<string, string>
  safetyScreenedAt: Date
}

export interface SuccessfulFinalizedExtractionPersistence
  extends FinalizedExtractionEvidence {
  outcome: 'success'
  noteTypeDetected: string
  extractionConfidence: TriageConfidence
  extractedSummary: string
  keyFindings: ExtractionKeyFindings
}

export interface ErrorFinalizedExtractionPersistence
  extends FinalizedExtractionEvidence {
  outcome: 'error'
  terminalReason?: 'safety_workflow_persistence_failed'
}

export type FinalizedExtractionPersistence =
  | SuccessfulFinalizedExtractionPersistence
  | ErrorFinalizedExtractionPersistence

export interface CompletedChunkOutcome {
  chunkId: string
  branch: LongPacketJobBranch
  result: unknown
  resultSha256: string
}

export interface CompletedChunkOutcomes {
  mapper: CompletedChunkOutcome[]
  safety: CompletedChunkOutcome[]
}

interface ServiceDependencies {
  now?: () => Date
  randomUUID?: () => string
}

interface ExtractionRow {
  id: string
  tenant_id: string
  status: string
  ingestion_mode: string
  source_sha256: string | null
  packet_plan: unknown
  packet_plan_sha256: string | null
}

interface RunRow {
  id: string
  extraction_id: string
  tenant_id: string
  configuration_sha256: string
  run_purpose: LongPacketRunPurpose
  source_sha256: string
  plan_sha256: string
  expected_chunk_count: number
  planner_version: string
  pipeline_version: string
  mapper_model_id: string
  mapper_prompt_version: string
  safety_model_id: string
  safety_prompt_version: string
  reducer_model_id: string
  reducer_prompt_version: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  started_at: string | Date | null
}

interface ChunkJobRow {
  chunk_id: string
  branch: LongPacketJobBranch
  status: string
  configuration_sha256?: string
  source_sha256?: string
  plan_sha256?: string
  planner_version?: string
  pipeline_version?: string
  chunk_provenance_sha256: string
  model_id: string
  prompt_version: string
  max_attempts?: number
  result?: unknown
  result_sha256?: string
}

interface FinalizationRow {
  run_id: string
  tenant_id: string
  configuration_sha256: string
  source_sha256: string
  plan_sha256: string
  planner_version: string
  pipeline_version: string
  expected_chunk_count: number
  model_id: string
  prompt_version: string
  max_attempts: number
}

interface RunContextRow {
  id: string
  tenant_id: string
  expected_chunk_count: number
  packet_plan: unknown
  configuration_sha256: string
  source_sha256: string
  plan_sha256: string
  planner_version: string
  pipeline_version: string
  mapper_model_id: string
  mapper_prompt_version: string
  safety_model_id: string
  safety_prompt_version: string
}

function durableError(
  code: LongPacketDurableWorkErrorCode,
  message: string,
): LongPacketDurableWorkError {
  return new LongPacketDurableWorkError(code, message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw durableError('binding_mismatch', 'Persisted JSON provenance is invalid.')
  }
}

function deriveSourceType(sourceFilename: unknown): SourceType {
  if (sourceFilename === null || sourceFilename === undefined) return 'paste'
  if (typeof sourceFilename !== 'string' || !sourceFilename.trim()) {
    throw durableError('binding_mismatch', 'Persisted source type is invalid.')
  }
  const normalized = sourceFilename.trim().toLowerCase()
  if (normalized.endsWith('.pdf')) return 'pdf'
  if (normalized.endsWith('.docx')) return 'docx'
  if (normalized.endsWith('.txt')) return 'txt'
  throw durableError('binding_mismatch', 'Persisted source type is invalid.')
}

function validatePacketEmergency(
  rawEmergency: unknown,
  packetPlan: Record<string, unknown>,
): { result: Record<string, unknown>; sha256: string } {
  const emergency = parseJson(rawEmergency)
  const chunks = packetPlan.chunks
  if (
    !isRecord(emergency) ||
    !Array.isArray(chunks) ||
    emergency.status !== 'completed' ||
    emergency.failureCode !== null ||
    emergency.version !== LONG_PACKET_EMERGENCY_VERSION ||
    emergency.schedulingLocked !== true ||
    emergency.plannerVersion !== packetPlan.version ||
    !Number.isSafeInteger(Number(emergency.expectedChunkCount)) ||
    !Number.isSafeInteger(Number(emergency.scannedChunkCount)) ||
    Number(emergency.expectedChunkCount) !== chunks.length ||
    Number(emergency.scannedChunkCount) !== chunks.length ||
    !Array.isArray(emergency.chunkEvaluations) ||
    emergency.chunkEvaluations.length !== chunks.length ||
    !Array.isArray(emergency.signals) ||
    !Array.isArray(emergency.lexicalHits)
  ) {
    throw durableError(
      'binding_mismatch',
      'Persisted deterministic emergency evidence is invalid.',
    )
  }
  const expectedIds = chunks.map((chunk) =>
    isRecord(chunk) && typeof chunk.id === 'string' ? chunk.id : null,
  )
  const evaluatedIds = emergency.chunkEvaluations.map((evaluation) => {
    if (
      !isRecord(evaluation) ||
      typeof evaluation.chunkId !== 'string' ||
      !isRecord(evaluation.gateway) ||
      evaluation.gateway.status !== 'completed' ||
      evaluation.gateway.failureCode !== null ||
      evaluation.gateway.version !== EMERGENCY_GATEWAY_VERSION ||
      evaluation.gateway.schedulingLocked !== true ||
      !Array.isArray(evaluation.gateway.signals) ||
      !Array.isArray(evaluation.gateway.lexicalHits)
    ) {
      return null
    }
    return evaluation.chunkId
  })
  if (
    expectedIds.some((id) => id === null) ||
    evaluatedIds.some((id) => id === null) ||
    new Set(expectedIds).size !== expectedIds.length ||
    new Set(evaluatedIds).size !== evaluatedIds.length ||
    expectedIds.some((id, index) => evaluatedIds[index] !== id)
  ) {
    throw durableError(
      'binding_mismatch',
      'Persisted deterministic emergency evidence is not bound to the plan.',
    )
  }
  try {
    return { result: emergency, sha256: hashLongPacketEmergency(emergency) }
  } catch {
    throw durableError(
      'binding_mismatch',
      'Persisted deterministic emergency evidence is invalid.',
    )
  }
}

function nonEmpty(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== 'string') {
    throw durableError('invalid_input', `${field} is invalid.`)
  }
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) {
    throw durableError('invalid_input', `${field} is invalid.`)
  }
  return trimmed
}

function sha256(value: string, field: string): string {
  if (!SHA256_PATTERN.test(value)) {
    throw durableError('invalid_input', `${field} must be a lowercase SHA-256.`)
  }
  return value
}

function validateConfiguration(
  configuration: LongPacketRunConfiguration,
): LongPacketRunConfiguration {
  if (
    !Number.isSafeInteger(configuration.maxAttempts) ||
    configuration.maxAttempts < 1 ||
    configuration.maxAttempts > 20
  ) {
    throw durableError('invalid_input', 'maxAttempts is invalid.')
  }
  return {
    plannerVersion: nonEmpty(configuration.plannerVersion, 'plannerVersion'),
    pipelineVersion: nonEmpty(configuration.pipelineVersion, 'pipelineVersion'),
    mapperModelId: nonEmpty(configuration.mapperModelId, 'mapperModelId'),
    mapperPromptVersion: nonEmpty(
      configuration.mapperPromptVersion,
      'mapperPromptVersion',
    ),
    safetyModelId: nonEmpty(configuration.safetyModelId, 'safetyModelId'),
    safetyPromptVersion: nonEmpty(
      configuration.safetyPromptVersion,
      'safetyPromptVersion',
    ),
    reducerModelId: nonEmpty(configuration.reducerModelId, 'reducerModelId'),
    reducerPromptVersion: nonEmpty(
      configuration.reducerPromptVersion,
      'reducerPromptVersion',
    ),
    maxAttempts: configuration.maxAttempts,
  }
}

function validatePlan(
  plan: DurableLongPacketPlan,
  plannerVersion: string,
): DurableLongPacketPlan['chunks'] {
  if (
    !isRecord(plan) ||
    plan.version !== plannerVersion ||
    !Array.isArray(plan.chunks) ||
    plan.chunks.length < 1
  ) {
    throw durableError('invalid_input', 'Long-packet plan is invalid.')
  }
  const ids = new Set<string>()
  for (const chunk of plan.chunks) {
    if (
      !isRecord(chunk) ||
      typeof chunk.id !== 'string' ||
      !chunk.id.trim() ||
      chunk.id.length > 500 ||
      ids.has(chunk.id) ||
      typeof chunk.provenanceSha256 !== 'string' ||
      !SHA256_PATTERN.test(chunk.provenanceSha256)
    ) {
      throw durableError('invalid_input', 'Long-packet chunk provenance is invalid.')
    }
    ids.add(chunk.id)
  }
  return plan.chunks
}

function exactRunMatches(
  row: RunRow,
  expected: {
    extractionId: string
    tenantId: string
    configurationSha256: string
    sourceSha256: string
    planSha256: string
    expectedChunkCount: number
    configuration: LongPacketRunConfiguration
  },
): boolean {
  const configuration = expected.configuration
  return (
    row.extraction_id === expected.extractionId &&
    row.tenant_id === expected.tenantId &&
    row.configuration_sha256 === expected.configurationSha256 &&
    row.source_sha256 === expected.sourceSha256 &&
    row.plan_sha256 === expected.planSha256 &&
    Number(row.expected_chunk_count) === expected.expectedChunkCount &&
    row.planner_version === configuration.plannerVersion &&
    row.pipeline_version === configuration.pipelineVersion &&
    row.mapper_model_id === configuration.mapperModelId &&
    row.mapper_prompt_version === configuration.mapperPromptVersion &&
    row.safety_model_id === configuration.safetyModelId &&
    row.safety_prompt_version === configuration.safetyPromptVersion &&
    row.reducer_model_id === configuration.reducerModelId &&
    row.reducer_prompt_version === configuration.reducerPromptVersion
  )
}

function expectedJobManifest(
  chunks: DurableLongPacketPlan['chunks'],
  configuration: LongPacketRunConfiguration,
) {
  return chunks.flatMap((chunk) => [
    {
      chunk_id: chunk.id,
      branch: 'mapper' as const,
      chunk_provenance_sha256: chunk.provenanceSha256,
      model_id: configuration.mapperModelId,
      prompt_version: configuration.mapperPromptVersion,
    },
    {
      chunk_id: chunk.id,
      branch: 'safety' as const,
      chunk_provenance_sha256: chunk.provenanceSha256,
      model_id: configuration.safetyModelId,
      prompt_version: configuration.safetyPromptVersion,
    },
  ])
}

function sameJobManifest(
  actual: ChunkJobRow[],
  expected: ReturnType<typeof expectedJobManifest>,
  provenance: {
    configurationSha256: string
    sourceSha256: string
    planSha256: string
    configuration: LongPacketRunConfiguration
  },
): boolean {
  if (actual.length !== expected.length) return false
  const actualByKey = new Map(
    actual.map((job) => [`${job.branch}\u0000${job.chunk_id}`, job]),
  )
  if (actualByKey.size !== expected.length) return false
  return expected.every((job) => {
    const found = actualByKey.get(`${job.branch}\u0000${job.chunk_id}`)
    return Boolean(
      found &&
        found.chunk_provenance_sha256 === job.chunk_provenance_sha256 &&
        found.model_id === job.model_id &&
        found.prompt_version === job.prompt_version &&
        found.configuration_sha256 === provenance.configurationSha256 &&
        found.source_sha256 === provenance.sourceSha256 &&
        found.plan_sha256 === provenance.planSha256 &&
        found.planner_version === provenance.configuration.plannerVersion &&
        found.pipeline_version === provenance.configuration.pipelineVersion &&
        Number(found.max_attempts) === provenance.configuration.maxAttempts,
    )
  })
}

function sameFinalization(
  row: FinalizationRow | undefined,
  expected: {
    runId: string
    tenantId: string
    configurationSha256: string
    sourceSha256: string
    planSha256: string
    expectedChunkCount: number
    configuration: LongPacketRunConfiguration
  },
): boolean {
  return Boolean(
    row &&
      row.run_id === expected.runId &&
      row.tenant_id === expected.tenantId &&
      row.configuration_sha256 === expected.configurationSha256 &&
      row.source_sha256 === expected.sourceSha256 &&
      row.plan_sha256 === expected.planSha256 &&
      Number(row.expected_chunk_count) === expected.expectedChunkCount &&
      row.planner_version === expected.configuration.plannerVersion &&
      row.pipeline_version === expected.configuration.pipelineVersion &&
      row.model_id === expected.configuration.reducerModelId &&
      row.prompt_version === expected.configuration.reducerPromptVersion &&
      Number(row.max_attempts) === expected.configuration.maxAttempts,
  )
}

async function readAndVerifyExistingManifest(
  client: PoolClient,
  runId: string,
  input: {
    tenantId: string
    configurationSha256: string
    sourceSha256: string
    planSha256: string
    chunks: DurableLongPacketPlan['chunks']
    configuration: LongPacketRunConfiguration
  },
): Promise<void> {
  const jobsResult = await client.query(
    `SELECT chunk_id, branch, status, configuration_sha256, source_sha256,
            plan_sha256, planner_version, pipeline_version,
            chunk_provenance_sha256, model_id, prompt_version, max_attempts
       FROM triage_long_packet_chunk_jobs
      WHERE run_id = $1
        AND tenant_id = $2
      ORDER BY chunk_id, branch
      FOR SHARE`,
    [runId, input.tenantId],
  )
  if (
    !sameJobManifest(
      jobsResult.rows as ChunkJobRow[],
      expectedJobManifest(input.chunks, input.configuration),
      input,
    )
  ) {
    throw durableError('binding_mismatch', 'Durable chunk manifest is inconsistent.')
  }

  const finalizationResult = await client.query(
    `SELECT run_id, tenant_id, configuration_sha256, source_sha256,
            plan_sha256, planner_version, pipeline_version,
            expected_chunk_count, model_id, prompt_version, max_attempts
       FROM triage_long_packet_finalization_jobs
      WHERE run_id = $1
        AND tenant_id = $2
      FOR SHARE`,
    [runId, input.tenantId],
  )
  if (
    finalizationResult.rowCount !== 1 ||
    !sameFinalization(finalizationResult.rows[0] as FinalizationRow | undefined, {
      runId,
      tenantId: input.tenantId,
      configurationSha256: input.configurationSha256,
      sourceSha256: input.sourceSha256,
      planSha256: input.planSha256,
      expectedChunkCount: input.chunks.length,
      configuration: input.configuration,
    })
  ) {
    throw durableError('binding_mismatch', 'Durable finalization manifest is inconsistent.')
  }
}

function normalizeRowCount(
  queryResult: { rowCount: number | null },
): number {
  return queryResult.rowCount ?? 0
}

function claimKind(previousStatus: unknown): ClaimedLongPacketJob['claimKind'] {
  if (previousStatus === 'failed') return 'retry'
  if (previousStatus === 'leased') return 'reclaim'
  return 'initial'
}

function parseClaimedJob(
  row: Record<string, unknown>,
  expectedLeaseToken: string,
): ClaimedLongPacketJob {
  if (
    typeof row.id !== 'string' ||
    typeof row.run_id !== 'string' ||
    typeof row.tenant_id !== 'string' ||
    row.lease_token !== expectedLeaseToken ||
    !Number.isSafeInteger(Number(row.attempt_count)) ||
    Number(row.attempt_count) < 1
  ) {
    throw durableError('persistence_failed', 'Claimed durable work is invalid.')
  }
  return {
    id: row.id,
    runId: row.run_id,
    tenantId: row.tenant_id,
    ...(typeof row.extraction_id === 'string'
      ? { extractionId: row.extraction_id }
      : {}),
    ...(row.run_purpose === 'primary' ||
    row.run_purpose === 'shadow' ||
    row.run_purpose === 'reprocess'
      ? { runPurpose: row.run_purpose }
      : {}),
    ...(Number.isSafeInteger(Number(row.expected_chunk_count)) &&
    Number(row.expected_chunk_count) > 0
      ? { expectedChunkCount: Number(row.expected_chunk_count) }
      : {}),
    leaseToken: row.lease_token,
    claimKind: claimKind(row.previous_status),
    attemptCount: Number(row.attempt_count),
    ...(typeof row.chunk_id === 'string' ? { chunkId: row.chunk_id } : {}),
    ...(row.branch === 'mapper' || row.branch === 'safety'
      ? { branch: row.branch }
      : {}),
    ...(typeof row.configuration_sha256 === 'string'
      ? { configurationSha256: row.configuration_sha256 }
      : {}),
    ...(typeof row.source_sha256 === 'string'
      ? { sourceSha256: row.source_sha256 }
      : {}),
    ...(typeof row.plan_sha256 === 'string'
      ? { planSha256: row.plan_sha256 }
      : {}),
    ...(typeof row.planner_version === 'string'
      ? { plannerVersion: row.planner_version }
      : {}),
    ...(typeof row.pipeline_version === 'string'
      ? { pipelineVersion: row.pipeline_version }
      : {}),
    ...(typeof row.chunk_provenance_sha256 === 'string'
      ? { chunkProvenanceSha256: row.chunk_provenance_sha256 }
      : {}),
    ...(typeof row.model_id === 'string' ? { modelId: row.model_id } : {}),
    ...(typeof row.prompt_version === 'string'
      ? { promptVersion: row.prompt_version }
      : {}),
  }
}

function validateClaimInput(input: {
  tenantId: string
  workerId: string
  leaseDurationMs: number
}) {
  nonEmpty(input.tenantId, 'tenantId', 200)
  nonEmpty(input.workerId, 'workerId', 200)
  if (
    !Number.isSafeInteger(input.leaseDurationMs) ||
    input.leaseDurationMs < MIN_LEASE_MS ||
    input.leaseDurationMs > MAX_LEASE_MS
  ) {
    throw durableError('invalid_input', 'leaseDurationMs is invalid.')
  }
}

function sanitizeFailure(error: unknown): { code: string; detail: string } {
  const name = error instanceof Error ? error.name.toLowerCase() : ''
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (name.includes('abort') || message.includes('timeout')) {
    return {
      code: 'model_timeout',
      detail: 'The model worker timed out before producing a validated result.',
    }
  }
  if (
    message.includes('schema') ||
    message.includes('validation') ||
    message.includes('invalid result')
  ) {
    return {
      code: 'result_validation_failed',
      detail: 'The worker result did not satisfy the validated output contract.',
    }
  }
  if (
    message.includes('credential') ||
    message.includes('aws') ||
    message.includes('bedrock') ||
    message.includes('service unavailable')
  ) {
    return {
      code: 'model_service_unavailable',
      detail: 'The model service was unavailable before a validated result was produced.',
    }
  }
  return {
    code: 'worker_failed',
    detail: 'The durable worker failed before producing a validated result.',
  }
}

const INCOMPLETE_REDUCTION_ERROR_MESSAGE =
  'Long-packet model coverage was incomplete. Partial evidence was preserved; do not use a generated summary for scheduling or routine triage.'
const SAFETY_WORKFLOW_PERSISTENCE_ERROR_MESSAGE =
  'Validated aggregate long-packet safety could not be persisted to its mandatory workflow. The complete source-bound pipeline was preserved; immediate human review is required.'

type ValidatedFinalizedExtraction = {
  outcome: FinalizedExtractionPersistence['outcome']
  modelMapResultJson: string
  safetyPromptVersionsJson: string
  safetyScreenedAt: Date
  errorMessage: string | null
  noteTypeDetected?: string
  extractionConfidence?: TriageConfidence
  extractedSummary?: string
  keyFindingsJson?: string
  safetyWorkflowPersistenceFailed: boolean
}

function canonicalInputJson(value: unknown, field: string): string {
  try {
    return canonicalLongPacketJSONStringify(value)
  } catch {
    throw durableError('invalid_input', `${field} is invalid.`)
  }
}

function validateFinalizedExtraction(
  extraction: FinalizedExtractionPersistence,
): ValidatedFinalizedExtraction {
  if (
    (extraction.outcome !== 'success' && extraction.outcome !== 'error') ||
    !isRecord(extraction.modelMapResult) ||
    !isRecord(extraction.safetyPromptVersions) ||
    Object.keys(extraction.safetyPromptVersions).length === 0 ||
    Object.values(extraction.safetyPromptVersions).some(
      (value) => typeof value !== 'string' || !value.trim(),
    ) ||
    !(extraction.safetyScreenedAt instanceof Date) ||
    !Number.isFinite(extraction.safetyScreenedAt.getTime())
  ) {
    throw durableError('invalid_input', 'Finalized extraction evidence is invalid.')
  }
  const common = {
    outcome: extraction.outcome,
    modelMapResultJson: canonicalInputJson(
      extraction.modelMapResult,
      'modelMapResult',
    ),
    safetyPromptVersionsJson: canonicalInputJson(
      extraction.safetyPromptVersions,
      'safetyPromptVersions',
    ),
    safetyScreenedAt: extraction.safetyScreenedAt,
    errorMessage:
      extraction.outcome === 'error'
        ? extraction.terminalReason === 'safety_workflow_persistence_failed'
          ? SAFETY_WORKFLOW_PERSISTENCE_ERROR_MESSAGE
          : INCOMPLETE_REDUCTION_ERROR_MESSAGE
        : null,
    safetyWorkflowPersistenceFailed:
      extraction.outcome === 'error' &&
      extraction.terminalReason === 'safety_workflow_persistence_failed',
  }
  if (extraction.outcome === 'error') {
    if (
      extraction.terminalReason !== undefined &&
      extraction.terminalReason !== 'safety_workflow_persistence_failed'
    ) {
      throw durableError('invalid_input', 'terminalReason is invalid.')
    }
    return common
  }

  const noteTypeDetected = nonEmpty(
    extraction.noteTypeDetected,
    'noteTypeDetected',
    200,
  )
  if (!['high', 'moderate', 'low'].includes(extraction.extractionConfidence)) {
    throw durableError('invalid_input', 'extractionConfidence is invalid.')
  }
  if (!isRecord(extraction.keyFindings)) {
    throw durableError('invalid_input', 'Finalized extraction evidence is invalid.')
  }
  return {
    ...common,
    noteTypeDetected,
    extractionConfidence: extraction.extractionConfidence,
    extractedSummary: nonEmpty(
      extraction.extractedSummary,
      'extractedSummary',
      1_000_000,
    ),
    keyFindingsJson: canonicalInputJson(
      extraction.keyFindings,
      'keyFindings',
    ),
  }
}

function validateReductionOutcome(
  result: Record<string, unknown>,
  extraction: ValidatedFinalizedExtraction,
): void {
  const isSuccess =
    result.status === 'completed' && result.coverageStatus === 'complete'
  const isError =
    (result.status === 'partial' || result.status === 'failed') &&
    (result.coverageStatus === 'partial' || result.coverageStatus === 'failed')
  if (
    (!isSuccess && !isError) ||
    (extraction.outcome === 'success' && !isSuccess) ||
    (extraction.outcome === 'error' &&
      !isError &&
      !(extraction.safetyWorkflowPersistenceFailed && isSuccess))
  ) {
    throw durableError(
      'invalid_input',
      'Finalization result and extraction outcome are inconsistent.',
    )
  }
}

function wrapPersistenceError(error: unknown): never {
  if (error instanceof LongPacketDurableWorkError) throw error
  throw durableError('persistence_failed', 'Durable long-packet persistence failed.')
}

export function createPostgresLongPacketDurableWorkService(
  pool: Pool,
  dependencies: ServiceDependencies = {},
) {
  const now = dependencies.now ?? (() => new Date())
  const randomUUID = dependencies.randomUUID ?? nodeRandomUUID

  async function listDispatchableJobRefs(limit: number): Promise<
    Array<{ kind: 'chunk' | 'finalize'; jobId: string }>
  > {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw durableError('invalid_input', 'dispatch limit is invalid.')
    }
    const observedAt = now()
    try {
      const dispatchable = await pool.query(
        `WITH dispatchable AS (
           SELECT 'chunk'::text AS kind, job.id AS job_id,
                  job.created_at AS queued_at
             FROM triage_long_packet_chunk_jobs job
             JOIN triage_long_packet_runs run ON run.id = job.run_id
            WHERE run.status = 'running'
              AND job.attempt_count < job.max_attempts
              AND (
                job.status = 'pending'
                OR (job.status = 'failed'
                    AND (job.next_retry_at IS NULL OR job.next_retry_at <= $1))
                OR (job.status = 'leased' AND job.lease_expires_at <= $1)
              )
           UNION ALL
           SELECT 'finalize'::text AS kind, job.id AS job_id,
                  job.created_at AS queued_at
             FROM triage_long_packet_finalization_jobs job
             JOIN triage_long_packet_runs run ON run.id = job.run_id
            WHERE run.status = 'running'
              AND job.attempt_count < job.max_attempts
              AND (
                job.status = 'pending'
                OR (job.status = 'failed'
                    AND (job.next_retry_at IS NULL OR job.next_retry_at <= $1))
                OR (job.status = 'leased' AND job.lease_expires_at <= $1)
              )
              AND (
                SELECT count(*)
                  FROM triage_long_packet_chunk_jobs completed
                 WHERE completed.run_id = job.run_id
                   AND completed.branch = 'mapper'
                   AND completed.status = 'complete'
              ) = job.expected_chunk_count
              AND (
                SELECT count(*)
                  FROM triage_long_packet_chunk_jobs completed
                 WHERE completed.run_id = job.run_id
                   AND completed.branch = 'safety'
                   AND completed.status = 'complete'
              ) = job.expected_chunk_count
              AND (
                SELECT count(*)
                  FROM triage_long_packet_chunk_jobs manifest
                 WHERE manifest.run_id = job.run_id
              ) = job.expected_chunk_count * 2
         )
         SELECT kind, job_id
           FROM dispatchable
          ORDER BY queued_at, kind, job_id
          LIMIT $2`,
        [observedAt, limit],
      )
      const seen = new Set<string>()
      return dispatchable.rows.map((row) => {
        if (
          (row.kind !== 'chunk' && row.kind !== 'finalize') ||
          typeof row.job_id !== 'string' ||
          seen.has(`${row.kind}:${row.job_id}`)
        ) {
          throw durableError(
            'persistence_failed',
            'Dispatchable durable work is invalid.',
          )
        }
        seen.add(`${row.kind}:${row.job_id}`)
        return { kind: row.kind, jobId: row.job_id }
      })
    } catch (error) {
      wrapPersistenceError(error)
    }
  }

  async function claimJobByRef(input: {
    kind: 'chunk' | 'finalize'
    jobId: string
    workerId: string
    leaseDurationMs: number
  }): Promise<ClaimedLongPacketJob | null> {
    if (input.kind !== 'chunk' && input.kind !== 'finalize') {
      throw durableError('invalid_input', 'job kind is invalid.')
    }
    nonEmpty(input.jobId, 'jobId', 200)
    validateClaimInput({
      tenantId: 'resolved-inside-database',
      workerId: input.workerId,
      leaseDurationMs: input.leaseDurationMs,
    })
    const claimedAt = now()
    const expiresAt = new Date(claimedAt.getTime() + input.leaseDurationMs)
    const leaseToken = randomUUID()
    const isChunk = input.kind === 'chunk'
    const table = isChunk
      ? 'triage_long_packet_chunk_jobs'
      : 'triage_long_packet_finalization_jobs'
    const readiness = isChunk
      ? ''
      : `AND (
           SELECT count(*)
             FROM triage_long_packet_chunk_jobs completed
            WHERE completed.run_id = job.run_id
              AND completed.branch = 'mapper'
              AND completed.status = 'complete'
         ) = job.expected_chunk_count
         AND (
           SELECT count(*)
             FROM triage_long_packet_chunk_jobs completed
            WHERE completed.run_id = job.run_id
              AND completed.branch = 'safety'
              AND completed.status = 'complete'
         ) = job.expected_chunk_count
         AND (
           SELECT count(*)
             FROM triage_long_packet_chunk_jobs manifest
            WHERE manifest.run_id = job.run_id
         ) = job.expected_chunk_count * 2`
    const chunkReturning = isChunk
      ? `job.chunk_id, job.branch, job.chunk_provenance_sha256,`
      : ''
    try {
      const claim = await pool.query(
        `WITH candidate AS (
           SELECT job.id, job.tenant_id, job.status AS previous_status,
                  job.lease_token AS previous_lease_token,
                  run.extraction_id, run.run_purpose,
                  run.expected_chunk_count
             FROM ${table} job
             JOIN triage_long_packet_runs run ON run.id = job.run_id
            WHERE job.id = $1
              AND run.tenant_id = job.tenant_id
              AND run.status = 'running'
              AND job.attempt_count < job.max_attempts
              AND (
                job.status = 'pending'
                OR (job.status = 'failed'
                    AND (job.next_retry_at IS NULL OR job.next_retry_at <= $2))
                OR (job.status = 'leased' AND job.lease_expires_at <= $2)
              )
              ${readiness}
            FOR UPDATE OF job SKIP LOCKED
         )
         UPDATE ${table} job
            SET status = 'leased',
                lease_token = $3,
                lease_owner = $4,
                claimed_at = $2,
                lease_expires_at = $5,
                attempt_count = job.attempt_count + 1,
                next_retry_at = NULL,
                outcome_lease_token = NULL,
                finished_at = NULL,
                updated_at = $2
           FROM candidate
          WHERE job.id = candidate.id
            AND job.tenant_id = candidate.tenant_id
            AND job.status = candidate.previous_status
            AND job.lease_token IS NOT DISTINCT FROM candidate.previous_lease_token
            AND job.attempt_count < job.max_attempts
        RETURNING job.id, job.run_id, job.tenant_id,
                  ${chunkReturning}
                  job.configuration_sha256, job.source_sha256,
                  job.plan_sha256, job.planner_version,
                  job.pipeline_version, job.model_id, job.prompt_version,
                  job.lease_token, job.attempt_count,
                  candidate.previous_status, candidate.extraction_id,
                  candidate.run_purpose, candidate.expected_chunk_count`,
        [input.jobId, claimedAt, leaseToken, input.workerId.trim(), expiresAt],
      )
      if (normalizeRowCount(claim) === 0) return null
      if (normalizeRowCount(claim) !== 1) {
        throw durableError('persistence_failed', 'Opaque claim was ambiguous.')
      }
      return parseClaimedJob(
        claim.rows[0] as Record<string, unknown>,
        leaseToken,
      )
    } catch (error) {
      wrapPersistenceError(error)
    }
  }

  async function loadClaimedChunkPayload(input: {
    jobId: string
    leaseToken: string
  }) {
    nonEmpty(input.jobId, 'jobId', 200)
    nonEmpty(input.leaseToken, 'leaseToken', 200)
    const observedAt = now()
    try {
      const loaded = await pool.query(
        `SELECT job.id, job.run_id, job.tenant_id, job.chunk_id, job.branch,
                job.configuration_sha256, job.source_sha256, job.plan_sha256,
                job.planner_version, job.pipeline_version,
                job.chunk_provenance_sha256, job.model_id, job.prompt_version,
                run.extraction_id,
                extraction.source_filename,
                extraction.packet_emergency_result,
                extraction.packet_plan,
                extraction.safety_prompt_versions,
                extraction.model_reduce_result,
                extraction.source_sha256 AS extraction_source_sha256,
                extraction.packet_plan_sha256 AS extraction_plan_sha256,
                run.configuration_sha256 AS run_configuration_sha256,
                run.source_sha256 AS run_source_sha256,
                run.plan_sha256 AS run_plan_sha256,
                run.planner_version AS run_planner_version,
                run.pipeline_version AS run_pipeline_version,
                CASE job.branch
                  WHEN 'mapper' THEN run.mapper_model_id
                  ELSE run.safety_model_id
                END AS expected_model_id,
                CASE job.branch
                  WHEN 'mapper' THEN run.mapper_prompt_version
                  ELSE run.safety_prompt_version
                END AS expected_prompt_version
           FROM triage_long_packet_chunk_jobs job
           JOIN triage_long_packet_runs run
             ON run.id = job.run_id
            AND run.tenant_id = job.tenant_id
           JOIN triage_extractions extraction
             ON extraction.id = run.extraction_id
            AND extraction.tenant_id = run.tenant_id
          WHERE job.id = $1
            AND job.status = 'leased'
            AND job.lease_token = $2
            AND job.lease_expires_at > $3
            AND run.status = 'running'`,
        [input.jobId, input.leaseToken, observedAt],
      )
      const row = loaded.rows[0] as Record<string, unknown> | undefined
      if (loaded.rowCount !== 1 || !row) {
        throw durableError(
          'stale_or_missing_lease',
          'The durable work lease is stale or unavailable.',
        )
      }
      const packetPlan = parseJson(row.packet_plan)
      if (
        !isRecord(packetPlan) ||
        !Array.isArray(packetPlan.chunks) ||
        typeof row.plan_sha256 !== 'string' ||
        hashLongPacketPlan(packetPlan) !== row.plan_sha256 ||
        row.plan_sha256 !== row.extraction_plan_sha256 ||
        row.plan_sha256 !== row.run_plan_sha256 ||
        row.source_sha256 !== row.extraction_source_sha256 ||
        row.source_sha256 !== row.run_source_sha256 ||
        row.configuration_sha256 !== row.run_configuration_sha256 ||
        row.planner_version !== row.run_planner_version ||
        row.pipeline_version !== row.run_pipeline_version ||
        row.model_id !== row.expected_model_id ||
        row.prompt_version !== row.expected_prompt_version ||
        (row.branch !== 'mapper' && row.branch !== 'safety')
      ) {
        throw durableError(
          'binding_mismatch',
          'Claimed chunk provenance is inconsistent.',
        )
      }
      const matchingChunks = packetPlan.chunks.filter(
        (chunk) =>
          isRecord(chunk) &&
          chunk.id === row.chunk_id &&
          chunk.provenanceSha256 === row.chunk_provenance_sha256,
      )
      if (matchingChunks.length !== 1) {
        throw durableError(
          'binding_mismatch',
          'Claimed chunk is not uniquely bound to the persisted plan.',
        )
      }
      const packetEmergency = validatePacketEmergency(
        row.packet_emergency_result,
        packetPlan,
      )
      return {
        jobId: row.id as string,
        runId: row.run_id as string,
        tenantId: row.tenant_id as string,
        extractionId: row.extraction_id as string,
        sourceType: deriveSourceType(row.source_filename),
        packetEmergencyResult: packetEmergency.result,
        packetEmergencySha256: packetEmergency.sha256,
        plan: packetPlan,
        chunkId: row.chunk_id as string,
        branch: row.branch,
        chunk: matchingChunks[0],
        modelId: row.model_id as string,
        promptVersion: row.prompt_version as string,
        configurationSha256: row.configuration_sha256 as string,
        sourceSha256: row.source_sha256 as string,
        planSha256: row.plan_sha256 as string,
        plannerVersion: row.planner_version as string,
        pipelineVersion: row.pipeline_version as string,
        safetyPromptVersions: parseJson(row.safety_prompt_versions),
        modelReduceResult: parseJson(row.model_reduce_result),
      }
    } catch (error) {
      wrapPersistenceError(error)
    }
  }

  async function loadClaimedFinalizationContext(input: {
    jobId: string
    leaseToken: string
  }) {
    nonEmpty(input.jobId, 'jobId', 200)
    nonEmpty(input.leaseToken, 'leaseToken', 200)
    const observedAt = now()
    try {
      const loaded = await pool.query(
        `SELECT job.id, job.run_id, job.tenant_id,
                job.configuration_sha256, job.source_sha256, job.plan_sha256,
                job.planner_version, job.pipeline_version,
                job.expected_chunk_count, job.model_id, job.prompt_version,
                run.extraction_id,
                extraction.source_filename,
                extraction.packet_emergency_result,
                extraction.packet_plan,
                extraction.safety_prompt_versions,
                extraction.model_map_result,
                extraction.model_reduce_result,
                extraction.source_sha256 AS extraction_source_sha256,
                extraction.packet_plan_sha256 AS extraction_plan_sha256,
                run.configuration_sha256 AS run_configuration_sha256,
                run.source_sha256 AS run_source_sha256,
                run.plan_sha256 AS run_plan_sha256,
                run.planner_version AS run_planner_version,
                run.pipeline_version AS run_pipeline_version,
                run.reducer_model_id AS run_reducer_model_id,
                run.reducer_prompt_version AS run_reducer_prompt_version,
                triage_session.id AS triage_session_id
           FROM triage_long_packet_finalization_jobs job
           JOIN triage_long_packet_runs run
             ON run.id = job.run_id
            AND run.tenant_id = job.tenant_id
           JOIN triage_extractions extraction
             ON extraction.id = run.extraction_id
            AND extraction.tenant_id = run.tenant_id
           LEFT JOIN triage_sessions triage_session
             ON triage_session.source_extraction_id = extraction.id
            AND triage_session.tenant_id = extraction.tenant_id
          WHERE job.id = $1
            AND job.status = 'leased'
            AND job.lease_token = $2
            AND job.lease_expires_at > $3
            AND run.status = 'running'`,
        [input.jobId, input.leaseToken, observedAt],
      )
      const row = loaded.rows[0] as Record<string, unknown> | undefined
      if (loaded.rowCount !== 1 || !row) {
        throw durableError(
          'stale_or_missing_lease',
          'The durable work lease is stale or unavailable.',
        )
      }
      const packetPlan = parseJson(row.packet_plan)
      if (
        !isRecord(packetPlan) ||
        !Array.isArray(packetPlan.chunks) ||
        packetPlan.chunks.length !== Number(row.expected_chunk_count) ||
        typeof row.plan_sha256 !== 'string' ||
        hashLongPacketPlan(packetPlan) !== row.plan_sha256 ||
        row.plan_sha256 !== row.extraction_plan_sha256 ||
        row.plan_sha256 !== row.run_plan_sha256 ||
        row.source_sha256 !== row.extraction_source_sha256 ||
        row.source_sha256 !== row.run_source_sha256 ||
        row.configuration_sha256 !== row.run_configuration_sha256 ||
        row.planner_version !== row.run_planner_version ||
        row.pipeline_version !== row.run_pipeline_version ||
        row.model_id !== row.run_reducer_model_id ||
        row.prompt_version !== row.run_reducer_prompt_version
      ) {
        throw durableError(
          'binding_mismatch',
          'Claimed finalization provenance is inconsistent.',
        )
      }
      const packetEmergency = validatePacketEmergency(
        row.packet_emergency_result,
        packetPlan,
      )
      return {
        jobId: row.id as string,
        runId: row.run_id as string,
        tenantId: row.tenant_id as string,
        extractionId: row.extraction_id as string,
        sourceType: deriveSourceType(row.source_filename),
        packetEmergencyResult: packetEmergency.result,
        packetEmergencySha256: packetEmergency.sha256,
        triageSessionId:
          typeof row.triage_session_id === 'string'
            ? row.triage_session_id
            : null,
        plan: packetPlan,
        expectedChunkCount: Number(row.expected_chunk_count),
        modelId: row.model_id as string,
        promptVersion: row.prompt_version as string,
        configurationSha256: row.configuration_sha256 as string,
        sourceSha256: row.source_sha256 as string,
        planSha256: row.plan_sha256,
        plannerVersion: row.planner_version as string,
        pipelineVersion: row.pipeline_version as string,
        safetyPromptVersions: parseJson(row.safety_prompt_versions),
        modelMapResult: parseJson(row.model_map_result),
        modelReduceResult: parseJson(row.model_reduce_result),
      }
    } catch (error) {
      wrapPersistenceError(error)
    }
  }

  async function initializeOrGetRun(input: InitializeLongPacketRunInput) {
    const extractionId = nonEmpty(input.extractionId, 'extractionId', 200)
    const tenantId = nonEmpty(input.tenantId, 'tenantId', 200)
    const sourceSha256 = sha256(input.sourceSha256, 'sourceSha256')
    const configuration = validateConfiguration(input.configuration)
    if (!['primary', 'shadow', 'reprocess'].includes(input.runPurpose)) {
      throw durableError('invalid_input', 'runPurpose is invalid.')
    }
    const chunks = validatePlan(input.plan, configuration.plannerVersion)
    const planSha256 = hashLongPacketPlan(input.plan)
    const configurationSha256 = hashLongPacketConfiguration({
      sourceSha256,
      planSha256,
      expectedChunkCount: chunks.length,
      ...configuration,
    })

    let client: PoolClient
    try {
      client = await pool.connect()
    } catch {
      throw durableError(
        'persistence_failed',
        'Durable long-packet persistence failed.',
      )
    }
    try {
      await client.query('BEGIN')
      const extractionResult = await client.query(
        `SELECT id, tenant_id, status, ingestion_mode, source_sha256,
                packet_plan, packet_plan_sha256
           FROM triage_extractions
          WHERE id = $1
            AND tenant_id = $2
          FOR UPDATE`,
        [extractionId, tenantId],
      )
      const extraction = extractionResult.rows[0] as ExtractionRow | undefined
      if (
        extractionResult.rowCount !== 1 ||
        !extraction ||
        extraction.ingestion_mode !== 'long_packet' ||
        extraction.source_sha256 !== sourceSha256 ||
        hashLongPacketPlan(parseJson(extraction.packet_plan)) !== planSha256
      ) {
        throw durableError('binding_mismatch', 'Extraction provenance does not match.')
      }

      if (extraction.packet_plan_sha256 === null) {
        const planDigestUpdate = await client.query(
          `UPDATE triage_extractions
              SET packet_plan_sha256 = $3
            WHERE id = $1
              AND tenant_id = $2
              AND status = 'pending'
              AND ingestion_mode = 'long_packet'
              AND packet_plan_sha256 IS NULL
          RETURNING id`,
          [extractionId, tenantId, planSha256],
        )
        if (normalizeRowCount(planDigestUpdate) !== 1) {
          throw durableError('persistence_failed', 'Plan digest initialization failed.')
        }
      } else if (extraction.packet_plan_sha256 !== planSha256) {
        throw durableError('binding_mismatch', 'Extraction plan digest does not match.')
      }

      const existingResult = await client.query(
        `SELECT id, extraction_id, tenant_id, configuration_sha256,
                run_purpose, source_sha256, plan_sha256,
                expected_chunk_count, planner_version, pipeline_version,
                mapper_model_id, mapper_prompt_version,
                safety_model_id, safety_prompt_version,
                reducer_model_id, reducer_prompt_version,
                status, started_at
           FROM triage_long_packet_runs
          WHERE extraction_id = $1
            AND configuration_sha256 = $2
          FOR UPDATE`,
        [extractionId, configurationSha256],
      )
      const existing = existingResult.rows[0] as RunRow | undefined
      if (existing) {
        if (
          existingResult.rowCount !== 1 ||
          !exactRunMatches(existing, {
            extractionId,
            tenantId,
            configurationSha256,
            sourceSha256,
            planSha256,
            expectedChunkCount: chunks.length,
            configuration,
          })
        ) {
          throw durableError('binding_mismatch', 'Existing run provenance does not match.')
        }
        await readAndVerifyExistingManifest(client, existing.id, {
          tenantId,
          configurationSha256,
          sourceSha256,
          planSha256,
          chunks,
          configuration,
        })

        let status = existing.status
        if (status === 'pending') {
          const resumeResult = await client.query(
            `UPDATE triage_long_packet_runs
                SET status = 'running',
                    started_at = COALESCE(started_at, $4),
                    updated_at = $4
              WHERE id = $1
                AND tenant_id = $2
                AND status = $3
            RETURNING id, status`,
            [existing.id, tenantId, status, now()],
          )
          if (normalizeRowCount(resumeResult) !== 1) {
            throw durableError('persistence_failed', 'Existing run resume failed.')
          }
          status = 'running'
        }
        await client.query('COMMIT')
        return {
          runId: existing.id,
          status,
          runPurpose: existing.run_purpose,
          created: false,
          configurationSha256,
          planSha256,
        }
      }

      const insertRun = await client.query(
        `INSERT INTO triage_long_packet_runs (
           extraction_id, tenant_id, configuration_sha256, run_purpose,
           source_sha256, plan_sha256, expected_chunk_count,
           planner_version, pipeline_version,
           mapper_model_id, mapper_prompt_version,
           safety_model_id, safety_prompt_version,
           reducer_model_id, reducer_prompt_version
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12, $13, $14, $15
         )
         RETURNING id`,
        [
          extractionId,
          tenantId,
          configurationSha256,
          input.runPurpose,
          sourceSha256,
          planSha256,
          chunks.length,
          configuration.plannerVersion,
          configuration.pipelineVersion,
          configuration.mapperModelId,
          configuration.mapperPromptVersion,
          configuration.safetyModelId,
          configuration.safetyPromptVersion,
          configuration.reducerModelId,
          configuration.reducerPromptVersion,
        ],
      )
      const runId = insertRun.rows[0]?.id as string | undefined
      if (normalizeRowCount(insertRun) !== 1 || !runId) {
        throw durableError('persistence_failed', 'Durable run insert failed.')
      }

      const jobs = expectedJobManifest(chunks, configuration)
      const insertJobs = await client.query(
        `INSERT INTO triage_long_packet_chunk_jobs (
           run_id, tenant_id, chunk_id, branch,
           configuration_sha256, source_sha256, plan_sha256,
           planner_version, pipeline_version, chunk_provenance_sha256,
           model_id, prompt_version, max_attempts
         )
         SELECT $1, $2, manifest.chunk_id, manifest.branch,
                $3, $4, $5, $6, $7, manifest.chunk_provenance_sha256,
                manifest.model_id, manifest.prompt_version, $8
           FROM jsonb_to_recordset($9::jsonb) AS manifest(
             chunk_id text,
             branch text,
             chunk_provenance_sha256 text,
             model_id text,
             prompt_version text
           )`,
        [
          runId,
          tenantId,
          configurationSha256,
          sourceSha256,
          planSha256,
          configuration.plannerVersion,
          configuration.pipelineVersion,
          configuration.maxAttempts,
          canonicalLongPacketJSONStringify(jobs),
        ],
      )
      if (normalizeRowCount(insertJobs) !== jobs.length) {
        throw durableError('persistence_failed', 'Durable chunk manifest insert failed.')
      }

      const insertFinalization = await client.query(
        `INSERT INTO triage_long_packet_finalization_jobs (
           run_id, tenant_id, configuration_sha256, source_sha256,
           plan_sha256, planner_version, pipeline_version,
           expected_chunk_count, model_id, prompt_version, max_attempts
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          runId,
          tenantId,
          configurationSha256,
          sourceSha256,
          planSha256,
          configuration.plannerVersion,
          configuration.pipelineVersion,
          chunks.length,
          configuration.reducerModelId,
          configuration.reducerPromptVersion,
          configuration.maxAttempts,
        ],
      )
      if (normalizeRowCount(insertFinalization) !== 1) {
        throw durableError('persistence_failed', 'Durable finalization insert failed.')
      }

      const startedAt = now()
      const startRun = await client.query(
        `UPDATE triage_long_packet_runs
            SET status = 'running',
                started_at = $3,
                updated_at = $3
          WHERE id = $1
            AND tenant_id = $2
            AND status = 'pending'
        RETURNING id, status`,
        [runId, tenantId, startedAt],
      )
      if (normalizeRowCount(startRun) !== 1) {
        throw durableError('persistence_failed', 'Durable run start failed.')
      }

      await client.query('COMMIT')
      return {
        runId,
        status: 'running' as const,
        runPurpose: input.runPurpose,
        created: true,
        configurationSha256,
        planSha256,
      }
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // The original sanitized persistence error remains authoritative.
      }
      wrapPersistenceError(error)
    } finally {
      client.release()
    }
  }

  async function claimChunkJob(input: {
    tenantId: string
    workerId: string
    leaseDurationMs: number
    branch?: LongPacketJobBranch
    jobId?: string
  }): Promise<ClaimedLongPacketJob | null> {
    validateClaimInput(input)
    if (input.branch && !['mapper', 'safety'].includes(input.branch)) {
      throw durableError('invalid_input', 'branch is invalid.')
    }
    const claimedAt = now()
    const expiresAt = new Date(claimedAt.getTime() + input.leaseDurationMs)
    const leaseToken = randomUUID()
    try {
      const claim = await pool.query(
        `WITH candidate AS (
           SELECT job.id, job.status AS previous_status,
                  job.lease_token AS previous_lease_token
             FROM triage_long_packet_chunk_jobs job
             JOIN triage_long_packet_runs run ON run.id = job.run_id
            WHERE job.tenant_id = $1
              AND run.tenant_id = $1
              AND run.status = 'running'
              AND ($2::text IS NULL OR job.branch = $2)
              AND ($3::uuid IS NULL OR job.id = $3)
              AND job.attempt_count < job.max_attempts
              AND (
                job.status = 'pending'
                OR (job.status = 'failed'
                    AND (job.next_retry_at IS NULL OR job.next_retry_at <= $4))
                OR (job.status = 'leased' AND job.lease_expires_at <= $4)
              )
            ORDER BY CASE job.status
                       WHEN 'pending' THEN 0
                       WHEN 'failed' THEN 1
                       ELSE 2
                     END,
                     job.next_retry_at NULLS FIRST,
                     job.created_at,
                     job.id
            FOR UPDATE OF job SKIP LOCKED
            LIMIT 1
         )
         UPDATE triage_long_packet_chunk_jobs job
            SET status = 'leased',
                lease_token = $5,
                lease_owner = $6,
                claimed_at = $4,
                lease_expires_at = $7,
                attempt_count = job.attempt_count + 1,
                next_retry_at = NULL,
                outcome_lease_token = NULL,
                finished_at = NULL,
                updated_at = $4
           FROM candidate
          WHERE job.id = candidate.id
            AND job.tenant_id = $1
            AND job.status = candidate.previous_status
            AND job.lease_token IS NOT DISTINCT FROM candidate.previous_lease_token
            AND job.attempt_count < job.max_attempts
            AND (
              job.status = 'pending'
              OR (job.status = 'failed'
                  AND (job.next_retry_at IS NULL OR job.next_retry_at <= $4))
              OR (job.status = 'leased' AND job.lease_expires_at <= $4)
            )
        RETURNING job.id, job.run_id, job.tenant_id, job.chunk_id, job.branch,
                  job.lease_token, job.attempt_count,
                  candidate.previous_status`,
        [
          input.tenantId,
          input.branch ?? null,
          input.jobId ?? null,
          claimedAt,
          leaseToken,
          input.workerId.trim(),
          expiresAt,
        ],
      )
      if (normalizeRowCount(claim) === 0) return null
      if (normalizeRowCount(claim) !== 1) {
        throw durableError('persistence_failed', 'Chunk claim mutated multiple rows.')
      }
      return parseClaimedJob(
        claim.rows[0] as Record<string, unknown>,
        leaseToken,
      )
    } catch (error) {
      wrapPersistenceError(error)
    }
  }

  async function claimFinalizationJob(input: {
    tenantId: string
    workerId: string
    leaseDurationMs: number
    jobId?: string
  }): Promise<ClaimedLongPacketJob | null> {
    validateClaimInput(input)
    const claimedAt = now()
    const expiresAt = new Date(claimedAt.getTime() + input.leaseDurationMs)
    const leaseToken = randomUUID()
    try {
      const claim = await pool.query(
        `WITH candidate AS (
           SELECT job.id, job.status AS previous_status,
                  job.lease_token AS previous_lease_token
             FROM triage_long_packet_finalization_jobs job
             JOIN triage_long_packet_runs run ON run.id = job.run_id
            WHERE job.tenant_id = $1
              AND run.tenant_id = $1
              AND run.status = 'running'
              AND ($2::uuid IS NULL OR job.id = $2)
              AND job.attempt_count < job.max_attempts
              AND (
                job.status = 'pending'
                OR (job.status = 'failed'
                    AND (job.next_retry_at IS NULL OR job.next_retry_at <= $3))
                OR (job.status = 'leased' AND job.lease_expires_at <= $3)
              )
              AND (
                SELECT count(*)
                  FROM triage_long_packet_chunk_jobs chunk
                 WHERE chunk.run_id = job.run_id
                   AND chunk.branch = 'mapper'
                   AND chunk.status = 'complete'
              ) = job.expected_chunk_count
              AND (
                SELECT count(*)
                  FROM triage_long_packet_chunk_jobs chunk
                 WHERE chunk.run_id = job.run_id
                   AND chunk.branch = 'safety'
                   AND chunk.status = 'complete'
              ) = job.expected_chunk_count
              AND (
                SELECT count(*)
                  FROM triage_long_packet_chunk_jobs chunk
                 WHERE chunk.run_id = job.run_id
              ) = job.expected_chunk_count * 2
            ORDER BY job.created_at, job.id
            FOR UPDATE OF job SKIP LOCKED
            LIMIT 1
         )
         UPDATE triage_long_packet_finalization_jobs job
            SET status = 'leased',
                lease_token = $4,
                lease_owner = $5,
                claimed_at = $3,
                lease_expires_at = $6,
                attempt_count = job.attempt_count + 1,
                next_retry_at = NULL,
                outcome_lease_token = NULL,
                finished_at = NULL,
                updated_at = $3
           FROM candidate
          WHERE job.id = candidate.id
            AND job.tenant_id = $1
            AND job.status = candidate.previous_status
            AND job.lease_token IS NOT DISTINCT FROM candidate.previous_lease_token
            AND job.attempt_count < job.max_attempts
        RETURNING job.id, job.run_id, job.tenant_id,
                  job.lease_token, job.attempt_count,
                  candidate.previous_status`,
        [
          input.tenantId,
          input.jobId ?? null,
          claimedAt,
          leaseToken,
          input.workerId.trim(),
          expiresAt,
        ],
      )
      if (normalizeRowCount(claim) === 0) return null
      if (normalizeRowCount(claim) !== 1) {
        throw durableError('persistence_failed', 'Finalization claim mutated multiple rows.')
      }
      return parseClaimedJob(
        claim.rows[0] as Record<string, unknown>,
        leaseToken,
      )
    } catch (error) {
      wrapPersistenceError(error)
    }
  }

  async function completeJob(input: {
    table: 'triage_long_packet_chunk_jobs' | 'triage_long_packet_finalization_jobs'
    jobId: string
    tenantId: string
    leaseToken: string
    kind: LongPacketResultHashKind
    result: unknown
    branch?: LongPacketJobBranch
  }): Promise<void> {
    nonEmpty(input.jobId, 'jobId', 200)
    nonEmpty(input.tenantId, 'tenantId', 200)
    nonEmpty(input.leaseToken, 'leaseToken', 200)
    const completedAt = now()
    const canonicalResult = canonicalLongPacketJSONStringify(input.result)
    const resultSha256 = hashLongPacketResult(input.kind, input.result)
    const branchClause = input.branch ? 'AND branch = $7' : ''
    const values: unknown[] = [
      input.jobId,
      input.tenantId,
      input.leaseToken,
      completedAt,
      canonicalResult,
      resultSha256,
    ]
    if (input.branch) values.push(input.branch)
    try {
      const completed = await pool.query(
        `UPDATE ${input.table}
            SET status = 'complete',
                lease_token = NULL,
                lease_owner = NULL,
                claimed_at = NULL,
                lease_expires_at = NULL,
                outcome_lease_token = $3,
                result = $5::jsonb,
                result_sha256 = $6,
                next_retry_at = NULL,
                finished_at = $4,
                updated_at = $4
          WHERE id = $1
            AND tenant_id = $2
            AND status = 'leased'
            AND lease_token = $3
            AND lease_expires_at > $4
            ${branchClause}
        RETURNING id`,
        values,
      )
      if (normalizeRowCount(completed) !== 1) {
        throw durableError(
          'stale_or_missing_lease',
          'The durable work lease is stale or unavailable.',
        )
      }
    } catch (error) {
      wrapPersistenceError(error)
    }
  }

  async function failJob(input: {
    table: 'triage_long_packet_chunk_jobs' | 'triage_long_packet_finalization_jobs'
    jobId: string
    tenantId: string
    leaseToken: string
    error: unknown
    nextRetryAt?: Date | null
  }): Promise<void> {
    nonEmpty(input.jobId, 'jobId', 200)
    nonEmpty(input.tenantId, 'tenantId', 200)
    nonEmpty(input.leaseToken, 'leaseToken', 200)
    if (
      input.nextRetryAt !== undefined &&
      input.nextRetryAt !== null &&
      (!(input.nextRetryAt instanceof Date) ||
        !Number.isFinite(input.nextRetryAt.getTime()))
    ) {
      throw durableError('invalid_input', 'nextRetryAt is invalid.')
    }
    const failedAt = now()
    const sanitized = sanitizeFailure(input.error)
    let client: PoolClient
    try {
      client = await pool.connect()
    } catch {
      throw durableError(
        'persistence_failed',
        'Durable long-packet persistence failed.',
      )
    }
    try {
      await client.query('BEGIN')
      const failed = await client.query(
        `UPDATE ${input.table}
            SET status = 'failed',
                lease_token = NULL,
                lease_owner = NULL,
                claimed_at = NULL,
                lease_expires_at = NULL,
                outcome_lease_token = $3,
                result = NULL,
                result_sha256 = NULL,
                last_error_code = $5,
                last_error_detail = $6,
                last_error_at = $4,
                last_error_lease_token = $3,
                next_retry_at = CASE
                  WHEN attempt_count < max_attempts THEN $7::timestamptz
                  ELSE NULL
                END,
                finished_at = $4,
                updated_at = $4
          WHERE id = $1
            AND tenant_id = $2
            AND status = 'leased'
            AND lease_token = $3
            AND lease_expires_at > $4
        RETURNING id, run_id, status, attempt_count, max_attempts`,
        [
          input.jobId,
          input.tenantId,
          input.leaseToken,
          failedAt,
          sanitized.code,
          sanitized.detail,
          input.nextRetryAt ?? null,
        ],
      )
      if (normalizeRowCount(failed) !== 1) {
        throw durableError(
          'stale_or_missing_lease',
          'The durable work lease is stale or unavailable.',
        )
      }
      const failedRow = failed.rows[0] as
        | {
            run_id?: string
            attempt_count?: number
            max_attempts?: number
          }
        | undefined
      if (
        typeof failedRow?.run_id !== 'string' ||
        !Number.isSafeInteger(Number(failedRow.attempt_count)) ||
        !Number.isSafeInteger(Number(failedRow.max_attempts))
      ) {
        throw durableError('persistence_failed', 'Failed job state is invalid.')
      }

      if (Number(failedRow.attempt_count) >= Number(failedRow.max_attempts)) {
        let extractionId: string | undefined
        let extractionErrorDetail = sanitized.detail
        const failedRun = await client.query(
          `UPDATE triage_long_packet_runs
              SET status = 'failed',
                  last_error_code = $4,
                  last_error_detail = $5,
                  last_failed_at = $3,
                  updated_at = $3
            WHERE id = $1
              AND tenant_id = $2
              AND status = 'running'
          RETURNING id, extraction_id`,
          [
            failedRow.run_id,
            input.tenantId,
            failedAt,
            sanitized.code,
            sanitized.detail,
          ],
        )
        if (normalizeRowCount(failedRun) === 0) {
          const existingFailedRun = await client.query(
            `SELECT id, extraction_id, last_error_detail
               FROM triage_long_packet_runs
              WHERE id = $1
                AND tenant_id = $2
                AND status = 'failed'
              FOR SHARE`,
            [failedRow.run_id, input.tenantId],
          )
          if (existingFailedRun.rowCount !== 1) {
            throw durableError('persistence_failed', 'Durable run failure failed.')
          }
          extractionId = existingFailedRun.rows[0]?.extraction_id as
            | string
            | undefined
          const existingErrorDetail =
            existingFailedRun.rows[0]?.last_error_detail
          if (
            typeof existingErrorDetail !== 'string' ||
            !existingErrorDetail.trim() ||
            existingErrorDetail.length > 1_000
          ) {
            throw durableError(
              'persistence_failed',
              'Durable run failure evidence is invalid.',
            )
          }
          extractionErrorDetail = existingErrorDetail
        } else if (normalizeRowCount(failedRun) !== 1) {
          throw durableError('persistence_failed', 'Durable run failure was ambiguous.')
        } else {
          extractionId = failedRun.rows[0]?.extraction_id as
            | string
            | undefined
        }
        if (!extractionId) {
          throw durableError(
            'persistence_failed',
            'Durable run extraction binding is invalid.',
          )
        }
        const failedExtraction = await client.query(
          `UPDATE triage_extractions extraction
              SET status = 'error',
                  error_message = CASE
                    WHEN COALESCE(extraction.model_reduce_result->>'kind', '') = 'partial_safety_hold'
                     AND COALESCE(extraction.model_reduce_result->>'mode', '') = 'workflow_persistence_failed'
                      THEN extraction.error_message
                    ELSE $4
                  END,
                  completed_at = CASE
                    WHEN COALESCE(extraction.model_reduce_result->>'kind', '') = 'partial_safety_hold'
                     AND COALESCE(extraction.model_reduce_result->>'mode', '') = 'workflow_persistence_failed'
                      THEN extraction.completed_at
                    ELSE $3
                  END
            WHERE extraction.id = $1
              AND extraction.tenant_id = $2
              AND extraction.status IN ('pending', 'error')
              AND extraction.ingestion_mode = 'long_packet'
              AND EXISTS (
                SELECT 1
                  FROM triage_long_packet_runs run
                 WHERE run.id = $5
                   AND run.extraction_id = extraction.id
                   AND run.tenant_id = extraction.tenant_id
                   AND run.status = 'failed'
              )
          RETURNING extraction.id`,
          [
            extractionId,
            input.tenantId,
            failedAt,
            extractionErrorDetail,
            failedRow.run_id,
          ],
        )
        if (normalizeRowCount(failedExtraction) !== 1) {
          throw durableError(
            'persistence_failed',
            'Durable extraction failure finalization failed.',
          )
        }
      }
      await client.query('COMMIT')
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // Preserve the original sanitized error.
      }
      wrapPersistenceError(error)
    } finally {
      client.release()
    }
  }

  async function completeFinalizationJob(input: {
    jobId: string
    tenantId: string
    leaseToken: string
    result: unknown
    extraction: FinalizedExtractionPersistence
  }): Promise<void> {
    nonEmpty(input.jobId, 'jobId', 200)
    nonEmpty(input.tenantId, 'tenantId', 200)
    nonEmpty(input.leaseToken, 'leaseToken', 200)
    if (!isRecord(input.result)) {
      throw durableError('invalid_input', 'Finalization result is invalid.')
    }
    const validatedExtraction = validateFinalizedExtraction(input.extraction)
    validateReductionOutcome(input.result, validatedExtraction)
    const completedAt = now()
    const canonicalResult = canonicalLongPacketJSONStringify(input.result)
    const resultSha256 = hashLongPacketResult('finalization', input.result)
    let client: PoolClient
    try {
      client = await pool.connect()
    } catch {
      throw durableError(
        'persistence_failed',
        'Durable long-packet persistence failed.',
      )
    }

    try {
      await client.query('BEGIN')
      const completed = await client.query(
        `UPDATE triage_long_packet_finalization_jobs
            SET status = 'complete',
                lease_token = NULL,
                lease_owner = NULL,
                claimed_at = NULL,
                lease_expires_at = NULL,
                outcome_lease_token = $3,
                result = $5::jsonb,
                result_sha256 = $6,
                next_retry_at = NULL,
                finished_at = $4,
                updated_at = $4
          WHERE id = $1
            AND tenant_id = $2
            AND status = 'leased'
            AND lease_token = $3
            AND lease_expires_at > $4
        RETURNING id, run_id`,
        [
          input.jobId,
          input.tenantId,
          input.leaseToken,
          completedAt,
          canonicalResult,
          resultSha256,
        ],
      )
      const runId = completed.rows[0]?.run_id as string | undefined
      if (normalizeRowCount(completed) !== 1 || !runId) {
        throw durableError(
          'stale_or_missing_lease',
          'The durable work lease is stale or unavailable.',
        )
      }

      const completedRun = await client.query(
        `UPDATE triage_long_packet_runs run
            SET status = 'complete',
                completed_at = $4,
                updated_at = $4
          WHERE run.id = $1
            AND run.tenant_id = $2
            AND run.status = 'running'
            AND EXISTS (
              SELECT 1
                FROM triage_long_packet_finalization_jobs finalization
               WHERE finalization.id = $3
                 AND finalization.run_id = run.id
                 AND finalization.tenant_id = run.tenant_id
                 AND finalization.status = 'complete'
            )
        RETURNING run.id, run.extraction_id`,
        [runId, input.tenantId, input.jobId, completedAt],
      )
      const extractionId = completedRun.rows[0]?.extraction_id as
        | string
        | undefined
      if (normalizeRowCount(completedRun) !== 1 || !extractionId) {
        throw durableError('persistence_failed', 'Durable run completion failed.')
      }

      const lockedExtraction = await client.query(
        `SELECT id, status, source_sha256, packet_plan,
                safety_prompt_versions, model_map_result, model_reduce_result
           FROM triage_extractions
          WHERE id = $1
            AND tenant_id = $2
            AND ingestion_mode = 'long_packet'
          FOR UPDATE`,
        [extractionId, input.tenantId],
      )
      if (normalizeRowCount(lockedExtraction) !== 1) {
        throw durableError(
          'persistence_failed',
          'Durable extraction authority lock failed.',
        )
      }
      const lockedRow = lockedExtraction.rows[0] as Record<string, unknown>
      if (
        canonicalInputJson(
          parseJson(lockedRow.safety_prompt_versions),
          'persistedSafetyPromptVersions',
        ) !== validatedExtraction.safetyPromptVersionsJson
      ) {
        throw durableError(
          'persistence_failed',
          'Durable extraction prompt provenance changed before finalization.',
        )
      }
      const existingModelReduce = parseJson(lockedRow.model_reduce_result)
      const lockedPlan = parseJson(lockedRow.packet_plan) as LongPacketPlan
      const hasValidatedCompletePipeline =
        input.result.status === 'completed' &&
        input.result.coverageStatus === 'complete'
      let hasValidatedAggregatePipeline = false
      const validatedCompletePipeline = hasValidatedCompletePipeline
        ? validatePersistedLongPacketModelPipeline(
          lockedPlan,
          input.extraction.modelMapResult,
          input.result,
        )
        : null
      if (validatedCompletePipeline) {
        hasValidatedAggregatePipeline = true
      } else {
        try {
          validatePersistedLongPacketAggregateSafety(
            lockedPlan,
            input.extraction.modelMapResult,
            input.result,
          )
          hasValidatedAggregatePipeline = true
        } catch {
          // Other incomplete outcomes remain valid error finalizations, but
          // they cannot claim equivalence to an atomically staged aggregate.
        }
      }
      const hasSafetyAudit =
        isRecord(existingModelReduce) &&
        existingModelReduce.kind === 'partial_safety_hold'
      if (hasSafetyAudit) {
        const plan = lockedPlan
        const sourceSha256 = lockedRow.source_sha256
        if (typeof sourceSha256 !== 'string') {
          throw durableError(
            'persistence_failed',
            'Durable extraction safety binding is invalid.',
          )
        }
        const validatedAudit = validateLongPacketPartialSafetyHold({
          plan,
          sourceSha256,
          safetyPromptVersions: parseJson(lockedRow.safety_prompt_versions),
          value: existingModelReduce,
        })
        if (validatedAudit.artifact.mode === 'workflow_persistence_failed') {
          throw durableError(
            'persistence_failed',
            'Terminal workflow-persistence safety hold cannot be replaced.',
          )
        }
        if (hasValidatedCompletePipeline) {
          validateLongPacketSafetyAuditReplacement({
            plan,
            sourceSha256,
            safetyPromptVersions: parseJson(
              lockedRow.safety_prompt_versions,
            ),
            existing: existingModelReduce,
            modelMapResult: input.extraction.modelMapResult,
            modelReduceResult: input.result,
          })
        }
      } else if (
        existingModelReduce !== null &&
        existingModelReduce !== undefined
      ) {
        const exactStagedPipeline =
          hasValidatedAggregatePipeline &&
          canonicalInputJson(
            existingModelReduce,
            'stagedModelReduceResult',
          ) === canonicalResult &&
          canonicalInputJson(
            parseJson(lockedRow.model_map_result),
            'stagedModelMapResult',
          ) === validatedExtraction.modelMapResultJson
        if (!exactStagedPipeline) {
          // A pending/error long-packet row may contain no reducer result, the
          // exact versioned safety audit, or a byte-identical validated
          // aggregate staged atomically with its safety workflow. Never
          // overwrite any other artifact during finalization.
          throw durableError(
            'persistence_failed',
            'Durable extraction reducer authority is inconsistent.',
          )
        }
      }

      if (
        validatedCompletePipeline &&
        input.extraction.outcome === 'success'
      ) {
        assertLongPacketPersistedClinicalExtractionMatches({
          pipeline: validatedCompletePipeline,
          deterministicGateway: scanLongPacketEmergency(lockedPlan),
          actual: input.extraction,
        })
      }

      const completedExtraction =
        validatedExtraction.outcome === 'success'
          ? await client.query(
              `UPDATE triage_extractions extraction
                  SET note_type_detected = $4,
                      extraction_confidence = $5,
                      extracted_summary = $6,
                      key_findings = $7::jsonb,
                      model_map_result = $8::jsonb,
                      model_reduce_result = $9::jsonb,
                      safety_screened_at = $11,
                      status = 'complete',
                      error_message = NULL,
                      completed_at = $3
                WHERE extraction.id = $1
                  AND extraction.tenant_id = $2
                  AND extraction.status IN ('pending', 'error')
                  AND NOT (
                    COALESCE(extraction.model_reduce_result->>'kind', '') = 'partial_safety_hold'
                    AND COALESCE(extraction.model_reduce_result->>'mode', '') = 'workflow_persistence_failed'
                  )
                  AND extraction.ingestion_mode = 'long_packet'
                  AND extraction.packet_plan_sha256 IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                      FROM triage_long_packet_runs run
                     WHERE run.id = $12
                       AND run.extraction_id = extraction.id
                       AND run.tenant_id = extraction.tenant_id
                       AND run.status = 'complete'
                  )
              RETURNING extraction.id`,
              [
                extractionId,
                input.tenantId,
                completedAt,
                validatedExtraction.noteTypeDetected,
                validatedExtraction.extractionConfidence,
                validatedExtraction.extractedSummary,
                validatedExtraction.keyFindingsJson,
                validatedExtraction.modelMapResultJson,
                canonicalResult,
                validatedExtraction.safetyPromptVersionsJson,
                validatedExtraction.safetyScreenedAt,
                runId,
              ],
            )
          : await client.query(
              `UPDATE triage_extractions extraction
                  SET note_type_detected = NULL,
                      extraction_confidence = NULL,
                      extracted_summary = NULL,
                      key_findings = NULL,
                      model_map_result = CASE
                        WHEN COALESCE(extraction.model_reduce_result->>'kind', '') = 'partial_safety_hold'
                         AND $10::boolean = false
                          THEN extraction.model_map_result
                        ELSE $4::jsonb
                      END,
                      model_reduce_result = CASE
                        WHEN COALESCE(extraction.model_reduce_result->>'kind', '') = 'partial_safety_hold'
                         AND $10::boolean = false
                          THEN extraction.model_reduce_result
                        ELSE $5::jsonb
                      END,
                      safety_screened_at = $7,
                      status = 'error',
                      error_message = $8,
                      completed_at = $3
                WHERE extraction.id = $1
                  AND extraction.tenant_id = $2
                  AND extraction.status IN ('pending', 'error')
                  AND NOT (
                    COALESCE(extraction.model_reduce_result->>'kind', '') = 'partial_safety_hold'
                    AND COALESCE(extraction.model_reduce_result->>'mode', '') = 'workflow_persistence_failed'
                  )
                  AND extraction.ingestion_mode = 'long_packet'
                  AND extraction.packet_plan_sha256 IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                      FROM triage_long_packet_runs run
                     WHERE run.id = $9
                       AND run.extraction_id = extraction.id
                       AND run.tenant_id = extraction.tenant_id
                       AND run.status = 'complete'
                  )
              RETURNING extraction.id`,
              [
                extractionId,
                input.tenantId,
                completedAt,
                validatedExtraction.modelMapResultJson,
                canonicalResult,
                validatedExtraction.safetyPromptVersionsJson,
                validatedExtraction.safetyScreenedAt,
                validatedExtraction.errorMessage,
                runId,
                hasValidatedCompletePipeline,
              ],
            )
      if (normalizeRowCount(completedExtraction) !== 1) {
        throw durableError(
          'persistence_failed',
          'Durable extraction finalization failed.',
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // Preserve the original sanitized error.
      }
      wrapPersistenceError(error)
    } finally {
      client.release()
    }
  }

  async function readCompletedChunkOutcomes(input: {
    runId: string
    tenantId: string
  }): Promise<CompletedChunkOutcomes> {
    nonEmpty(input.runId, 'runId', 200)
    nonEmpty(input.tenantId, 'tenantId', 200)
    try {
      const runResult = await pool.query(
        `SELECT run.id, run.tenant_id, run.expected_chunk_count,
                run.configuration_sha256, run.source_sha256,
                run.plan_sha256, run.planner_version, run.pipeline_version,
                run.mapper_model_id, run.mapper_prompt_version,
                run.safety_model_id, run.safety_prompt_version,
                extraction.packet_plan
           FROM triage_long_packet_runs run
           JOIN triage_extractions extraction
             ON extraction.id = run.extraction_id
            AND extraction.tenant_id = run.tenant_id
          WHERE run.id = $1
            AND run.tenant_id = $2
            AND run.status = 'running'`,
        [input.runId, input.tenantId],
      )
      const run = runResult.rows[0] as RunContextRow | undefined
      if (runResult.rowCount !== 1 || !run) {
        throw durableError('incomplete_outcomes', 'Durable run is not reducible.')
      }
      const packetPlan = parseJson(run.packet_plan)
      if (!isRecord(packetPlan) || !Array.isArray(packetPlan.chunks)) {
        throw durableError('incomplete_outcomes', 'Durable run plan is invalid.')
      }
      const chunks = packetPlan.chunks as Array<Record<string, unknown>>
      if (
        chunks.length !== Number(run.expected_chunk_count) ||
        chunks.some(
          (chunk) =>
            typeof chunk.id !== 'string' ||
            typeof chunk.provenanceSha256 !== 'string',
        )
      ) {
        throw durableError('incomplete_outcomes', 'Durable run plan is incomplete.')
      }

      const jobsResult = await pool.query(
        `SELECT chunk_id, branch, status, result, result_sha256,
                configuration_sha256, source_sha256, plan_sha256,
                planner_version, pipeline_version,
                chunk_provenance_sha256, model_id, prompt_version
           FROM triage_long_packet_chunk_jobs
          WHERE run_id = $1
            AND tenant_id = $2
          ORDER BY chunk_id, branch`,
        [input.runId, input.tenantId],
      )
      if (normalizeRowCount(jobsResult) !== chunks.length * 2) {
        throw durableError('incomplete_outcomes', 'Durable outcomes are incomplete.')
      }
      const rows = jobsResult.rows as ChunkJobRow[]
      const byKey = new Map(
        rows.map((row) => [`${row.branch}\u0000${row.chunk_id}`, row]),
      )
      if (byKey.size !== chunks.length * 2) {
        throw durableError('incomplete_outcomes', 'Durable outcomes are duplicated.')
      }

      const output: CompletedChunkOutcomes = { mapper: [], safety: [] }
      for (const chunk of chunks) {
        for (const branch of ['mapper', 'safety'] as const) {
          const row = byKey.get(`${branch}\u0000${chunk.id}`)
          const expectedModel =
            branch === 'mapper' ? run.mapper_model_id : run.safety_model_id
          const expectedPrompt =
            branch === 'mapper'
              ? run.mapper_prompt_version
              : run.safety_prompt_version
          if (
            !row ||
            row.status !== 'complete' ||
            row.chunk_provenance_sha256 !== chunk.provenanceSha256 ||
            row.configuration_sha256 !== run.configuration_sha256 ||
            row.source_sha256 !== run.source_sha256 ||
            row.plan_sha256 !== run.plan_sha256 ||
            row.planner_version !== run.planner_version ||
            row.pipeline_version !== run.pipeline_version ||
            row.model_id !== expectedModel ||
            row.prompt_version !== expectedPrompt ||
            !isRecord(parseJson(row.result)) ||
            typeof row.result_sha256 !== 'string' ||
            row.result_sha256 !== hashLongPacketResult(branch, parseJson(row.result))
          ) {
            throw durableError(
              'incomplete_outcomes',
              'Durable outcome provenance is invalid.',
            )
          }
          output[branch].push({
            chunkId: row.chunk_id,
            branch,
            result: parseJson(row.result),
            resultSha256: row.result_sha256,
          })
        }
      }
      return output
    } catch (error) {
      wrapPersistenceError(error)
    }
  }

  return {
    listDispatchableJobRefs,
    claimJobByRef,
    loadClaimedChunkPayload,
    loadClaimedFinalizationContext,
    initializeOrGetRun,
    claimChunkJob,
    claimFinalizationJob,
    completeChunkJob(input: {
      jobId: string
      tenantId: string
      leaseToken: string
      branch: LongPacketJobBranch
      result: unknown
    }) {
      return completeJob({
        ...input,
        table: 'triage_long_packet_chunk_jobs',
        kind: input.branch,
      })
    },
    completeFinalizationJob,
    failChunkJob(input: {
      jobId: string
      tenantId: string
      leaseToken: string
      error: unknown
      nextRetryAt?: Date | null
    }) {
      return failJob({ ...input, table: 'triage_long_packet_chunk_jobs' })
    },
    failFinalizationJob(input: {
      jobId: string
      tenantId: string
      leaseToken: string
      error: unknown
      nextRetryAt?: Date | null
    }) {
      return failJob({
        ...input,
        table: 'triage_long_packet_finalization_jobs',
      })
    },
    readCompletedChunkOutcomes,
  }
}
