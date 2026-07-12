import { getPool } from '@/lib/db'
import type { SourceType } from './types'
import {
  applyPersistedTimeCriticalFloor,
  mergeFlatSafetySnapshot,
  type PersistableEmergencyGatewayResult,
} from './gatewayPersistence'

export type IngressSafetyWorkflowResult =
  | { ok: true; triageSessionId: string }
  | { ok: false; reason: 'persistence_failed' }

export async function createIngressSafetyWorkflow(input: {
  extractionId: string
  tenantId: string
  sourceType: SourceType
  gateway: PersistableEmergencyGatewayResult
  modelProfile: string
  coverageStatus?: 'complete' | 'failed'
}): Promise<IngressSafetyWorkflowResult> {
  if (
    input.gateway.carePathway !== 'emergency_now' &&
    input.gateway.carePathway !== 'same_day_clinician_review' &&
    input.gateway.carePathway !== 'undetermined'
  ) {
    return { ok: false, reason: 'persistence_failed' }
  }

  const pool = await getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const extractionResult = await client.query(
      `SELECT id, text_input, source_filename, patient_age, patient_sex
         FROM triage_extractions
        WHERE id = $1
          AND tenant_id = $2
        FOR UPDATE`,
      [input.extractionId, input.tenantId],
    )
    const extraction = extractionResult.rows[0] as
      | {
          id: string
          text_input: string
          source_filename: string | null
          patient_age: number | null
          patient_sex: string | null
        }
      | undefined
    if (!extraction) throw new Error('Tenant-bound extraction not found')

    const existingResult = await client.query(
      `SELECT id, workflow_status, care_pathway, coverage_status, safety_shadow_result
         FROM triage_sessions
        WHERE source_extraction_id = $1
          AND tenant_id = $2
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE`,
      [input.extractionId, input.tenantId],
    )
    const existing = existingResult.rows[0] as
      | {
          id: string
          workflow_status: string
          care_pathway: string
          coverage_status?: string
          safety_shadow_result: unknown
        }
      | undefined
    if (existing) {
      if (existing.workflow_status === 'closed') {
        throw new Error('Closed ingress workflow cannot be replayed')
      }

      const actionResult = await client.query(
        `SELECT id
           FROM triage_emergency_actions
          WHERE triage_session_id = $1
            AND status <> 'closed'
          ORDER BY created_at
          LIMIT 1
          FOR UPDATE`,
        [existing.id],
      )
      let emergencyActionId = actionResult.rows[0]?.id as string | undefined
      let emergencyActionCreated = false
      const carePathway = applyPersistedTimeCriticalFloor({
        existingCarePathway: existing.care_pathway,
        existingWorkflowStatus: existing.workflow_status,
        incomingCarePathway: input.gateway.carePathway,
        hasOpenEmergencyAction: Boolean(emergencyActionId),
      })
      const emergency = carePathway === 'emergency_now'
      const workflowStatus = emergency ? 'emergency_hold' : 'clinician_review'
      const reviewRequirement = emergency
        ? 'emergency_action'
        : input.gateway.reviewRequirement
      const persistedCoverageStatus = existing.coverage_status ?? 'complete'
      const coverageStatus =
        input.coverageStatus === 'failed'
          ? 'failed'
          : persistedCoverageStatus
      const shouldUpdateState =
        carePathway !== existing.care_pathway ||
        workflowStatus !== existing.workflow_status ||
        coverageStatus !== persistedCoverageStatus

      if (shouldUpdateState) {
        const updateResult = await client.query(
          `UPDATE triage_sessions
              SET care_pathway = $3,
                  data_quality = CASE
                    WHEN data_quality IN ('insufficient', 'conflicting')
                      THEN data_quality
                    ELSE 'partial'
                  END,
                  review_requirement = $4,
                  workflow_status = $5,
                  coverage_status = $6,
                  scheduling_locked = true,
                  due_at = COALESCE(due_at, now()),
                  next_escalation_at = COALESCE(next_escalation_at, now() + interval '5 minutes'),
                  rule_version = $7,
                  safety_shadow_result = $8::jsonb
            WHERE id = $1
              AND tenant_id = $2`,
          [
            existing.id,
            input.tenantId,
            carePathway,
            reviewRequirement,
            workflowStatus,
            coverageStatus,
            input.gateway.version,
            JSON.stringify(mergeFlatSafetySnapshot(existing.safety_shadow_result, {
              deterministicGateway: input.gateway,
              persistedCarePathwayFloor: carePathway,
            })),
          ],
        )
        if (updateResult.rowCount !== 1) {
          throw new Error('Existing ingress workflow escalation failed')
        }
      }

      if (emergency && !emergencyActionId) {
        const insertedAction = await client.query(
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
            existing.id,
            `ingress:${input.gateway.version}:${input.extractionId}`,
          ],
        )
        emergencyActionId = insertedAction.rows[0]?.id
        if (!emergencyActionId) {
          throw new Error('Existing ingress emergency action escalation failed')
        }
        emergencyActionCreated = true
      }

      if (shouldUpdateState || emergencyActionCreated) {
        await client.query(
          `INSERT INTO triage_workflow_events (
             triage_session_id,
             emergency_action_id,
             event_type,
             actor_kind,
             previous_state,
             new_state,
             reason,
             rule_version,
             correlation_id
           ) VALUES ($1, $2, 'deterministic_ingress_safety_screen_completed',
                     'system', $3, $4,
                     'Deterministic ingress replay reconciled the persisted safety floor and emergency action without downgrade',
                     $5, $6)`,
          [
            existing.id,
            emergencyActionId ?? null,
            existing.workflow_status,
            workflowStatus,
            input.gateway.version,
            `ingress:${input.gateway.version}:${input.extractionId}`,
          ],
        )
      }

      await client.query('COMMIT')
      return { ok: true, triageSessionId: existing.id }
    }

    const emergency = input.gateway.carePathway === 'emergency_now'
    const workflowStatus = emergency ? 'emergency_hold' : 'clinician_review'
    const coverageStatus = input.coverageStatus ?? 'complete'
    const insertResult = await client.query(
      `INSERT INTO triage_sessions (
         tenant_id,
         source_extraction_id,
         referral_text,
         patient_age,
         patient_sex,
         source_type,
         source_filename,
         ai_model_used,
         processing_status,
         care_pathway,
         data_quality,
         coverage_status,
         review_requirement,
         workflow_status,
         scheduling_locked,
         due_at,
         next_escalation_at,
         rule_version,
         safety_shadow_result
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, 'partial',
         $10, $11, '${workflowStatus}', true, now(),
         now() + interval '5 minutes', $12, $13::jsonb
       )
       RETURNING id`,
      [
        input.tenantId,
        input.extractionId,
        extraction.text_input,
        extraction.patient_age,
        extraction.patient_sex,
        input.sourceType,
        extraction.source_filename,
        input.modelProfile,
        input.gateway.carePathway,
        coverageStatus,
        input.gateway.reviewRequirement,
        input.gateway.version,
        JSON.stringify(mergeFlatSafetySnapshot(null, {
          deterministicGateway: input.gateway,
          persistedCarePathwayFloor: input.gateway.carePathway,
        })),
      ],
    )
    const triageSessionId = insertResult.rows[0]?.id as string | undefined
    if (!triageSessionId) throw new Error('Ingress triage session insert failed')

    let emergencyActionId: string | null = null
    if (emergency) {
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
          triageSessionId,
          `ingress:${input.gateway.version}:${input.extractionId}`,
        ],
      )
      emergencyActionId = actionResult.rows[0]?.id ?? null
      if (!emergencyActionId) {
        throw new Error('Ingress emergency action insert failed')
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
         rule_version,
         correlation_id
       ) VALUES ($1, $2, 'deterministic_ingress_safety_screen_completed',
                 'system', 'pending_safety_screen', $3,
                 'Deterministic ingress safety screening created the workflow before model processing',
                 $4, $5)`,
      [
        triageSessionId,
        emergencyActionId,
        workflowStatus,
        input.gateway.version,
        `ingress:${input.gateway.version}:${input.extractionId}`,
      ],
    )

    await client.query('COMMIT')
    return { ok: true, triageSessionId }
  } catch {
    await client.query('ROLLBACK')
    console.error('[triage/ingress] failed to persist early safety workflow')
    return { ok: false, reason: 'persistence_failed' }
  } finally {
    client.release()
  }
}
