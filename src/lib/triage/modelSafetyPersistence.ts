import { getPool } from '@/lib/db'
import type { EnsembleFusionDecision } from './ensemblePolicy'
import type { ValidatedModelSafetyExtraction } from './modelSafetyExtraction'
import type { ValidatedTriageAdjudicatorDecision } from './modelAdjudicator'
import {
  applyPersistedTimeCriticalFloor,
  mergeFlatSafetySnapshot,
  moreConservativeDataQuality,
} from './gatewayPersistence'
import type { DataQuality } from './types'

export interface PersistModelSafetyFusionInput {
  triageSessionId: string
  tenantId: string
  modelProfile: string
  promptVersion: string
  safetyResult: ValidatedModelSafetyExtraction | null
  safetyFailure?: string | null
  scoringStatus: 'complete' | 'failed' | 'invalid' | 'timeout'
  scoringFailure?: string | null
  scoringModelProfile: string
  scoringPromptVersion: string
  fusion: EnsembleFusionDecision
  adjudicatorResult?: ValidatedTriageAdjudicatorDecision | null
  adjudicatorFailure?: string | null
  adjudicatorModelProfile?: string | null
  adjudicatorPromptVersion?: string | null
  processingAttemptCount: number
}

export type PersistModelSafetyFusionResult =
  | {
      ok: true
      carePathway: EnsembleFusionDecision['carePathway']
      dataQuality: DataQuality
      reviewRequirement: EnsembleFusionDecision['reviewRequirement']
      workflowStatus: 'emergency_hold' | 'clinician_review'
    }
  | { ok: false }

export async function persistModelSafetyFusion(
  input: PersistModelSafetyFusionInput,
): Promise<PersistModelSafetyFusionResult> {
  const pool = await getPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const workflowResult = await client.query(
      `SELECT workflow_status, care_pathway, data_quality, safety_shadow_result
         FROM triage_sessions
       WHERE id = $1
          AND tenant_id = $2
          AND processing_status = 'pending'
          AND processing_attempt_count = $3
        FOR UPDATE`,
      [input.triageSessionId, input.tenantId, input.processingAttemptCount],
    )
    const workflow = workflowResult.rows[0] as
      | {
          workflow_status: string
          care_pathway: string
          data_quality: DataQuality
          safety_shadow_result: unknown
        }
      | undefined
    if (!workflow || workflow.workflow_status === 'closed') {
      throw new Error('Tenant-bound open triage workflow not found')
    }

    const existingAction = await client.query(
      `SELECT id
         FROM triage_emergency_actions
        WHERE triage_session_id = $1
          AND status <> 'closed'
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE`,
      [input.triageSessionId],
    )
    let emergencyActionId = existingAction.rows[0]?.id as string | undefined
    const targetCarePathway = applyPersistedTimeCriticalFloor({
      existingCarePathway: workflow.care_pathway,
      existingWorkflowStatus: workflow.workflow_status,
      incomingCarePathway: input.fusion.carePathway,
      hasOpenEmergencyAction: Boolean(emergencyActionId),
    })
    const targetEmergency = targetCarePathway === 'emergency_now'
    const targetTimeCritical =
      targetEmergency || targetCarePathway === 'same_day_clinician_review'
    const targetReviewRequirement = targetEmergency
      ? 'emergency_action'
      : targetCarePathway === 'same_day_clinician_review'
        ? 'immediate_clinician_review'
        : input.fusion.reviewRequirement
    const targetWorkflowStatus = targetEmergency
      ? 'emergency_hold'
      : 'clinician_review'
    const existingDataQuality = workflow.data_quality ?? 'partial'
    const targetDataQuality =
      existingDataQuality === 'insufficient' ||
      existingDataQuality === 'conflicting'
        ? moreConservativeDataQuality(
            existingDataQuality,
            input.fusion.dataQuality,
          )
        : input.fusion.dataQuality
    const shadowResult = mergeFlatSafetySnapshot(workflow.safety_shadow_result, {
      modelSafety: input.safetyResult,
      modelSafetyFailure: input.safetyFailure ?? null,
      outpatientScoring: {
        status: input.scoringStatus,
        failure: input.scoringFailure ?? null,
        modelProfile: input.scoringModelProfile,
        promptVersion: input.scoringPromptVersion,
      },
      fusion: input.fusion,
      persistedCarePathwayFloor: targetCarePathway,
      adjudicator: input.adjudicatorResult ?? null,
      adjudicatorFailure: input.adjudicatorFailure ?? null,
    })

    const updateSql = targetTimeCritical
      ? `UPDATE triage_sessions
            SET care_pathway = $3,
                data_quality = $4,
                review_requirement = $5,
                workflow_status = '${targetWorkflowStatus}',
                scheduling_locked = true,
                due_at = COALESCE(due_at, now()),
                next_escalation_at = COALESCE(next_escalation_at, now() + interval '5 minutes'),
                safety_shadow_result = $6::jsonb,
                prompt_versions = COALESCE(prompt_versions, '{}'::jsonb) || $7::jsonb
          WHERE id = $1
            AND tenant_id = $2
            AND processing_status = 'pending'
            AND processing_attempt_count = $8`
      : `UPDATE triage_sessions
            SET care_pathway = $3,
                data_quality = $4,
                review_requirement = $5,
                workflow_status = 'clinician_review',
                scheduling_locked = true,
                safety_shadow_result = $6::jsonb,
                prompt_versions = COALESCE(prompt_versions, '{}'::jsonb) || $7::jsonb
          WHERE id = $1
            AND tenant_id = $2
            AND processing_status = 'pending'
            AND processing_attempt_count = $8`
    const updateResult = await client.query(updateSql, [
      input.triageSessionId,
      input.tenantId,
      targetCarePathway,
      targetDataQuality,
      targetReviewRequirement,
      JSON.stringify(shadowResult),
      JSON.stringify({
        safetyExtractor: input.promptVersion,
        outpatientScorer: input.scoringPromptVersion,
        ...(input.adjudicatorPromptVersion
          ? { adjudicator: input.adjudicatorPromptVersion }
          : {}),
      }),
      input.processingAttemptCount,
    ])
    if (updateResult.rowCount !== 1) {
      throw new Error('Model safety state was not persisted')
    }

    if (targetEmergency && !emergencyActionId) {
      const actionResult = await client.query(
        `INSERT INTO triage_emergency_actions (
           triage_session_id,
           status,
           owner_team,
           due_at,
           next_escalation_at,
           delivery_status,
           understanding_status,
           idempotency_key
         ) VALUES ($1, 'open', 'neurology_triage', now(),
                   now() + interval '5 minutes', 'unknown', 'unknown', $2)
         ON CONFLICT (idempotency_key) DO UPDATE
           SET updated_at = now()
           WHERE triage_emergency_actions.status <> 'closed'
         RETURNING id`,
        [
          input.triageSessionId,
          `model-safety:${input.promptVersion}:${input.triageSessionId}`,
        ],
      )
      emergencyActionId = actionResult.rows[0]?.id
      if (!emergencyActionId) {
        throw new Error('Model emergency action was not persisted')
      }
    }

    await client.query(
      `INSERT INTO triage_workflow_events (
         triage_session_id,
         emergency_action_id,
         event_type,
         actor_kind,
         previous_state,
         new_state,
         reason,
         model_profile,
         prompt_version,
         correlation_id
       ) VALUES ($1, $2, $3, 'model', $4, $5, $6, $7, $8, $9)`,
      [
        input.triageSessionId,
        emergencyActionId ?? null,
        input.scoringStatus === 'complete'
          ? 'model_outpatient_scoring_completed'
          : 'model_outpatient_scoring_failed',
        workflow.workflow_status,
        targetWorkflowStatus,
        input.scoringStatus === 'complete'
          ? 'Outpatient scoring completed under the independent safety floor'
          : `Outpatient scoring ${input.scoringStatus}; independent safety and immediate review remain authoritative`,
        input.scoringModelProfile,
        input.scoringPromptVersion,
        `outpatient-scoring:${input.scoringPromptVersion}:${input.triageSessionId}`,
      ],
    )

    await client.query(
      `INSERT INTO triage_workflow_events (
         triage_session_id,
         emergency_action_id,
         event_type,
         actor_kind,
         previous_state,
         new_state,
         reason,
         model_profile,
         prompt_version,
         correlation_id
       ) VALUES ($1, $2, 'model_safety_fusion_completed', 'model', $3, $4,
                 'Independent safety-model evidence was validated and fused without lowering prior floors',
                 $5, $6, $7)`,
      [
        input.triageSessionId,
        emergencyActionId ?? null,
        workflow.workflow_status,
        targetWorkflowStatus,
        input.modelProfile,
        input.promptVersion,
        `model-safety:${input.promptVersion}:${input.triageSessionId}`,
      ],
    )

    if (input.adjudicatorResult || input.adjudicatorFailure) {
      await client.query(
        `INSERT INTO triage_workflow_events (
           triage_session_id,
           emergency_action_id,
           event_type,
           actor_kind,
           previous_state,
           new_state,
           reason,
           model_profile,
           prompt_version,
           correlation_id
         ) VALUES ($1, $2, $3, 'model', $4, $5, $6, $7, $8, $9)`,
        [
          input.triageSessionId,
          emergencyActionId ?? null,
          input.adjudicatorResult
            ? 'model_safety_adjudication_completed'
            : 'model_safety_adjudication_failed',
          workflow.workflow_status,
          targetWorkflowStatus,
          input.adjudicatorResult
            ? 'Sparse disagreement adjudication completed without lowering prior safety floors'
            : 'Sparse disagreement adjudication failed; conservative fusion and human review remain required',
          input.adjudicatorModelProfile ?? null,
          input.adjudicatorPromptVersion ?? null,
          `adjudicator:${input.adjudicatorPromptVersion ?? 'unknown'}:${input.triageSessionId}`,
        ],
      )
    }

    await client.query('COMMIT')
    return {
      ok: true,
      carePathway: targetCarePathway,
      dataQuality: targetDataQuality,
      reviewRequirement: targetReviewRequirement,
      workflowStatus: targetWorkflowStatus,
    }
  } catch {
    await client.query('ROLLBACK')
    console.error('[triage/model-safety] failed to persist safety fusion')
    return { ok: false }
  } finally {
    client.release()
  }
}
