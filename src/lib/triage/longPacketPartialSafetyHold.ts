import { getPool } from '@/lib/db'
import type { PoolClient } from 'pg'
import {
  canonicalLongPacketJSONStringify,
  hashLongPacketPlan,
} from './longPacketCanonicalHash'
import { LONG_PACKET_CLINICAL_MAPPER_PROMPT_VERSION } from './longPacketClinicalMapper'
import { scanLongPacketEmergency } from './longPacketEmergency'
import { assertLongPacketPersistedClinicalExtractionMatches } from './longPacketIngestion'
import {
  LONG_PACKET_MODEL_PIPELINE_VERSION,
  validatePersistedLongPacketAggregateSafety,
  validatePersistedLongPacketModelPipeline,
  validatePersistedLongPacketMapperBranchOutcome,
  validatePersistedLongPacketSafetyBranchOutcome,
  type LongPacketMapperBranchOutcome,
  type LongPacketSafetyBranchOutcome,
} from './longPacketModelPipeline'
import type { LongPacketPlan } from './longPacketPlanner'
import { mergeLongPacketModelSafety } from './longPacketModelSafetyMerge'
import type { ValidatedModelSafetyExtraction } from './modelSafetyExtraction'
import { MODEL_SAFETY_EXTRACTION_PROMPT_VERSION } from './modelSafetyExtractor'
import { EVALUATED_CLINICAL_MODEL_CANDIDATES } from './modelRegistry'
import type { ExtractionKeyFindings, TriageConfidence } from './types'
import {
  assertLongPacketDurableLeaseAuthority,
  type LongPacketDurableLeaseAuthority,
} from './longPacketDurableLeaseAuthority'
import {
  longPacketSafetyPersistenceFailureMessage,
  parseLongPacketSafetyPersistenceFailure,
  type ActionableLongPacketSafetyPathway,
} from './longPacketSafetyPersistenceFailure'

export const LONG_PACKET_PARTIAL_SAFETY_HOLD_VERSION =
  'neurology-long-packet-partial-safety-hold-v2'
export const LONG_PACKET_PARTIAL_SAFETY_HOLD_ERROR_MESSAGE =
  'Validated urgent long-packet evidence could not be persisted to its mandatory safety workflow. The source-bound safety hold was preserved; immediate human review is required.'

export interface LongPacketPartialSafetyPromptBindings {
  clinicalMapper: string
  safetyExtractor: string
  clinicalMapperModel: string
  safetyExtractorModel: string
}

/**
 * Immutable, schema-versioned provenance allowlist. Add prior approved
 * bindings here when a prompt or model changes; never derive this registry
 * from the mutable extraction row.
 */
export const LONG_PACKET_PARTIAL_SAFETY_PROMPT_ALLOWLIST: readonly Pick<
  LongPacketPartialSafetyPromptBindings,
  'clinicalMapper' | 'safetyExtractor'
>[] =
  Object.freeze([
    Object.freeze({
      clinicalMapper: LONG_PACKET_CLINICAL_MAPPER_PROMPT_VERSION,
      safetyExtractor: MODEL_SAFETY_EXTRACTION_PROMPT_VERSION,
    }),
  ])

export const LONG_PACKET_PARTIAL_SAFETY_DEFAULT_BINDINGS: LongPacketPartialSafetyPromptBindings =
  Object.freeze({
    ...LONG_PACKET_PARTIAL_SAFETY_PROMPT_ALLOWLIST[0],
    clinicalMapperModel:
      'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    safetyExtractorModel: 'us.anthropic.claude-sonnet-5',
  })

export type LongPacketPartialSafetyProjection = {
  outcome: LongPacketMapperBranchOutcome | LongPacketSafetyBranchOutcome
  modelProfile: string
  promptVersion: string
  pipelineVersion: typeof LONG_PACKET_MODEL_PIPELINE_VERSION
}

export interface LongPacketPartialSafetyHold {
  version: typeof LONG_PACKET_PARTIAL_SAFETY_HOLD_VERSION
  kind: 'partial_safety_hold'
  mode: LongPacketSafetyAuditMode
  completionAuthorized: false
  sourceSha256: string
  packetPlanSha256: string
  carePathway: 'emergency_now' | 'same_day_clinician_review'
  projections: LongPacketPartialSafetyProjection[]
}

export type LongPacketSafetyAuditMode =
  | 'safety_checkpoint'
  | 'workflow_persistence_failed'

export interface ValidatedLongPacketPartialSafetyHold {
  artifact: LongPacketPartialSafetyHold
  safetyResult: ValidatedModelSafetyExtraction
  pipelineComplete: false
}

type UrgentLongPacketSafetyResult = Omit<
  ValidatedModelSafetyExtraction,
  'carePathway'
> & {
  carePathway: 'emergency_now' | 'same_day_clinician_review'
}

export class LongPacketPartialSafetyHoldPersistedError extends Error {
  readonly name = 'LongPacketPartialSafetyHoldPersistedError'

  constructor() {
    super(LONG_PACKET_PARTIAL_SAFETY_HOLD_ERROR_MESSAGE)
  }
}

const ARTIFACT_KEYS = [
  'version',
  'kind',
  'mode',
  'completionAuthorized',
  'sourceSha256',
  'packetPlanSha256',
  'carePathway',
  'projections',
] as const
const PROJECTION_KEYS = [
  'outcome',
  'modelProfile',
  'promptVersion',
  'pipelineVersion',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  )
}

function invalidHold(): never {
  throw new Error('Persisted long-packet partial safety hold is invalid.')
}

function parsePersistedJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return invalidHold()
  }
}

function promptBindingMatches(
  value: Record<string, unknown>,
  expected: Pick<
    LongPacketPartialSafetyPromptBindings,
    'clinicalMapper' | 'safetyExtractor'
  >,
): boolean {
  return (
    value.clinicalMapper === expected.clinicalMapper &&
    value.safetyExtractor === expected.safetyExtractor
  )
}

function validateTrustedBindings(
  value: unknown,
): LongPacketPartialSafetyPromptBindings {
  if (!isRecord(value)) invalidHold()
  const allowedPrompt = LONG_PACKET_PARTIAL_SAFETY_PROMPT_ALLOWLIST.find(
    (candidate) => promptBindingMatches(value, candidate),
  )
  const evaluatedModels = new Set<string>(
    EVALUATED_CLINICAL_MODEL_CANDIDATES,
  )
  if (
    !allowedPrompt ||
    typeof value.clinicalMapperModel !== 'string' ||
    !evaluatedModels.has(value.clinicalMapperModel) ||
    typeof value.safetyExtractorModel !== 'string' ||
    !evaluatedModels.has(value.safetyExtractorModel)
  ) {
    invalidHold()
  }
  return {
    ...allowedPrompt,
    clinicalMapperModel: value.clinicalMapperModel,
    safetyExtractorModel: value.safetyExtractorModel,
  }
}

function validateProjectionBinding(
  projection: Record<string, unknown>,
  rowBindings: LongPacketPartialSafetyPromptBindings,
  branch: 'clinical_mapper' | 'safety_extractor',
): void {
  const expectedModel =
    branch === 'clinical_mapper'
      ? rowBindings.clinicalMapperModel
      : rowBindings.safetyExtractorModel
  const expectedPrompt =
    branch === 'clinical_mapper'
      ? rowBindings.clinicalMapper
      : rowBindings.safetyExtractor
  if (
    projection.modelProfile !== expectedModel ||
    projection.promptVersion !== expectedPrompt ||
    projection.pipelineVersion !== LONG_PACKET_MODEL_PIPELINE_VERSION
  ) {
    invalidHold()
  }
}

export function deriveLongPacketMapperSafetyFloor(
  outcome: LongPacketMapperBranchOutcome,
): UrgentLongPacketSafetyResult {
  if (!outcome.result) invalidHold()
  const actionableFacts = outcome.result.facts
    .filter(
      (fact) =>
        fact.category === 'red_flag' &&
        fact.assertion !== 'negated' &&
        fact.temporality !== 'historical',
    )
  const actionableRedFlags = actionableFacts
    .map((fact) => `Mapper red flag: ${fact.statement}`)
  const criticalUnknownFacts = outcome.result.facts
    .filter((fact) => fact.category === 'critical_unknown')
  const criticalUnknowns = criticalUnknownFacts
    .map((fact) => fact.statement)
  const sourceConflicts = outcome.result.conflicts
  const conflicts = sourceConflicts.map(
    (conflict) => `Source conflict: ${conflict.description}`,
  )
  const reviewReasons = [
    ...actionableRedFlags,
    ...criticalUnknowns,
    ...conflicts,
  ]
    .map((reason) => reason.slice(0, 2_000))
    .filter(Boolean)
    .slice(0, 50)
  if (reviewReasons.length === 0) invalidHold()
  const signals = [
    ...actionableFacts.map((fact, index) => ({
      code: `mapper_red_flag_${index}`,
      syndrome: 'other_time_critical' as const,
      source: 'safety_model' as const,
      action: 'immediate_clinician_review' as const,
      assertion:
        fact.assertion === 'present'
          ? 'present' as const
          : fact.assertion === 'conditional'
            ? 'conditional' as const
            : 'uncertain' as const,
      temporality:
        fact.temporality === 'current'
          ? 'current' as const
          : fact.temporality === 'recent'
            ? 'recent' as const
            : 'unknown' as const,
      experiencer: 'unknown' as const,
      evidence: fact.evidence.slice(0, 10),
    })),
    ...criticalUnknownFacts.map((fact, index) => ({
      code: `mapper_critical_unknown_${index}`,
      syndrome: 'other_time_critical' as const,
      source: 'safety_model' as const,
      action: 'immediate_clinician_review' as const,
      assertion: 'uncertain' as const,
      temporality: 'unknown' as const,
      experiencer: 'unknown' as const,
      evidence: fact.evidence.slice(0, 10),
    })),
    ...sourceConflicts.map((conflict, index) => ({
      code: `mapper_source_conflict_${index}`,
      syndrome: 'other_time_critical' as const,
      source: 'safety_model' as const,
      action: 'immediate_clinician_review' as const,
      assertion: 'uncertain' as const,
      temporality: 'unknown' as const,
      experiencer: 'unknown' as const,
      evidence: conflict.evidence.slice(0, 10),
    })),
  ].slice(0, 50)
  return {
    carePathway: 'same_day_clinician_review',
    dataQuality: conflicts.length > 0 ? 'conflicting' : 'partial',
    criticalUnknowns: reviewReasons,
    signals,
  }
}

function validateProjection(input: {
  plan: LongPacketPlan
  rowBindings: LongPacketPartialSafetyPromptBindings
  value: unknown
}): {
  projection: LongPacketPartialSafetyProjection
  safetyResult: UrgentLongPacketSafetyResult
} {
  if (!isRecord(input.value) || !hasExactKeys(input.value, PROJECTION_KEYS)) {
    invalidHold()
  }
  if (!isRecord(input.value.outcome)) invalidHold()
  const branch = input.value.outcome.branch
  if (branch === 'safety_extractor') {
    validateProjectionBinding(input.value, input.rowBindings, branch)
    const outcome = validatePersistedLongPacketSafetyBranchOutcome(
      input.plan,
      input.value.outcome,
    )
    if (
      !outcome.result ||
      (outcome.result.carePathway !== 'emergency_now' &&
        outcome.result.carePathway !== 'same_day_clinician_review')
    ) {
      invalidHold()
    }
    return {
      projection: input.value as unknown as LongPacketPartialSafetyProjection,
      safetyResult: {
        ...outcome.result,
        carePathway: outcome.result.carePathway,
        dataQuality:
          outcome.result.dataQuality === 'conflicting'
            ? 'conflicting'
            : 'partial',
      },
    }
  }
  if (branch === 'clinical_mapper') {
    validateProjectionBinding(input.value, input.rowBindings, branch)
    const outcome = validatePersistedLongPacketMapperBranchOutcome(
      input.plan,
      input.value.outcome,
    )
    return {
      projection: input.value as unknown as LongPacketPartialSafetyProjection,
      safetyResult: deriveLongPacketMapperSafetyFloor(outcome),
    }
  }
  return invalidHold()
}

function baseProjectionCount(plan: LongPacketPlan): number {
  return Math.max(2, plan.chunks.length * 2)
}

function maxProjectionCount(plan: LongPacketPlan): number {
  return baseProjectionCount(plan) + 1
}

function projectionKey(projection: LongPacketPartialSafetyProjection): string {
  return canonicalLongPacketJSONStringify(projection)
}

function aggregateProjectionSafety(
  validated: Array<{
    projection: LongPacketPartialSafetyProjection
    safetyResult: UrgentLongPacketSafetyResult
  }>,
): UrgentLongPacketSafetyResult {
  if (validated.length === 0) invalidHold()
  let merged: ValidatedModelSafetyExtraction | null = null
  let conflicting = false
  for (const item of validated) {
    conflicting ||= item.safetyResult.dataQuality === 'conflicting'
    merged = mergeLongPacketModelSafety(merged, item.safetyResult)
  }
  if (
    !merged ||
    (merged.carePathway !== 'emergency_now' &&
      merged.carePathway !== 'same_day_clinician_review')
  ) {
    invalidHold()
  }
  return {
    ...merged,
    carePathway: merged.carePathway,
    dataQuality: conflicting ? 'conflicting' : 'partial',
  }
}

export function validateLongPacketPartialSafetyHold(input: {
  plan: LongPacketPlan
  sourceSha256: string
  safetyPromptVersions: unknown
  value: unknown
}): ValidatedLongPacketPartialSafetyHold {
  const value = parsePersistedJson(input.value)
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ARTIFACT_KEYS) ||
    value.version !== LONG_PACKET_PARTIAL_SAFETY_HOLD_VERSION ||
    value.kind !== 'partial_safety_hold' ||
    (value.mode !== 'safety_checkpoint' &&
      value.mode !== 'workflow_persistence_failed') ||
    value.completionAuthorized !== false ||
    typeof value.sourceSha256 !== 'string' ||
    value.sourceSha256 !== input.sourceSha256 ||
    !/^[a-f0-9]{64}$/.test(value.sourceSha256) ||
    typeof value.packetPlanSha256 !== 'string' ||
    value.packetPlanSha256 !== hashLongPacketPlan(input.plan) ||
    (value.carePathway !== 'emergency_now' &&
      value.carePathway !== 'same_day_clinician_review') ||
    !Array.isArray(value.projections) ||
    value.projections.length < 1 ||
    value.projections.length > maxProjectionCount(input.plan)
  ) {
    invalidHold()
  }
  const rowBindings = validateTrustedBindings(input.safetyPromptVersions)
  const validated = value.projections.map((projection) =>
    validateProjection({
      plan: input.plan,
      rowBindings,
      value: projection,
    }),
  )
  const canonicalKeys = validated.map((item) =>
    projectionKey(item.projection),
  )
  if (new Set(canonicalKeys).size !== canonicalKeys.length) invalidHold()
  const safetyResult = aggregateProjectionSafety(validated)
  if (
    value.projections.length > baseProjectionCount(input.plan) &&
    !validated.some(
      (item) => item.safetyResult.carePathway === 'emergency_now',
    )
  ) {
    invalidHold()
  }
  if (value.carePathway !== safetyResult.carePathway) invalidHold()
  return {
    artifact: value as unknown as LongPacketPartialSafetyHold,
    safetyResult,
    pipelineComplete: false,
  }
}

export function mergeLongPacketPartialSafetyHold(input: {
  plan: LongPacketPlan
  sourceSha256: string
  safetyPromptVersions: unknown
  existing: unknown
  mode?: LongPacketSafetyAuditMode
  projection: LongPacketPartialSafetyProjection
}): LongPacketPartialSafetyHold {
  const rowBindings = validateTrustedBindings(input.safetyPromptVersions)
  const incoming = validateProjection({
    plan: input.plan,
    rowBindings,
    value: input.projection,
  })
  const existingValidated =
    input.existing === null || input.existing === undefined
      ? null
      : validateLongPacketPartialSafetyHold({
          plan: input.plan,
          sourceSha256: input.sourceSha256,
          safetyPromptVersions: rowBindings,
          value: input.existing,
        })
  const retained = existingValidated
    ? [...existingValidated.artifact.projections]
    : []
  const incomingKey = projectionKey(incoming.projection)
  if (!retained.some((projection) => projectionKey(projection) === incomingKey)) {
    if (
      incoming.safetyResult.carePathway === 'same_day_clinician_review' &&
      retained.length >= baseProjectionCount(input.plan)
    ) {
      invalidHold()
    }
    const capacity = maxProjectionCount(input.plan)
    if (retained.length >= capacity) {
      // Never discard already-validated evidence to admit a retry. The caller
      // fails closed when the bounded audit is full.
      invalidHold()
    }
    retained.push(incoming.projection)
  }
  retained.sort((left, right) =>
    projectionKey(left).localeCompare(projectionKey(right)),
  )
  const validated = retained.map((projection) =>
    validateProjection({
      plan: input.plan,
      rowBindings,
      value: projection,
    }),
  )
  const safetyResult = aggregateProjectionSafety(validated)
  const artifact: LongPacketPartialSafetyHold = {
    version: LONG_PACKET_PARTIAL_SAFETY_HOLD_VERSION,
    kind: 'partial_safety_hold',
    mode:
      existingValidated?.artifact.mode === 'workflow_persistence_failed' ||
      input.mode !== 'safety_checkpoint'
        ? 'workflow_persistence_failed'
        : 'safety_checkpoint',
    completionAuthorized: false,
    sourceSha256: input.sourceSha256,
    packetPlanSha256: hashLongPacketPlan(input.plan),
    carePathway: safetyResult.carePathway,
    projections: retained,
  }
  return validateLongPacketPartialSafetyHold({
    plan: input.plan,
    sourceSha256: input.sourceSha256,
    safetyPromptVersions: rowBindings,
    value: artifact,
  }).artifact
}

/**
 * Proves that a complete persisted pipeline is a safety superset of a prior
 * source-bound checkpoint. Aggregate pathway labels are never trusted: both
 * artifacts are revalidated and every exact checkpoint outcome must occur in
 * the complete pipeline.
 */
export function validateLongPacketSafetyAuditReplacement(input: {
  plan: LongPacketPlan
  sourceSha256: string
  safetyPromptVersions: unknown
  existing: unknown
  modelMapResult: unknown
  modelReduceResult: unknown
}): void {
  const checkpoint = validateLongPacketPartialSafetyHold({
    plan: input.plan,
    sourceSha256: input.sourceSha256,
    safetyPromptVersions: input.safetyPromptVersions,
    value: input.existing,
  })
  if (checkpoint.artifact.mode !== 'safety_checkpoint') invalidHold()
  const pipeline = validatePersistedLongPacketModelPipeline(
    input.plan,
    input.modelMapResult,
    input.modelReduceResult,
  )
  const mapperOutcomes = new Set(
    pipeline.mapperOutcomes.map((outcome) =>
      canonicalLongPacketJSONStringify(outcome),
    ),
  )
  const safetyOutcomes = new Set(
    pipeline.safetyOutcomes.map((outcome) =>
      canonicalLongPacketJSONStringify(outcome),
    ),
  )
  for (const projection of checkpoint.artifact.projections) {
    const outcomes =
      projection.outcome.branch === 'clinical_mapper'
        ? mapperOutcomes
        : safetyOutcomes
    if (!outcomes.has(canonicalLongPacketJSONStringify(projection.outcome))) {
      invalidHold()
    }
  }
}

export type PersistValidatedLongPacketCompletionResult =
  | { ok: true }
  | { ok: false; reason: 'persistence_failed' }

export async function persistLongPacketSafetyPersistenceFailureFloor(input: {
  extractionId: string
  tenantId: string
  carePathway: ActionableLongPacketSafetyPathway
}): Promise<PersistValidatedLongPacketCompletionResult> {
  let client: PoolClient
  try {
    client = await (await getPool()).connect()
  } catch {
    return { ok: false, reason: 'persistence_failed' }
  }
  try {
    await client.query('BEGIN')
    const locked = await client.query(
      `SELECT id, status, error_message
         FROM triage_extractions
        WHERE id = $1
          AND tenant_id = $2
        FOR UPDATE`,
      [input.extractionId, input.tenantId],
    )
    const row = locked.rows[0] as Record<string, unknown> | undefined
    if (
      locked.rowCount !== 1 ||
      !row ||
      (row.status !== 'pending' && row.status !== 'error')
    ) {
      invalidHold()
    }
    const existing = parseLongPacketSafetyPersistenceFailure(
      row.error_message,
    )
    const target =
      existing === 'emergency_now' || input.carePathway === 'emergency_now'
        ? 'emergency_now'
        : 'same_day_clinician_review'
    const updated = await client.query(
      `UPDATE triage_extractions
          SET status = 'error',
              error_message = $3,
              completed_at = NOW()
        WHERE id = $1
          AND tenant_id = $2
          AND status IN ('pending', 'error')
      RETURNING id`,
      [
        input.extractionId,
        input.tenantId,
        longPacketSafetyPersistenceFailureMessage(target),
      ],
    )
    if (updated.rowCount !== 1 || updated.rows[0]?.id !== input.extractionId) {
      invalidHold()
    }
    await client.query('COMMIT')
    return { ok: true }
  } catch {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Preserve the original non-sensitive persistence failure.
    }
    return { ok: false, reason: 'persistence_failed' }
  } finally {
    try {
      client.release()
    } catch {
      console.error('[triage/long-packet-safety] failure-floor release failed')
    }
  }
}

export async function persistValidatedLongPacketAggregateFailure(input: {
  extractionId: string
  tenantId: string
  plan: LongPacketPlan
  sourceSha256: string
  safetyPromptVersions: unknown
  modelMapResult: unknown
  modelReduceResult: unknown
  terminalErrorMessage: string
}): Promise<PersistValidatedLongPacketCompletionResult> {
  if (
    !isRecord(input.modelReduceResult) ||
    input.modelReduceResult.status !== 'partial' ||
    input.modelReduceResult.coverageStatus !== 'partial' ||
    typeof input.terminalErrorMessage !== 'string' ||
    !input.terminalErrorMessage.trim() ||
    input.terminalErrorMessage.length > 2_000
  ) {
    return { ok: false, reason: 'persistence_failed' }
  }
  try {
    const safety = validatePersistedLongPacketAggregateSafety(
      input.plan,
      input.modelMapResult,
      input.modelReduceResult,
    )
    if (
      safety.carePathway !== 'emergency_now' &&
      safety.carePathway !== 'same_day_clinician_review'
    ) {
      return { ok: false, reason: 'persistence_failed' }
    }
  } catch {
    return { ok: false, reason: 'persistence_failed' }
  }

  let client: PoolClient
  try {
    client = await (await getPool()).connect()
  } catch {
    return { ok: false, reason: 'persistence_failed' }
  }
  try {
    await client.query('BEGIN')
    const locked = await client.query(
      `SELECT id, status, source_sha256, packet_plan,
              safety_prompt_versions, model_map_result, model_reduce_result
         FROM triage_extractions
        WHERE id = $1
          AND tenant_id = $2
          AND ingestion_mode = 'long_packet'
        FOR UPDATE`,
      [input.extractionId, input.tenantId],
    )
    const row = locked.rows[0] as Record<string, unknown> | undefined
    if (
      locked.rowCount !== 1 ||
      !row ||
      (row.status !== 'pending' && row.status !== 'error') ||
      row.source_sha256 !== input.sourceSha256 ||
      hashLongPacketPlan(parsePersistedJson(row.packet_plan)) !==
        hashLongPacketPlan(input.plan)
    ) {
      invalidHold()
    }
    const persistedPromptVersions = parsePersistedJson(
      row.safety_prompt_versions,
    )
    const requestedPromptVersions = parsePersistedJson(
      input.safetyPromptVersions,
    )
    validateTrustedBindings(persistedPromptVersions)
    validateTrustedBindings(requestedPromptVersions)
    if (
      canonicalLongPacketJSONStringify(persistedPromptVersions) !==
      canonicalLongPacketJSONStringify(requestedPromptVersions)
    ) {
      invalidHold()
    }

    const existing = parsePersistedJson(row.model_reduce_result)
    let preserveExistingAudit = false
    if (existing !== null && existing !== undefined) {
      if (isRecord(existing) && existing.kind === 'partial_safety_hold') {
        validateLongPacketPartialSafetyHold({
          plan: input.plan,
          sourceSha256: input.sourceSha256,
          safetyPromptVersions: persistedPromptVersions,
          value: existing,
        })
        // A prior exact per-chunk audit is already actionable. Keep it when
        // the narrative-only aggregate cannot safely replace its audit mode.
        preserveExistingAudit = true
      } else if (
        canonicalLongPacketJSONStringify(existing) !==
          canonicalLongPacketJSONStringify(input.modelReduceResult) ||
        canonicalLongPacketJSONStringify(
          parsePersistedJson(row.model_map_result),
        ) !== canonicalLongPacketJSONStringify(input.modelMapResult)
      ) {
        invalidHold()
      }
    }

    const updated = await client.query(
      preserveExistingAudit
        ? `UPDATE triage_extractions
              SET note_type_detected = NULL,
                  extraction_confidence = NULL,
                  extracted_summary = NULL,
                  key_findings = NULL,
                  safety_screened_at = NOW(),
                  status = 'error',
                  error_message = $3,
                  completed_at = NOW()
            WHERE id = $1
              AND tenant_id = $2
              AND status IN ('pending', 'error')
          RETURNING id`
        : `UPDATE triage_extractions
              SET note_type_detected = NULL,
                  extraction_confidence = NULL,
                  extracted_summary = NULL,
                  key_findings = NULL,
                  model_map_result = $3::jsonb,
                  model_reduce_result = $4::jsonb,
                  safety_screened_at = NOW(),
                  status = 'error',
                  error_message = $5,
                  completed_at = NOW()
            WHERE id = $1
              AND tenant_id = $2
              AND status IN ('pending', 'error')
          RETURNING id`,
      preserveExistingAudit
        ? [
            input.extractionId,
            input.tenantId,
            input.terminalErrorMessage,
          ]
        : [
            input.extractionId,
            input.tenantId,
            canonicalLongPacketJSONStringify(input.modelMapResult),
            canonicalLongPacketJSONStringify(input.modelReduceResult),
            input.terminalErrorMessage,
          ],
    )
    if (updated.rowCount !== 1 || updated.rows[0]?.id !== input.extractionId) {
      invalidHold()
    }
    await client.query('COMMIT')
    return { ok: true }
  } catch {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Preserve the original non-sensitive persistence failure.
    }
    return { ok: false, reason: 'persistence_failed' }
  } finally {
    try {
      client.release()
    } catch {
      console.error('[triage/long-packet-safety] aggregate release failed')
    }
  }
}

export async function persistValidatedLongPacketCompletion(input: {
  extractionId: string
  tenantId: string
  plan: LongPacketPlan
  sourceSha256: string
  safetyPromptVersions: unknown
  modelMapResult: unknown
  modelReduceResult: unknown
  noteTypeDetected: string
  extractionConfidence: TriageConfidence
  extractedSummary: string
  keyFindings: ExtractionKeyFindings
  terminalErrorMessage?: string
}): Promise<PersistValidatedLongPacketCompletionResult> {
  let client: PoolClient
  try {
    client = await (await getPool()).connect()
  } catch {
    return { ok: false, reason: 'persistence_failed' }
  }
  try {
    await client.query('BEGIN')
    const locked = await client.query(
      `SELECT id, status, source_sha256, packet_plan,
              safety_prompt_versions, model_map_result, model_reduce_result
         FROM triage_extractions
        WHERE id = $1
          AND tenant_id = $2
          AND ingestion_mode = 'long_packet'
        FOR UPDATE`,
      [input.extractionId, input.tenantId],
    )
    const row = locked.rows[0] as Record<string, unknown> | undefined
    if (
      locked.rowCount !== 1 ||
      !row ||
      row.status !== 'pending' ||
      row.source_sha256 !== input.sourceSha256 ||
      hashLongPacketPlan(parsePersistedJson(row.packet_plan)) !==
        hashLongPacketPlan(input.plan)
    ) {
      invalidHold()
    }
    const persistedPromptVersions = parsePersistedJson(
      row.safety_prompt_versions,
    )
    const requestedPromptVersions = parsePersistedJson(
      input.safetyPromptVersions,
    )
    const rowBindings = validateTrustedBindings(persistedPromptVersions)
    validateTrustedBindings(requestedPromptVersions)
    if (
      canonicalLongPacketJSONStringify(persistedPromptVersions) !==
      canonicalLongPacketJSONStringify(requestedPromptVersions)
    ) {
      invalidHold()
    }
    const existing = parsePersistedJson(row.model_reduce_result)
    if (existing !== null && existing !== undefined) {
      if (isRecord(existing) && existing.kind === 'partial_safety_hold') {
        validateLongPacketSafetyAuditReplacement({
          plan: input.plan,
          sourceSha256: input.sourceSha256,
          safetyPromptVersions: rowBindings,
          existing,
          modelMapResult: input.modelMapResult,
          modelReduceResult: input.modelReduceResult,
        })
      } else {
        if (
          canonicalLongPacketJSONStringify(existing) !==
            canonicalLongPacketJSONStringify(input.modelReduceResult) ||
          canonicalLongPacketJSONStringify(
            parsePersistedJson(row.model_map_result),
          ) !== canonicalLongPacketJSONStringify(input.modelMapResult)
        ) {
          invalidHold()
        }
        validatePersistedLongPacketModelPipeline(
          input.plan,
          input.modelMapResult,
          input.modelReduceResult,
        )
      }
    } else {
      validatePersistedLongPacketModelPipeline(
        input.plan,
        input.modelMapResult,
        input.modelReduceResult,
      )
    }
    if (!input.terminalErrorMessage) {
      assertLongPacketPersistedClinicalExtractionMatches({
        pipeline: validatePersistedLongPacketModelPipeline(
          input.plan,
          input.modelMapResult,
          input.modelReduceResult,
        ),
        deterministicGateway: scanLongPacketEmergency(input.plan),
        actual: input,
      })
    }
    const updated = await client.query(
      input.terminalErrorMessage
        ? `UPDATE triage_extractions
              SET model_map_result = $3::jsonb,
                  model_reduce_result = $4::jsonb,
                  safety_screened_at = NOW(),
                  status = 'error',
                  error_message = $5,
                  completed_at = NOW()
            WHERE id = $1
              AND tenant_id = $2
              AND status = 'pending'
          RETURNING id`
        : `UPDATE triage_extractions
          SET note_type_detected = $3,
              extraction_confidence = $4,
              extracted_summary = $5,
              key_findings = $6::jsonb,
              model_map_result = $7::jsonb,
              model_reduce_result = $8::jsonb,
              safety_screened_at = NOW(),
              status = 'complete',
              error_message = NULL,
              completed_at = NOW()
        WHERE id = $1
          AND tenant_id = $2
          AND status = 'pending'
      RETURNING id`,
      input.terminalErrorMessage
        ? [
            input.extractionId,
            input.tenantId,
            canonicalLongPacketJSONStringify(input.modelMapResult),
            canonicalLongPacketJSONStringify(input.modelReduceResult),
            input.terminalErrorMessage,
          ]
        : [
            input.extractionId,
            input.tenantId,
            input.noteTypeDetected,
            input.extractionConfidence,
            input.extractedSummary,
            canonicalLongPacketJSONStringify(input.keyFindings),
            canonicalLongPacketJSONStringify(input.modelMapResult),
            canonicalLongPacketJSONStringify(input.modelReduceResult),
          ],
    )
    if (updated.rowCount !== 1 || updated.rows[0]?.id !== input.extractionId) {
      invalidHold()
    }
    await client.query('COMMIT')
    return { ok: true }
  } catch {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Preserve the original non-sensitive persistence failure.
    }
    return { ok: false, reason: 'persistence_failed' }
  } finally {
    try {
      client.release()
    } catch {
      console.error('[triage/long-packet-safety] completion release failed')
    }
  }
}

export type PersistLongPacketPartialSafetyHoldResult =
  | { ok: true; artifact: LongPacketPartialSafetyHold }
  | { ok: false; reason: 'persistence_failed' }

export async function persistLongPacketPartialSafetyHold(input: {
  extractionId: string
  tenantId: string
  plan: LongPacketPlan
  sourceSha256: string
  mode?: LongPacketSafetyAuditMode
  durableAuthority?: LongPacketDurableLeaseAuthority
  projection: LongPacketPartialSafetyProjection
}): Promise<PersistLongPacketPartialSafetyHoldResult> {
  let client: PoolClient
  try {
    client = await (await getPool()).connect()
  } catch {
    return { ok: false, reason: 'persistence_failed' }
  }
  try {
    await client.query('BEGIN')
    if (input.durableAuthority) {
      const expectedBranch =
        input.projection.outcome.branch === 'clinical_mapper'
          ? 'mapper'
          : 'safety'
      if (
        input.durableAuthority.sourceSha256 !== input.sourceSha256 ||
        input.durableAuthority.planSha256 !== hashLongPacketPlan(input.plan) ||
        input.durableAuthority.plannerVersion !== input.plan.version ||
        input.durableAuthority.pipelineVersion !==
          input.projection.pipelineVersion ||
        input.durableAuthority.branch !== expectedBranch ||
        input.durableAuthority.chunkId !== input.projection.outcome.chunkId ||
        input.durableAuthority.chunkProvenanceSha256 !==
          input.projection.outcome.chunkProvenanceSha256 ||
        input.durableAuthority.modelId !== input.projection.modelProfile ||
        input.durableAuthority.promptVersion !== input.projection.promptVersion
      ) {
        invalidHold()
      }
      await assertLongPacketDurableLeaseAuthority({
        client,
        extractionId: input.extractionId,
        tenantId: input.tenantId,
        authority: input.durableAuthority,
      })
    }
    const locked = await client.query(
      `SELECT id,
              status,
              source_sha256,
              packet_plan,
              safety_prompt_versions,
              model_reduce_result
         FROM triage_extractions
        WHERE id = $1
          AND tenant_id = $2
          AND ingestion_mode = 'long_packet'
        FOR UPDATE`,
      [input.extractionId, input.tenantId],
    )
    const row = locked.rows[0] as Record<string, unknown> | undefined
    if (
      locked.rowCount !== 1 ||
      !row ||
      (row.status !== 'pending' && row.status !== 'error') ||
      row.source_sha256 !== input.sourceSha256 ||
      hashLongPacketPlan(parsePersistedJson(row.packet_plan)) !==
        hashLongPacketPlan(input.plan)
    ) {
      invalidHold()
    }
    const rowBindings = validateTrustedBindings(
      parsePersistedJson(row.safety_prompt_versions),
    )
    const existing = parsePersistedJson(row.model_reduce_result)
    const artifact = mergeLongPacketPartialSafetyHold({
      plan: input.plan,
      sourceSha256: input.sourceSha256,
      safetyPromptVersions: rowBindings,
      existing,
      mode: input.mode,
      projection: input.projection,
    })
    const terminal = artifact.mode === 'workflow_persistence_failed'
    const updated = await client.query(
      terminal
        ? `UPDATE triage_extractions
              SET model_reduce_result = $3::jsonb,
                  status = 'error',
                  error_message = $4,
                  completed_at = NOW()
            WHERE id = $1
              AND tenant_id = $2
              AND status IN ('pending', 'error')
          RETURNING id`
        : `UPDATE triage_extractions
              SET model_reduce_result = $3::jsonb
            WHERE id = $1
              AND tenant_id = $2
              AND status IN ('pending', 'error')
          RETURNING id`,
      terminal
        ? [
            input.extractionId,
            input.tenantId,
            canonicalLongPacketJSONStringify(artifact),
            LONG_PACKET_PARTIAL_SAFETY_HOLD_ERROR_MESSAGE,
          ]
        : [
            input.extractionId,
            input.tenantId,
            canonicalLongPacketJSONStringify(artifact),
          ],
    )
    if (updated.rowCount !== 1 || updated.rows[0]?.id !== input.extractionId) {
      invalidHold()
    }
    await client.query('COMMIT')
    return { ok: true, artifact }
  } catch {
    try {
      await client.query('ROLLBACK')
    } catch {
      // The caller still receives the same non-sensitive persistence failure.
    }
    return { ok: false, reason: 'persistence_failed' }
  } finally {
    try {
      client.release()
    } catch {
      console.error('[triage/long-packet-safety] checkpoint release failed')
    }
  }
}
