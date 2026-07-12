import { randomUUID } from 'node:crypto'

import { getPool } from '@/lib/db'
import type { ClinicalRole } from '@/lib/auth/clinicalAccess'
import type { CarePathway, TriageTier, WorkflowStatus } from './types'

const TIER_RANK: Partial<Record<TriageTier, number>> = {
  emergent: 0,
  urgent: 1,
  semi_urgent: 2,
  routine_priority: 3,
  routine: 4,
  non_urgent: 5,
}

const VALID_ESCALATION_TARGETS = new Set(Object.keys(TIER_RANK))

export interface ClinicianTierEscalationInput {
  triageSessionId: string
  tenantId: string
  actorUserId: string
  actorRole: Extract<ClinicalRole, 'clinician' | 'admin'>
  newTier: string
  reason: string
}

export type ClinicianTierEscalationResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'triage_session_not_found'
        | 'invalid_escalation_target'
        | 'invalid_current_triage_state'
        | 'downgrade_requires_closed_loop_review'
        | 'closed_workflow_requires_new_review'
        | 'escalation_persistence_failed'
    }

function moreUrgentTier(a: TriageTier, b: TriageTier): TriageTier {
  const aRank = TIER_RANK[a]
  const bRank = TIER_RANK[b]
  if (aRank == null) return b
  if (bRank == null) return a
  return aRank <= bRank ? a : b
}

function effectiveCurrentTier(row: {
  triage_tier: TriageTier | null
  physician_override_tier: TriageTier | null
  care_pathway: CarePathway
}): TriageTier | null {
  if (row.care_pathway === 'emergency_now') return 'emergent'
  if (row.care_pathway === 'same_day_clinician_review') return 'urgent'
  if (row.triage_tier === 'insufficient_data') return null
  if (!row.triage_tier || TIER_RANK[row.triage_tier] == null) return null
  if (
    row.physician_override_tier &&
    TIER_RANK[row.physician_override_tier] != null
  ) {
    return moreUrgentTier(row.triage_tier, row.physician_override_tier)
  }
  return row.triage_tier
}

function carePathwayForTier(tier: TriageTier): CarePathway {
  if (tier === 'emergent') return 'emergency_now'
  if (tier === 'urgent' || tier === 'semi_urgent') {
    return 'expedited_outpatient'
  }
  return 'routine_outpatient'
}

export async function recordClinicianTierEscalation(
  input: ClinicianTierEscalationInput,
): Promise<ClinicianTierEscalationResult> {
  const newTier = input.newTier as TriageTier
  if (!VALID_ESCALATION_TARGETS.has(newTier)) {
    return { ok: false, reason: 'invalid_escalation_target' }
  }
  if (!input.reason.trim()) {
    return { ok: false, reason: 'invalid_escalation_target' }
  }

  const pool = await getPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT triage_tier,
              physician_override_tier,
              care_pathway,
              workflow_status
         FROM triage_sessions
        WHERE id = $1
          AND tenant_id = $2
        FOR UPDATE`,
      [input.triageSessionId, input.tenantId],
    )
    const row = rows[0] as
      | {
          triage_tier: TriageTier | null
          physician_override_tier: TriageTier | null
          care_pathway: CarePathway
          workflow_status: WorkflowStatus
        }
      | undefined
    if (!row) {
      await client.query('ROLLBACK')
      return { ok: false, reason: 'triage_session_not_found' }
    }
    if (row.workflow_status === 'closed') {
      await client.query('ROLLBACK')
      return { ok: false, reason: 'closed_workflow_requires_new_review' }
    }

    const currentTier = effectiveCurrentTier(row)
    const currentRank = currentTier ? TIER_RANK[currentTier] : null
    const newRank = TIER_RANK[newTier]
    const canEscalateInsufficientData =
      row.triage_tier === 'insufficient_data' &&
      newRank != null &&
      newRank <= 2
    if ((currentRank == null || newRank == null) && !canEscalateInsufficientData) {
      await client.query('ROLLBACK')
      return { ok: false, reason: 'invalid_current_triage_state' }
    }
    if (currentRank != null && newRank != null && newRank >= currentRank) {
      await client.query('ROLLBACK')
      return {
        ok: false,
        reason: 'downgrade_requires_closed_loop_review',
      }
    }

    const emergency = newTier === 'emergent'
    const nextCarePathway = carePathwayForTier(newTier)
    const nextWorkflowStatus: WorkflowStatus = emergency
      ? 'emergency_hold'
      : 'clinician_review'
    const correlationId = `clinician-escalation:${randomUUID()}`

    const updateResult = await client.query(
      `UPDATE triage_sessions
          SET physician_override_tier = $3,
              physician_override_reason = $4,
              status = 'overridden',
              care_pathway = $5,
              review_requirement = $6,
              workflow_status = $7,
              scheduling_locked = true,
              reviewed_by = NULL,
              reviewed_at = NULL,
              final_care_pathway = NULL,
              final_triage_tier = NULL,
              due_at = CASE WHEN $8 THEN now() ELSE due_at END,
              next_escalation_at = CASE
                WHEN $8 THEN now() + interval '5 minutes'
                ELSE next_escalation_at
              END
        WHERE id = $1
          AND tenant_id = $2`,
      [
        input.triageSessionId,
        input.tenantId,
        newTier,
        input.reason.trim(),
        nextCarePathway,
        emergency ? 'emergency_action' : 'clinician_confirmation',
        nextWorkflowStatus,
        emergency,
      ],
    )
    if (updateResult.rowCount !== 1) {
      throw new Error('Triage escalation update did not affect one row')
    }

    let emergencyActionId: string | null = null
    if (emergency) {
      const actionResult = await client.query(
        `INSERT INTO triage_emergency_actions (
           triage_session_id,
           status,
           owner_user_id,
           owner_team,
           due_at,
           next_escalation_at,
           delivery_status,
           understanding_status,
           idempotency_key
         ) VALUES ($1, 'open', $2, 'neurology_triage', now(),
                   now() + interval '5 minutes', 'unknown', 'unknown', $3)
         ON CONFLICT (idempotency_key) DO UPDATE
           SET updated_at = now()
         RETURNING id`,
        [
          input.triageSessionId,
          input.actorUserId,
          `clinician-escalation:${input.triageSessionId}:${newTier}:${input.actorUserId}`,
        ],
      )
      emergencyActionId = actionResult.rows[0]?.id ?? null
      if (!emergencyActionId) {
        throw new Error('Emergency action was not persisted')
      }
    }

    await client.query(
      `INSERT INTO triage_workflow_events (
         triage_session_id,
         emergency_action_id,
         event_type,
         actor_kind,
         actor_id,
         actor_role,
         previous_state,
         new_state,
         reason,
         correlation_id
       ) VALUES ($1, $2, 'clinician_tier_escalated', 'clinician', $3, $4,
                 $5, $6, $7, $8)`,
      [
        input.triageSessionId,
        emergencyActionId,
        input.actorUserId,
        input.actorRole,
        row.workflow_status,
        nextWorkflowStatus,
        input.reason.trim(),
        correlationId,
      ],
    )

    await client.query('COMMIT')
    return { ok: true }
  } catch {
    await client.query('ROLLBACK')
    console.error('[triage/escalation] persistence failed')
    return { ok: false, reason: 'escalation_persistence_failed' }
  } finally {
    client.release()
  }
}
