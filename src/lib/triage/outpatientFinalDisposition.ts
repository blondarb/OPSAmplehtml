import { createHash } from 'node:crypto'
import type { PoolClient } from 'pg'

import type { ClinicalRole } from '@/lib/auth/clinicalAccess'
import { getPool } from '@/lib/db'

export type FinalOutpatientCarePathway =
  | 'expedited_outpatient'
  | 'routine_outpatient'

export type FinalOutpatientTriageTier =
  | 'urgent'
  | 'semi_urgent'
  | 'routine_priority'
  | 'routine'
  | 'non_urgent'

type FinalDispositionActorRole = Extract<ClinicalRole, 'clinician' | 'admin'>

export interface FinalizeOutpatientDispositionInput {
  triageSessionId: string
  tenantId: string
  actorUserId: string
  actorRole: FinalDispositionActorRole
  idempotencyKey: string
  finalCarePathway: FinalOutpatientCarePathway
  finalTriageTier: FinalOutpatientTriageTier
  reviewNote: string
}

export interface FinalizedOutpatientDisposition {
  triageSessionId: string
  carePathway: FinalOutpatientCarePathway
  triageTier: FinalOutpatientTriageTier
  reviewedBy: string
}

export type OutpatientFinalDispositionFailureReason =
  | 'invalid_command'
  | 'invalid_idempotency_key'
  | 'invalid_final_disposition'
  | 'triage_not_found'
  | 'processing_incomplete'
  | 'coverage_incomplete'
  | 'data_quality_not_sufficient'
  | 'care_pathway_not_outpatient'
  | 'current_pathway_tier_mismatch'
  | 'review_state_not_finalizable'
  | 'critical_clarification_open'
  | 'emergency_action_open'
  | 'final_pathway_mismatch'
  | 'final_tier_mismatch'
  | 'already_finalized'
  | 'idempotency_conflict'
  | 'authorization_changed'
  | 'persistence_failed'

export type OutpatientFinalDispositionResult =
  | {
      ok: true
      replayed: boolean
      disposition: FinalizedOutpatientDisposition
    }
  | { ok: false; reason: OutpatientFinalDispositionFailureReason }

interface FinalDispositionRow {
  id: string
  processing_status: string
  completed_at: Date | string | null
  care_pathway: string
  triage_tier: string | null
  physician_override_tier: string | null
  data_quality: string
  coverage_status: string
  review_requirement: string
  workflow_status: string
  scheduling_locked: boolean
  reviewed_by: string | null
  reviewed_at: Date | string | null
  final_care_pathway: string | null
  final_triage_tier: string | null
  open_critical_clarifications: number | string
  open_emergency_actions: number | string
  actor_role: FinalDispositionActorRole
}

const EVENT_TYPE = 'clinician_outpatient_disposition_finalized'
const PATHWAY_TIERS: Record<
  FinalOutpatientCarePathway,
  ReadonlySet<FinalOutpatientTriageTier>
> = {
  expedited_outpatient: new Set(['urgent', 'semi_urgent']),
  routine_outpatient: new Set([
    'routine_priority',
    'routine',
    'non_urgent',
  ]),
}
const TIER_RANK: Readonly<Record<string, number>> = {
  emergent: 0,
  urgent: 1,
  semi_urgent: 2,
  routine_priority: 3,
  routine: 4,
  non_urgent: 5,
}

function boundedText(value: string, maximum: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed.length <= maximum ? trimmed : null
}

function validateInput(
  input: FinalizeOutpatientDispositionInput,
): OutpatientFinalDispositionFailureReason | null {
  if (
    !boundedText(input.triageSessionId, 200) ||
    !boundedText(input.tenantId, 200) ||
    !boundedText(input.actorUserId, 500) ||
    !['clinician', 'admin'].includes(input.actorRole) ||
    !boundedText(input.reviewNote, 2_000)
  ) {
    return 'invalid_command'
  }
  if (
    typeof input.idempotencyKey !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(input.idempotencyKey)
  ) {
    return 'invalid_idempotency_key'
  }
  const allowedTiers = PATHWAY_TIERS[input.finalCarePathway]
  if (!allowedTiers || !allowedTiers.has(input.finalTriageTier)) {
    return 'invalid_final_disposition'
  }
  return null
}

function reasonFor(input: FinalizeOutpatientDispositionInput): string {
  return JSON.stringify({
    operation: 'finalize_outpatient',
    final_care_pathway: input.finalCarePathway,
    final_triage_tier: input.finalTriageTier,
    review_note: input.reviewNote.trim(),
  })
}

function correlationId(
  triageSessionId: string,
  idempotencyKey: string,
): string {
  const digest = createHash('sha256')
    .update(idempotencyKey, 'utf8')
    .digest('hex')
  return `triage-final-disposition:${triageSessionId}:${digest}`
}

function disposition(
  input: FinalizeOutpatientDispositionInput,
): FinalizedOutpatientDisposition {
  return {
    triageSessionId: input.triageSessionId,
    carePathway: input.finalCarePathway,
    triageTier: input.finalTriageTier,
    reviewedBy: input.actorUserId,
  }
}

function completedAtIsPresent(value: Date | string | null): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime())
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !Number.isNaN(Date.parse(value))
  )
}

function relatedCountIsZero(value: number | string): boolean {
  const count = Number(value)
  return Number.isSafeInteger(count) && count === 0
}

function effectiveTier(row: FinalDispositionRow): string | null {
  const base = row.triage_tier
  const override = row.physician_override_tier
  if (!base) return override
  if (!override) return base
  const baseRank = TIER_RANK[base]
  const overrideRank = TIER_RANK[override]
  if (baseRank === undefined || overrideRank === undefined) {
    return baseRank === undefined ? base : override
  }
  return baseRank <= overrideRank ? base : override
}

function validateLockedState(
  row: FinalDispositionRow,
  input: FinalizeOutpatientDispositionInput,
): OutpatientFinalDispositionFailureReason | null {
  if (
    row.processing_status !== 'complete' ||
    !completedAtIsPresent(row.completed_at)
  ) {
    return 'processing_incomplete'
  }
  if (row.coverage_status !== 'complete') return 'coverage_incomplete'
  if (row.data_quality !== 'sufficient') {
    return 'data_quality_not_sufficient'
  }
  if (!(row.care_pathway in PATHWAY_TIERS)) {
    return 'care_pathway_not_outpatient'
  }
  const currentPathway = row.care_pathway as FinalOutpatientCarePathway
  const currentTier = effectiveTier(row)
  if (
    !currentTier ||
    !PATHWAY_TIERS[currentPathway].has(
      currentTier as FinalOutpatientTriageTier,
    )
  ) {
    return 'current_pathway_tier_mismatch'
  }
  if (!relatedCountIsZero(row.open_critical_clarifications)) {
    return 'critical_clarification_open'
  }
  if (!relatedCountIsZero(row.open_emergency_actions)) {
    return 'emergency_action_open'
  }
  if (
    row.workflow_status === 'decision_ready' ||
    row.reviewed_by !== null ||
    row.reviewed_at !== null ||
    row.final_care_pathway !== null ||
    row.final_triage_tier !== null
  ) {
    return 'already_finalized'
  }
  if (
    row.workflow_status !== 'clinician_review' ||
    row.review_requirement !== 'clinician_confirmation' ||
    row.scheduling_locked !== true
  ) {
    return 'review_state_not_finalizable'
  }
  if (input.finalCarePathway !== currentPathway) {
    return 'final_pathway_mismatch'
  }
  if (input.finalTriageTier !== currentTier) {
    return 'final_tier_mismatch'
  }
  return null
}

export async function finalizeOutpatientDisposition(
  input: FinalizeOutpatientDispositionInput,
): Promise<OutpatientFinalDispositionResult> {
  const inputFailure = validateInput(input)
  if (inputFailure) return { ok: false, reason: inputFailure }

  let client: PoolClient | null = null
  let transactionOpen = false
  try {
    const pool = await getPool()
    client = await pool.connect()
    await client.query('BEGIN')
    transactionOpen = true

    const lockResult = await client.query(
      `SELECT session.id,
              session.processing_status,
              session.completed_at,
              session.care_pathway,
              session.triage_tier,
              session.physician_override_tier,
              session.data_quality,
              session.coverage_status,
              session.review_requirement,
              session.workflow_status,
              session.scheduling_locked,
              session.reviewed_by,
              session.reviewed_at,
              session.final_care_pathway,
              session.final_triage_tier,
              (
                SELECT COUNT(*)::integer
                  FROM triage_clarification_questions question
                 WHERE question.triage_session_id = session.id
                   AND question.criticality = 'critical'
                   AND question.status NOT IN ('verified', 'closed')
              ) AS open_critical_clarifications,
              (
                SELECT COUNT(*)::integer
                  FROM triage_emergency_actions action
                 WHERE action.triage_session_id = session.id
                   AND action.status <> 'closed'
              ) AS open_emergency_actions,
              membership.role AS actor_role
         FROM triage_sessions session
         JOIN clinical_access_memberships membership
           ON membership.user_id = $3
          AND membership.tenant_id = session.tenant_id
          AND membership.active = true
          AND membership.role IN ('clinician', 'admin')
          AND membership.role = $4
        WHERE session.id = $1
          AND session.tenant_id = $2
        FOR UPDATE OF session`,
      [
        input.triageSessionId,
        input.tenantId,
        input.actorUserId,
        input.actorRole,
      ],
    )
    const row = lockResult.rows[0] as FinalDispositionRow | undefined
    if (!row) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { ok: false, reason: 'triage_not_found' }
    }

    const commandReason = reasonFor(input)
    const commandCorrelationId = correlationId(
      input.triageSessionId,
      input.idempotencyKey,
    )
    const eventResult = await client.query(
      `SELECT event_type, reason
         FROM triage_workflow_events
        WHERE triage_session_id = $1
          AND correlation_id = $2
        LIMIT 1`,
      [input.triageSessionId, commandCorrelationId],
    )
    const priorEvent = eventResult.rows[0] as
      | { event_type: string; reason: string }
      | undefined
    if (priorEvent) {
      if (
        priorEvent.event_type !== EVENT_TYPE ||
        priorEvent.reason !== commandReason
      ) {
        await client.query('ROLLBACK')
        transactionOpen = false
        return { ok: false, reason: 'idempotency_conflict' }
      }
      await client.query('COMMIT')
      transactionOpen = false
      return {
        ok: true,
        replayed: true,
        disposition: disposition(input),
      }
    }

    const stateFailure = validateLockedState(row, input)
    if (stateFailure) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { ok: false, reason: stateFailure }
    }

    const updateResult = await client.query(
      `UPDATE triage_sessions target
          SET reviewed_by = $3,
              reviewed_at = now(),
              final_care_pathway = $4,
              final_triage_tier = $5,
              review_requirement = 'none',
              workflow_status = 'decision_ready',
              scheduling_locked = false
        WHERE target.id = $1
          AND target.tenant_id = $2
          AND target.processing_status = 'complete'
          AND target.completed_at IS NOT NULL
          AND target.coverage_status = 'complete'
          AND target.data_quality = 'sufficient'
          AND target.care_pathway = $4
          AND (
            CASE
              WHEN target.triage_tier IS NOT NULL
               AND target.triage_tier NOT IN (
                 'emergent', 'urgent', 'semi_urgent',
                 'routine_priority', 'routine', 'non_urgent'
               ) THEN NULL
              WHEN target.physician_override_tier IS NOT NULL
               AND target.physician_override_tier NOT IN (
                 'emergent', 'urgent', 'semi_urgent',
                 'routine_priority', 'routine', 'non_urgent'
               ) THEN NULL
              WHEN target.triage_tier = 'emergent'
                OR target.physician_override_tier = 'emergent' THEN 'emergent'
              WHEN target.triage_tier = 'urgent'
                OR target.physician_override_tier = 'urgent' THEN 'urgent'
              WHEN target.triage_tier = 'semi_urgent'
                OR target.physician_override_tier = 'semi_urgent' THEN 'semi_urgent'
              WHEN target.triage_tier = 'routine_priority'
                OR target.physician_override_tier = 'routine_priority' THEN 'routine_priority'
              WHEN target.triage_tier = 'routine'
                OR target.physician_override_tier = 'routine' THEN 'routine'
              WHEN target.triage_tier = 'non_urgent'
                OR target.physician_override_tier = 'non_urgent' THEN 'non_urgent'
              ELSE NULL
            END
          ) = $5
          AND target.review_requirement = 'clinician_confirmation'
          AND target.workflow_status = 'clinician_review'
          AND target.scheduling_locked = true
          AND target.reviewed_by IS NULL
          AND target.reviewed_at IS NULL
          AND target.final_care_pathway IS NULL
          AND target.final_triage_tier IS NULL
          AND EXISTS (
            SELECT 1
              FROM clinical_access_memberships reviewer
             WHERE reviewer.user_id = $3
               AND reviewer.tenant_id = target.tenant_id
               AND reviewer.active = true
               AND reviewer.role IN ('clinician', 'admin')
               AND reviewer.role = $6
          )
          AND NOT EXISTS (
            SELECT 1
              FROM triage_clarification_questions question
             WHERE question.triage_session_id = target.id
               AND question.criticality = 'critical'
               AND question.status NOT IN ('verified', 'closed')
          )
          AND NOT EXISTS (
            SELECT 1
              FROM triage_emergency_actions action
             WHERE action.triage_session_id = target.id
               AND action.status <> 'closed'
          )
      RETURNING target.id`,
      [
        input.triageSessionId,
        input.tenantId,
        input.actorUserId,
        input.finalCarePathway,
        input.finalTriageTier,
        input.actorRole,
      ],
    )
    if (updateResult.rowCount !== 1) {
      await client.query('ROLLBACK')
      transactionOpen = false
      return { ok: false, reason: 'authorization_changed' }
    }

    await client.query(
      `INSERT INTO triage_workflow_events (
         triage_session_id,
         event_type,
         actor_kind,
         actor_id,
         actor_role,
         previous_state,
         new_state,
         reason,
         correlation_id
       ) VALUES ($1, $2, 'clinician', $3, $4,
                 'clinician_review', 'decision_ready', $5, $6)`,
      [
        input.triageSessionId,
        EVENT_TYPE,
        input.actorUserId,
        input.actorRole,
        commandReason,
        commandCorrelationId,
      ],
    )
    await client.query('COMMIT')
    transactionOpen = false
    return {
      ok: true,
      replayed: false,
      disposition: disposition(input),
    }
  } catch {
    if (transactionOpen && client) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // Preserve the original fail-closed persistence result.
      }
    }
    console.error('[triage/final-disposition] persistence failed')
    return { ok: false, reason: 'persistence_failed' }
  } finally {
    if (client) {
      try {
        client.release()
      } catch {
        // The command result must not expose release details.
      }
    }
  }
}
