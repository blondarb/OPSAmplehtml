import { getPool } from '@/lib/db'
import type { PoolClient } from 'pg'
import {
  applyPersistedTimeCriticalFloor,
  mergeFlatSafetySnapshot,
  moreConservativeDataQuality,
} from './gatewayPersistence'
import type {
  SafetyModelCarePathway,
  ValidatedModelSafetyExtraction,
} from './modelSafetyExtraction'
import type { CarePathway, DataQuality, SourceType } from './types'
import {
  assertLongPacketDurableFinalizerLeaseAuthority,
  assertLongPacketDurableLeaseAuthority,
  type LongPacketDurableFinalizerLeaseAuthority,
  type LongPacketDurableLeaseAuthority,
} from './longPacketDurableLeaseAuthority'
import {
  canonicalLongPacketJSONStringify,
  hashLongPacketPlan,
} from './longPacketCanonicalHash'
import type { LongPacketPlan } from './longPacketPlanner'
import {
  deriveLongPacketMapperSafetyFloor,
  mergeLongPacketPartialSafetyHold,
  validateLongPacketPartialSafetyHold,
  validateLongPacketSafetyAuditReplacement,
  type LongPacketPartialSafetyProjection,
} from './longPacketPartialSafetyHold'
import { mergeLongPacketModelSafety } from './longPacketModelSafetyMerge'
import {
  validatePersistedLongPacketAggregateSafety,
  validatePersistedLongPacketModelPipeline,
  type LongPacketModelPipelineResult,
} from './longPacketModelPipeline'

export { mergeLongPacketModelSafety } from './longPacketModelSafetyMerge'

export type LongPacketSafetyEscalationResult =
  | {
      ok: true
      triageSessionId: string | null
      emergencyActionId: string | null
      actionRequired: boolean
    }
  | { ok: false; reason: 'persistence_failed' }

interface ExistingWorkflow {
  id: string
  workflow_status: string
  care_pathway: string
  data_quality: DataQuality
  safety_shadow_result: unknown
}

const SAFETY_PATHWAY_RANK: Record<SafetyModelCarePathway, number> = {
  no_time_critical_signal: 0,
  undetermined: 1,
  same_day_clinician_review: 2,
  emergency_now: 3,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sourceType(filename: string | null): SourceType {
  const extension = filename?.split('.').at(-1)?.toLowerCase()
  if (extension === 'pdf' || extension === 'docx' || extension === 'txt') {
    return extension
  }
  return 'paste'
}

function priorModelSafety(
  snapshot: unknown,
): ValidatedModelSafetyExtraction | null {
  const flattened = mergeFlatSafetySnapshot(snapshot, {})
  const value = flattened.modelSafety
  if (value == null) return null
  if (
    !isRecord(value) ||
    !Object.hasOwn(SAFETY_PATHWAY_RANK, String(value.carePathway)) ||
    !['sufficient', 'partial', 'insufficient', 'conflicting'].includes(
      String(value.dataQuality),
    ) ||
    !Array.isArray(value.criticalUnknowns) ||
    !Array.isArray(value.signals)
  ) {
    throw new Error('Persisted model safety evidence is invalid.')
  }
  return value as unknown as ValidatedModelSafetyExtraction
}

function workflowPathway(
  carePathway: SafetyModelCarePathway,
): Extract<
  CarePathway,
  'emergency_now' | 'same_day_clinician_review' | 'undetermined'
> {
  if (carePathway === 'emergency_now') return 'emergency_now'
  if (carePathway === 'same_day_clinician_review') {
    return 'same_day_clinician_review'
  }
  return 'undetermined'
}

function persistedSafetyPathwayRank(
  carePathway: string | undefined,
  workflowStatus?: string,
): number {
  if (workflowStatus === 'emergency_hold') return 3
  if (carePathway === 'emergency_now') return 3
  if (carePathway === 'same_day_clinician_review') return 2
  if (carePathway === 'undetermined') return 1
  return 0
}

type LongPacketProjectionSafetyCheckpoint = {
  kind: 'chunk_projection'
  plan: LongPacketPlan
  sourceSha256: string
  projection: LongPacketPartialSafetyProjection
}

type LongPacketValidatedPipelineSafetyCheckpoint = {
  kind: 'validated_pipeline'
  plan: LongPacketPlan
  sourceSha256: string
  safetyPromptVersions: unknown
  modelMapResult: unknown
  modelReduceResult: LongPacketModelPipelineResult
}

export type LongPacketSafetyCheckpoint =
  | LongPacketProjectionSafetyCheckpoint
  | LongPacketValidatedPipelineSafetyCheckpoint

export function deriveLongPacketPipelineSafetyResult(
  pipeline: LongPacketModelPipelineResult,
): ValidatedModelSafetyExtraction {
  return {
    carePathway:
      pipeline.carePathway === 'routine_outpatient'
        ? 'no_time_critical_signal'
        : pipeline.carePathway === 'emergency_now' ||
            pipeline.carePathway === 'same_day_clinician_review' ||
            pipeline.carePathway === 'undetermined'
          ? pipeline.carePathway
          : 'undetermined',
    dataQuality:
      pipeline.conflicts.length > 0
        ? 'conflicting'
        : pipeline.criticalUnknowns.length > 0
          ? 'partial'
          : pipeline.status === 'completed' &&
              pipeline.coverageStatus === 'complete' &&
              pipeline.safetyCoverage.status === 'complete'
            ? 'sufficient'
            : 'partial',
    criticalUnknowns: pipeline.criticalUnknowns.map((unknown) => unknown.text),
    signals: pipeline.safetySignals,
  }
}

export async function persistLongPacketSafetyEscalation(input: {
  extractionId: string
  tenantId: string
  jobId: string
  chunkId: string
  safetyResult: ValidatedModelSafetyExtraction
  modelProfile: string
  promptVersion: string
  pipelineVersion: string
  durableAuthority?:
    | LongPacketDurableLeaseAuthority
    | LongPacketDurableFinalizerLeaseAuthority
  checkpoint?: LongPacketSafetyCheckpoint
}): Promise<LongPacketSafetyEscalationResult> {
  if (input.safetyResult.carePathway === 'no_time_critical_signal') {
    return {
      ok: true,
      triageSessionId: null,
      emergencyActionId: null,
      actionRequired: false,
    }
  }
  const actionable =
    input.safetyResult.carePathway === 'emergency_now' ||
    input.safetyResult.carePathway === 'same_day_clinician_review'
  if (
    actionable &&
    (!input.checkpoint ||
      (input.checkpoint.kind !== 'chunk_projection' &&
        input.checkpoint.kind !== 'validated_pipeline'))
  ) {
    console.error(
      '[triage/long-packet-safety] actionable escalation checkpoint missing',
    )
    return { ok: false, reason: 'persistence_failed' }
  }

  let client: PoolClient
  try {
    const pool = await getPool()
    client = await pool.connect()
  } catch {
    console.error(
      '[triage/long-packet-safety] escalation database unavailable',
    )
    return { ok: false, reason: 'persistence_failed' }
  }
  try {
    await client.query('BEGIN')
    if (input.durableAuthority) {
      if (input.durableAuthority.kind === 'finalizer') {
        await assertLongPacketDurableFinalizerLeaseAuthority({
          client,
          extractionId: input.extractionId,
          tenantId: input.tenantId,
          authority: input.durableAuthority,
        })
      } else {
        await assertLongPacketDurableLeaseAuthority({
          client,
          extractionId: input.extractionId,
          tenantId: input.tenantId,
          authority: input.durableAuthority,
        })
      }
    }
    const extractionResult = await client.query(
      `SELECT id, status, text_input, source_filename, patient_age, patient_sex,
              packet_emergency_result, source_sha256, packet_plan,
              safety_prompt_versions, model_map_result, model_reduce_result
         FROM triage_extractions
        WHERE id = $1
          AND tenant_id = $2
          AND ingestion_mode = 'long_packet'
          AND status IN ('pending', 'error')
        FOR UPDATE`,
      [input.extractionId, input.tenantId],
    )
    const extraction = extractionResult.rows[0] as
      | {
          id: string
          status: 'pending' | 'error'
          text_input: string
          source_filename: string | null
          patient_age: number | null
          patient_sex: string | null
          packet_emergency_result: unknown
          source_sha256: string | null
          packet_plan: unknown
          safety_prompt_versions: unknown
          model_map_result: unknown
          model_reduce_result: unknown
        }
      | undefined
    if (!extraction) throw new Error('Tenant-bound pending extraction not found.')
    const persistedPlan =
      typeof extraction.packet_plan === 'string'
        ? JSON.parse(extraction.packet_plan) as LongPacketPlan
        : extraction.packet_plan as LongPacketPlan
    if (
      input.durableAuthority &&
      input.durableAuthority.kind !== 'finalizer'
    ) {
      const persistedChunk = persistedPlan.chunks.find(
        (chunk) => chunk.id === input.chunkId,
      )
      if (
        input.durableAuthority.jobId !== input.jobId ||
        extraction.source_sha256 !== input.durableAuthority.sourceSha256 ||
        hashLongPacketPlan(persistedPlan) !==
          input.durableAuthority.planSha256 ||
        persistedPlan.version !== input.durableAuthority.plannerVersion ||
        input.durableAuthority.chunkId !== input.chunkId ||
        !persistedChunk ||
        persistedChunk.provenanceSha256 !==
          input.durableAuthority.chunkProvenanceSha256 ||
        input.durableAuthority.modelId !== input.modelProfile ||
        input.durableAuthority.promptVersion !== input.promptVersion ||
        input.durableAuthority.pipelineVersion !== input.pipelineVersion
      ) {
        throw new Error('Durable safety escalation binding is inconsistent.')
      }
    }

    if (input.checkpoint?.kind === 'chunk_projection') {
      const checkpointChunk = input.checkpoint.plan.chunks.find(
        (chunk) => chunk.id === input.chunkId,
      )
      const projectionBranch = input.checkpoint.projection.outcome.branch
      const expectedDurableBranch =
        projectionBranch === 'clinical_mapper' ? 'mapper' : 'safety'
      if (
        !actionable ||
        extraction.source_sha256 !== input.checkpoint.sourceSha256 ||
        hashLongPacketPlan(persistedPlan) !==
          hashLongPacketPlan(input.checkpoint.plan) ||
        persistedPlan.version !== input.checkpoint.plan.version ||
        !checkpointChunk ||
        input.checkpoint.projection.outcome.chunkId !== input.chunkId ||
        input.checkpoint.projection.outcome.chunkProvenanceSha256 !==
          checkpointChunk.provenanceSha256 ||
        input.checkpoint.projection.modelProfile !== input.modelProfile ||
        input.checkpoint.projection.promptVersion !== input.promptVersion ||
        input.checkpoint.projection.pipelineVersion !== input.pipelineVersion ||
        (input.durableAuthority &&
          input.durableAuthority.kind !== 'finalizer' &&
          input.durableAuthority.branch !== expectedDurableBranch)
      ) {
        throw new Error('Atomic safety checkpoint binding is inconsistent.')
      }
      const projectedSafety =
        input.checkpoint.projection.outcome.branch === 'safety_extractor'
          ? input.checkpoint.projection.outcome.result
          : deriveLongPacketMapperSafetyFloor(
              input.checkpoint.projection.outcome,
            )
      if (
        !projectedSafety ||
        canonicalLongPacketJSONStringify(projectedSafety) !==
          canonicalLongPacketJSONStringify(input.safetyResult)
      ) {
        throw new Error('Atomic safety checkpoint result is inconsistent.')
      }
      if (
        isRecord(extraction.model_reduce_result) &&
        extraction.model_reduce_result.kind === 'partial_safety_hold'
      ) {
        const existingAudit = validateLongPacketPartialSafetyHold({
          plan: input.checkpoint.plan,
          sourceSha256: input.checkpoint.sourceSha256,
          safetyPromptVersions: extraction.safety_prompt_versions,
          value: extraction.model_reduce_result,
        })
        if (
          existingAudit.artifact.mode === 'workflow_persistence_failed'
        ) {
          throw new Error('Terminal safety checkpoint cannot be retried.')
        }
      }
      const incomingArtifact = mergeLongPacketPartialSafetyHold({
        plan: input.checkpoint.plan,
        sourceSha256: input.checkpoint.sourceSha256,
        safetyPromptVersions: extraction.safety_prompt_versions,
        existing: null,
        mode: 'safety_checkpoint',
        projection: input.checkpoint.projection,
      })
      if (incomingArtifact.carePathway !== input.safetyResult.carePathway) {
        throw new Error('Atomic safety checkpoint pathway is inconsistent.')
      }
      const checkpointArtifact = mergeLongPacketPartialSafetyHold({
        plan: input.checkpoint.plan,
        sourceSha256: input.checkpoint.sourceSha256,
        safetyPromptVersions: extraction.safety_prompt_versions,
        existing: extraction.model_reduce_result,
        mode: 'safety_checkpoint',
        projection: input.checkpoint.projection,
      })
      const checkpointUpdate = await client.query(
        `UPDATE triage_extractions
            SET model_reduce_result = $3::jsonb
          WHERE id = $1
            AND tenant_id = $2
            AND status IN ('pending', 'error')
        RETURNING id`,
        [
          input.extractionId,
          input.tenantId,
          canonicalLongPacketJSONStringify(checkpointArtifact),
        ],
      )
      if (
        checkpointUpdate.rowCount !== 1 ||
        checkpointUpdate.rows[0]?.id !== input.extractionId
      ) {
        throw new Error('Atomic safety checkpoint update failed.')
      }
    } else if (input.checkpoint?.kind === 'validated_pipeline') {
      if (
        !actionable ||
        extraction.source_sha256 !== input.checkpoint.sourceSha256 ||
        hashLongPacketPlan(persistedPlan) !==
          hashLongPacketPlan(input.checkpoint.plan) ||
        persistedPlan.version !== input.checkpoint.plan.version ||
        canonicalLongPacketJSONStringify(extraction.safety_prompt_versions) !==
          canonicalLongPacketJSONStringify(
            input.checkpoint.safetyPromptVersions,
          ) ||
        (input.durableAuthority?.kind === 'finalizer' &&
          (input.durableAuthority.jobId !== input.jobId ||
            input.durableAuthority.sourceSha256 !==
              input.checkpoint.sourceSha256 ||
            input.durableAuthority.planSha256 !==
              hashLongPacketPlan(input.checkpoint.plan) ||
            input.durableAuthority.modelId !== input.modelProfile ||
            input.durableAuthority.promptVersion !== input.promptVersion ||
            input.durableAuthority.pipelineVersion !== input.pipelineVersion))
      ) {
        throw new Error('Atomic full-pipeline checkpoint binding is inconsistent.')
      }
      let completePipeline = true
      let validatedSafety: ValidatedModelSafetyExtraction
      try {
        const pipeline = validatePersistedLongPacketModelPipeline(
          input.checkpoint.plan,
          input.checkpoint.modelMapResult,
          input.checkpoint.modelReduceResult,
        )
        validatedSafety = deriveLongPacketPipelineSafetyResult(pipeline)
      } catch {
        completePipeline = false
        validatedSafety = validatePersistedLongPacketAggregateSafety(
          input.checkpoint.plan,
          input.checkpoint.modelMapResult,
          input.checkpoint.modelReduceResult,
        )
      }
      if (
        canonicalLongPacketJSONStringify(validatedSafety) !==
        canonicalLongPacketJSONStringify(input.safetyResult)
      ) {
        throw new Error('Atomic full-pipeline checkpoint result is inconsistent.')
      }
      const existing = extraction.model_reduce_result
      if (existing !== null && existing !== undefined) {
        if (isRecord(existing) && existing.kind === 'partial_safety_hold') {
          const audit = validateLongPacketPartialSafetyHold({
            plan: input.checkpoint.plan,
            sourceSha256: input.checkpoint.sourceSha256,
            safetyPromptVersions: extraction.safety_prompt_versions,
            value: existing,
          })
          if (audit.artifact.mode === 'workflow_persistence_failed') {
            throw new Error('Terminal safety checkpoint cannot be replaced.')
          }
          if (!completePipeline) {
            throw new Error(
              'A partial aggregate cannot replace an existing safety audit.',
            )
          }
          validateLongPacketSafetyAuditReplacement({
            plan: input.checkpoint.plan,
            sourceSha256: input.checkpoint.sourceSha256,
            safetyPromptVersions: extraction.safety_prompt_versions,
            existing,
            modelMapResult: input.checkpoint.modelMapResult,
            modelReduceResult: input.checkpoint.modelReduceResult,
          })
        } else if (
          canonicalLongPacketJSONStringify(existing) !==
            canonicalLongPacketJSONStringify(
              input.checkpoint.modelReduceResult,
            ) ||
          canonicalLongPacketJSONStringify(extraction.model_map_result) !==
            canonicalLongPacketJSONStringify(input.checkpoint.modelMapResult)
        ) {
          throw new Error('Staged full-pipeline checkpoint is inconsistent.')
        }
      }
      const checkpointUpdate = await client.query(
        `UPDATE triage_extractions
            SET model_map_result = $3::jsonb,
                model_reduce_result = $4::jsonb
          WHERE id = $1
            AND tenant_id = $2
            AND status IN ('pending', 'error')
        RETURNING id`,
        [
          input.extractionId,
          input.tenantId,
          canonicalLongPacketJSONStringify(input.checkpoint.modelMapResult),
          canonicalLongPacketJSONStringify(input.checkpoint.modelReduceResult),
        ],
      )
      if (
        checkpointUpdate.rowCount !== 1 ||
        checkpointUpdate.rows[0]?.id !== input.extractionId
      ) {
        throw new Error('Atomic full-pipeline checkpoint update failed.')
      }
    }

    const workflowResult = await client.query(
      `SELECT id, workflow_status, care_pathway, data_quality,
              safety_shadow_result
         FROM triage_sessions
        WHERE source_extraction_id = $1
          AND tenant_id = $2
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE`,
      [input.extractionId, input.tenantId],
    )
    let workflow = workflowResult.rows[0] as ExistingWorkflow | undefined
    if (workflow?.workflow_status === 'closed') {
      throw new Error('Closed ingress safety workflow cannot be escalated.')
    }

    let emergencyActionId: string | null = null
    if (workflow) {
      const actionResult = await client.query(
        `SELECT action.id
           FROM triage_emergency_actions action
           JOIN triage_sessions session ON session.id = action.triage_session_id
          WHERE action.triage_session_id = $1
            AND session.tenant_id = $2
            AND action.status <> 'closed'
          ORDER BY action.created_at
          LIMIT 1
          FOR UPDATE OF action`,
        [workflow.id, input.tenantId],
      )
      emergencyActionId = actionResult.rows[0]?.id ?? null
    }

    const incomingPathway = workflowPathway(input.safetyResult.carePathway)
    const targetPathway = workflow
      ? applyPersistedTimeCriticalFloor({
          existingCarePathway: workflow.care_pathway,
          existingWorkflowStatus: workflow.workflow_status,
          incomingCarePathway: incomingPathway,
          hasOpenEmergencyAction: Boolean(emergencyActionId),
        })
      : incomingPathway
    const shouldCreateNotification =
      (targetPathway === 'emergency_now' ||
        targetPathway === 'same_day_clinician_review') &&
      (!workflow ||
        persistedSafetyPathwayRank(
          targetPathway,
        ) >
          persistedSafetyPathwayRank(
            workflow.care_pathway,
            workflow.workflow_status,
          ))
    const targetEmergency = targetPathway === 'emergency_now'
    const targetWorkflowStatus = targetEmergency
      ? 'emergency_hold'
      : 'clinician_review'
    const targetReviewRequirement = targetEmergency
      ? 'emergency_action'
      : 'immediate_clinician_review'
    const targetDataQuality = moreConservativeDataQuality(
      workflow?.data_quality ?? 'partial',
      input.safetyResult.dataQuality,
    )
    const mergedSafety = mergeLongPacketModelSafety(
      workflow ? priorModelSafety(workflow.safety_shadow_result) : null,
      input.safetyResult,
    )
    const safetySnapshot = mergeFlatSafetySnapshot(
      workflow?.safety_shadow_result,
      {
        modelSafety: mergedSafety,
        persistedCarePathwayFloor: targetPathway,
      },
    )
    const promptVersions = JSON.stringify({
      longPacketSafetyExtractor: input.promptVersion,
      longPacketPipeline: input.pipelineVersion,
    })

    if (workflow) {
      const updated = await client.query(
        `UPDATE triage_sessions
            SET care_pathway = $3,
                data_quality = $4,
                review_requirement = $5,
                workflow_status = $6,
                scheduling_locked = true,
                due_at = COALESCE(due_at, now()),
                next_escalation_at = COALESCE(
                  next_escalation_at,
                  now() + interval '5 minutes'
                ),
                prompt_versions = COALESCE(prompt_versions, '{}'::jsonb) || $7::jsonb,
                safety_shadow_result = $8::jsonb
          WHERE id = $1
            AND tenant_id = $2
        RETURNING id`,
        [
          workflow.id,
          input.tenantId,
          targetPathway,
          targetDataQuality,
          targetReviewRequirement,
          targetWorkflowStatus,
          promptVersions,
          JSON.stringify(safetySnapshot),
        ],
      )
      if (updated.rowCount !== 1) throw new Error('Safety escalation update failed.')
    } else {
      const packetEmergency = isRecord(extraction.packet_emergency_result)
        ? extraction.packet_emergency_result
        : {}
      const inserted = await client.query(
        `INSERT INTO triage_sessions (
           tenant_id, source_extraction_id, referral_text, patient_age,
           patient_sex, source_type, source_filename, ai_model_used,
           processing_status, care_pathway, data_quality, coverage_status,
           review_requirement, workflow_status, scheduling_locked, due_at,
           next_escalation_at, rule_version, prompt_versions,
           safety_shadow_result
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, 'partial',
           $11, $12, true, now(), now() + interval '5 minutes', $13,
           $14::jsonb, $15::jsonb
         )
         RETURNING id`,
        [
          input.tenantId,
          input.extractionId,
          extraction.text_input,
          extraction.patient_age,
          extraction.patient_sex,
          sourceType(extraction.source_filename),
          extraction.source_filename,
          input.modelProfile,
          targetPathway,
          targetDataQuality,
          targetReviewRequirement,
          targetWorkflowStatus,
          typeof packetEmergency.version === 'string'
            ? packetEmergency.version
            : null,
          promptVersions,
          JSON.stringify(safetySnapshot),
        ],
      )
      const triageSessionId = inserted.rows[0]?.id as string | undefined
      if (!triageSessionId) throw new Error('Safety escalation insert failed.')
      workflow = {
        id: triageSessionId,
        workflow_status: 'pending_safety_screen',
        care_pathway: 'undetermined',
        data_quality: 'partial',
        safety_shadow_result: null,
      }
    }

    if (targetEmergency && !emergencyActionId) {
      const action = await client.query(
        `INSERT INTO triage_emergency_actions (
           triage_session_id, status, owner_team, due_at,
           next_escalation_at, delivery_status, understanding_status,
           idempotency_key
         ) VALUES ($1, 'open', 'neurology_triage', now(),
                   now() + interval '5 minutes', 'unknown', 'unknown', $2)
         ON CONFLICT (idempotency_key) DO UPDATE
           SET updated_at = now()
           WHERE triage_emergency_actions.status <> 'closed'
         RETURNING id`,
        [
          workflow.id,
          `long-packet-model-safety:${input.promptVersion}:${input.extractionId}`,
        ],
      )
      emergencyActionId = action.rows[0]?.id ?? null
      if (!emergencyActionId) throw new Error('Emergency action insert failed.')
    }

    if (shouldCreateNotification) {
      const tier = targetEmergency ? 'emergent' : 'urgent'
      const tierDisplay = targetEmergency
        ? 'EMERGENT — immediate action required'
        : 'SAME-DAY CLINICIAN REVIEW'
      const metadata = JSON.stringify({
        tier,
        tierDisplay,
        longPacketSafetyPathway: targetPathway,
      })
      await client.query(
        `INSERT INTO notifications (
           tenant_id, recipient_user_id, source_type, source_id, patient_id,
           priority, title, body, metadata
         )
         SELECT $1, NULL, 'triage_result', $2, NULL, $4, $5, $6, $7::jsonb
          WHERE NOT EXISTS (
            SELECT 1
              FROM notifications
             WHERE tenant_id = $1
               AND source_type = 'triage_result'
               AND source_id = $2
               AND metadata->>'longPacketSafetyPathway' = $3
          )`,
        [
          input.tenantId,
          workflow.id,
          targetPathway,
          targetEmergency ? 'critical' : 'high',
          `${tierDisplay} triage result`,
          'Validated long-packet model safety requires immediate workflow action.',
          metadata,
        ],
      )
    }

    const correlationId = `long-packet-model-safety:${input.promptVersion}:${input.jobId}`
    await client.query(
      `INSERT INTO triage_workflow_events (
         triage_session_id, emergency_action_id, event_type, actor_kind,
         previous_state, new_state, reason, model_profile, prompt_version,
         correlation_id
       )
       SELECT $1, $2, 'long_packet_model_safety_escalated', 'model',
              $3, $4,
              'Validated page-bound long-packet safety evidence escalated the workflow without lowering any prior floor',
              $5, $6, $7
        WHERE NOT EXISTS (
          SELECT 1 FROM triage_workflow_events
           WHERE triage_session_id = $1
             AND correlation_id = $7
        )`,
      [
        workflow.id,
        emergencyActionId,
        workflow.workflow_status,
        targetWorkflowStatus,
        input.modelProfile,
        input.promptVersion,
        correlationId,
      ],
    )

    await client.query('COMMIT')
    return {
      ok: true,
      triageSessionId: workflow.id,
      emergencyActionId,
      actionRequired: true,
    }
  } catch {
    try {
      await client.query('ROLLBACK')
    } catch {
      console.error(
        '[triage/long-packet-safety] escalation rollback failed',
      )
    }
    console.error('[triage/long-packet-safety] escalation persistence failed')
    return { ok: false, reason: 'persistence_failed' }
  } finally {
    try {
      client.release()
    } catch {
      console.error('[triage/long-packet-safety] escalation release failed')
    }
  }
}
