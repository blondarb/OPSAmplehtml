import { randomUUID as nodeRandomUUID } from 'node:crypto'

import type { Pool, PoolClient } from 'pg'

const ACTIVE_ACTION_STATUSES = "('open', 'attempting_contact', 'failed')"
const MIN_LEASE_MS = 10_000
const MAX_LEASE_MS = 15 * 60_000
const MIN_RETRY_DELAY_MS = 5_000
const MAX_RETRY_DELAY_MS = 15 * 60_000

export type EmergencyAlertSeverity = 'emergency'
export type EmergencyAlertLevel = 0 | 1 | 2 | 3
export type EmergencyAlertPublisherStatus =
  | 'pending'
  | 'leased'
  | 'failed'
  | 'sent'
  | 'terminal_failure'
  | 'suppressed'

export type EmergencyActionAlertOutboxErrorCode =
  | 'invalid_input'
  | 'persistence_failed'
  | 'stale_or_missing_lease'
  | 'binding_mismatch'

export class EmergencyActionAlertOutboxError extends Error {
  readonly name = 'EmergencyActionAlertOutboxError'

  constructor(
    public readonly code: EmergencyActionAlertOutboxErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export interface EmergencyAlertRef {
  alertId: string
  actionId: string
  severity: EmergencyAlertSeverity
  level: EmergencyAlertLevel
}

export interface ClaimedEmergencyAlert extends EmergencyAlertRef {
  tenantId: string
  triageSessionId: string
  ownerTeam: string
  leaseToken: string
  attemptCount: number
  claimKind: 'initial' | 'retry' | 'reclaim'
}

interface ServiceDependencies {
  now?: () => Date
  randomUUID?: () => string
}

function outboxError(
  code: EmergencyActionAlertOutboxErrorCode,
  message: string,
): EmergencyActionAlertOutboxError {
  return new EmergencyActionAlertOutboxError(code, message)
}

function rowCount(result: { rowCount: number | null }): number {
  return result.rowCount ?? 0
}

function bounded(value: unknown, field: string, maximum = 200): string {
  if (typeof value !== 'string') {
    throw outboxError('invalid_input', `${field} is invalid.`)
  }
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maximum) {
    throw outboxError('invalid_input', `${field} is invalid.`)
  }
  return trimmed
}

function limit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000) {
    throw outboxError('invalid_input', 'limit is invalid.')
  }
  return value
}

function level(value: unknown): EmergencyAlertLevel {
  const numeric = Number(value)
  if (!Number.isSafeInteger(numeric) || numeric < 0 || numeric > 3) {
    throw outboxError(
      'binding_mismatch',
      'Persisted emergency alert level is invalid.',
    )
  }
  return numeric as EmergencyAlertLevel
}

function emergencyRef(row: Record<string, unknown>): EmergencyAlertRef {
  if (
    typeof row.alert_id !== 'string' ||
    typeof row.action_id !== 'string' ||
    row.severity !== 'emergency'
  ) {
    throw outboxError(
      'binding_mismatch',
      'Persisted emergency alert reference is invalid.',
    )
  }
  return {
    alertId: row.alert_id,
    actionId: row.action_id,
    severity: 'emergency',
    level: level(row.escalation_level),
  }
}

function wrapPersistence(error: unknown): never {
  if (error instanceof EmergencyActionAlertOutboxError) throw error
  throw outboxError(
    'persistence_failed',
    'Emergency alert outbox persistence failed.',
  )
}

function sanitizePublisherFailure(error: unknown): {
  code: string
  detail: string
} {
  const name = error instanceof Error ? error.name.toLowerCase() : ''
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (name.includes('abort') || message.includes('timeout')) {
    return {
      code: 'publisher_timeout',
      detail: 'The emergency alert publisher timed out before confirmed delivery.',
    }
  }
  if (
    message.includes('credential') ||
    message.includes('unauthorized') ||
    message.includes('forbidden')
  ) {
    return {
      code: 'publisher_authentication_failed',
      detail: 'The emergency alert publisher could not authenticate.',
    }
  }
  if (
    message.includes('unavailable') ||
    message.includes('network') ||
    message.includes('connection')
  ) {
    return {
      code: 'publisher_unavailable',
      detail: 'The emergency alert publisher was unavailable.',
    }
  }
  return {
    code: 'publisher_failed',
    detail: 'The emergency alert publisher failed before confirmed delivery.',
  }
}

function cadenceMs(alertLevel: EmergencyAlertLevel): number {
  if (alertLevel === 1) return 5 * 60_000
  if (alertLevel === 2) return 10 * 60_000
  return 15 * 60_000
}

function claimKind(
  previousStatus: unknown,
): ClaimedEmergencyAlert['claimKind'] {
  if (previousStatus === 'failed') return 'retry'
  if (previousStatus === 'leased') return 'reclaim'
  return 'initial'
}

export function createPostgresEmergencyActionAlertOutbox(
  pool: Pool,
  dependencies: ServiceDependencies = {},
) {
  const now = dependencies.now ?? (() => new Date())
  const randomUUID = dependencies.randomUUID ?? nodeRandomUUID

  async function enqueueDueEmergencyActionReminders(
    requestedLimit: number,
  ): Promise<EmergencyAlertRef[]> {
    const boundedLimit = limit(requestedLimit)
    const observedAt = now()
    let client: PoolClient
    try {
      client = await pool.connect()
    } catch {
      throw outboxError(
        'persistence_failed',
        'Emergency alert outbox persistence failed.',
      )
    }

    try {
      await client.query('BEGIN')
      const dueActions = await client.query(
        `SELECT action.id AS action_id,
                COALESCE(latest.sequence_number, -1) + 1
                  AS next_sequence_number,
                LEAST(3, COALESCE(latest.escalation_level, 0) + 1)
                  AS escalation_level
           FROM triage_emergency_actions action
           LEFT JOIN LATERAL (
             SELECT alert.sequence_number, alert.escalation_level
               FROM triage_emergency_action_alerts alert
              WHERE alert.emergency_action_id = action.id
              ORDER BY alert.sequence_number DESC
              LIMIT 1
           ) latest ON true
          WHERE action.status IN ${ACTIVE_ACTION_STATUSES}
            AND action.next_escalation_at <= $1
            AND NOT EXISTS (
              SELECT 1
                FROM triage_emergency_action_alerts outstanding
               WHERE outstanding.emergency_action_id = action.id
                 AND outstanding.status IN ('pending', 'leased', 'failed')
            )
          ORDER BY action.next_escalation_at, action.id
          FOR UPDATE OF action SKIP LOCKED
          LIMIT $2`,
        [observedAt, boundedLimit],
      )

      const created: EmergencyAlertRef[] = []
      for (const raw of dueActions.rows as Array<Record<string, unknown>>) {
        if (
          typeof raw.action_id !== 'string' ||
          !Number.isSafeInteger(Number(raw.next_sequence_number)) ||
          Number(raw.next_sequence_number) < 1
        ) {
          throw outboxError(
            'binding_mismatch',
            'Due emergency action reminder binding is invalid.',
          )
        }
        const nextLevel = level(raw.escalation_level)
        const sequenceNumber = Number(raw.next_sequence_number)
        const inserted = await client.query(
          `INSERT INTO triage_emergency_action_alerts (
             emergency_action_id,
             sequence_number,
             alert_kind,
             severity,
             escalation_level,
             status,
             next_attempt_at
           )
           SELECT $1, $2, 'reminder', 'emergency', $3, 'pending', $4
            WHERE EXISTS (
              SELECT 1
                FROM triage_emergency_actions action
               WHERE action.id = $1
                 AND action.status IN ${ACTIVE_ACTION_STATUSES}
                 AND action.next_escalation_at <= $4
            )
              AND NOT EXISTS (
                SELECT 1
                  FROM triage_emergency_action_alerts outstanding
                 WHERE outstanding.emergency_action_id = $1
                   AND outstanding.status IN ('pending', 'leased', 'failed')
              )
           ON CONFLICT (emergency_action_id, sequence_number) DO NOTHING
        RETURNING id AS alert_id, emergency_action_id AS action_id,
                  severity, escalation_level`,
          [raw.action_id, sequenceNumber, nextLevel, observedAt],
        )
        if (rowCount(inserted) !== 1) {
          throw outboxError(
            'persistence_failed',
            'Emergency action reminder insertion failed.',
          )
        }

        const nextEscalationAt = new Date(
          observedAt.getTime() + cadenceMs(nextLevel),
        )
        const advanced = await client.query(
          `UPDATE triage_emergency_actions
              SET next_escalation_at = $3,
                  updated_at = $2
            WHERE id = $1
              AND status IN ${ACTIVE_ACTION_STATUSES}
              AND next_escalation_at <= $2
          RETURNING id`,
          [raw.action_id, observedAt, nextEscalationAt],
        )
        if (rowCount(advanced) !== 1) {
          throw outboxError(
            'persistence_failed',
            'Emergency action reminder cadence update failed.',
          )
        }
        created.push(
          emergencyRef(inserted.rows[0] as Record<string, unknown>),
        )
      }

      await client.query('COMMIT')
      return created
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // Preserve the original sanitized error.
      }
      wrapPersistence(error)
    } finally {
      client.release()
    }
  }

  async function listDispatchableEmergencyAlertRefs(
    requestedLimit: number,
  ): Promise<EmergencyAlertRef[]> {
    const boundedLimit = limit(requestedLimit)
    const observedAt = now()
    try {
      const dispatchable = await pool.query(
        `SELECT alert.id AS alert_id,
                alert.emergency_action_id AS action_id,
                alert.severity,
                alert.escalation_level
           FROM triage_emergency_action_alerts alert
           JOIN triage_emergency_actions action
             ON action.id = alert.emergency_action_id
          WHERE action.status IN ${ACTIVE_ACTION_STATUSES}
            AND alert.attempt_count < alert.max_attempts
            AND (
              (alert.status IN ('pending', 'failed')
                AND alert.next_attempt_at <= $1)
              OR (alert.status = 'leased' AND alert.lease_expires_at <= $1)
            )
          ORDER BY COALESCE(alert.next_attempt_at, alert.lease_expires_at),
                   alert.created_at,
                   alert.id
          LIMIT $2`,
        [observedAt, boundedLimit],
      )
      const seen = new Set<string>()
      return dispatchable.rows.map((raw) => {
        const ref = emergencyRef(raw as Record<string, unknown>)
        const key = `${ref.alertId}\u0000${ref.actionId}`
        if (seen.has(key)) {
          throw outboxError(
            'binding_mismatch',
            'Emergency alert dispatch references are duplicated.',
          )
        }
        seen.add(key)
        return ref
      })
    } catch (error) {
      wrapPersistence(error)
    }
  }

  async function claimEmergencyAlertByRef(input: {
    alertId: string
    actionId: string
    workerId: string
    leaseDurationMs: number
  }): Promise<ClaimedEmergencyAlert | null> {
    const alertId = bounded(input.alertId, 'alertId')
    const actionId = bounded(input.actionId, 'actionId')
    const workerId = bounded(input.workerId, 'workerId')
    if (
      !Number.isSafeInteger(input.leaseDurationMs) ||
      input.leaseDurationMs < MIN_LEASE_MS ||
      input.leaseDurationMs > MAX_LEASE_MS
    ) {
      throw outboxError('invalid_input', 'leaseDurationMs is invalid.')
    }
    const claimedAt = now()
    const leaseExpiresAt = new Date(
      claimedAt.getTime() + input.leaseDurationMs,
    )
    const leaseToken = randomUUID()
    try {
      const claimed = await pool.query(
        `WITH candidate AS (
           SELECT alert.id,
                  alert.emergency_action_id,
                  alert.status AS previous_status,
                  alert.lease_token AS previous_lease_token,
                  session.tenant_id,
                  action.triage_session_id,
                  action.owner_team
             FROM triage_emergency_action_alerts alert
             JOIN triage_emergency_actions action
               ON action.id = alert.emergency_action_id
             JOIN triage_sessions session
               ON session.id = action.triage_session_id
            WHERE alert.id = $1
              AND action.id = $2
              AND action.status IN ${ACTIVE_ACTION_STATUSES}
              AND alert.attempt_count < alert.max_attempts
              AND (
                (alert.status IN ('pending', 'failed')
                  AND alert.next_attempt_at <= $3)
                OR (alert.status = 'leased' AND alert.lease_expires_at <= $3)
              )
            FOR UPDATE OF alert SKIP LOCKED
         )
         UPDATE triage_emergency_action_alerts alert
            SET status = 'leased',
                attempt_count = alert.attempt_count + 1,
                next_attempt_at = NULL,
                lease_token = $4,
                lease_owner = $5,
                claimed_at = $3,
                lease_expires_at = $6,
                outcome_lease_token = NULL,
                sent_at = NULL,
                terminal_failed_at = NULL,
                suppressed_at = NULL,
                updated_at = $3
           FROM candidate
          WHERE alert.id = candidate.id
            AND alert.emergency_action_id = candidate.emergency_action_id
            AND alert.status = candidate.previous_status
            AND alert.lease_token IS NOT DISTINCT FROM candidate.previous_lease_token
            AND alert.attempt_count < alert.max_attempts
        RETURNING alert.id,
                  alert.emergency_action_id,
                  alert.severity,
                  alert.escalation_level,
                  alert.lease_token,
                  alert.attempt_count,
                  candidate.previous_status,
                  candidate.tenant_id,
                  candidate.triage_session_id,
                  candidate.owner_team`,
        [
          alertId,
          actionId,
          claimedAt,
          leaseToken,
          workerId,
          leaseExpiresAt,
        ],
      )
      if (rowCount(claimed) === 0) return null
      if (rowCount(claimed) !== 1) {
        throw outboxError(
          'persistence_failed',
          'Emergency alert claim was ambiguous.',
        )
      }
      const raw = claimed.rows[0] as Record<string, unknown>
      const ref = emergencyRef({
        alert_id: raw.id,
        action_id: raw.emergency_action_id,
        severity: raw.severity,
        escalation_level: raw.escalation_level,
      })
      if (
        raw.lease_token !== leaseToken ||
        typeof raw.tenant_id !== 'string' ||
        typeof raw.triage_session_id !== 'string' ||
        typeof raw.owner_team !== 'string' ||
        !Number.isSafeInteger(Number(raw.attempt_count)) ||
        Number(raw.attempt_count) < 1
      ) {
        throw outboxError(
          'binding_mismatch',
          'Claimed emergency alert binding is invalid.',
        )
      }
      return {
        ...ref,
        tenantId: raw.tenant_id,
        triageSessionId: raw.triage_session_id,
        ownerTeam: raw.owner_team,
        leaseToken,
        attemptCount: Number(raw.attempt_count),
        claimKind: claimKind(raw.previous_status),
      }
    } catch (error) {
      wrapPersistence(error)
    }
  }

  async function loadClaimedEmergencyAlertContext(input: {
    alertId: string
    actionId: string
    leaseToken: string
  }) {
    const alertId = bounded(input.alertId, 'alertId')
    const actionId = bounded(input.actionId, 'actionId')
    const leaseToken = bounded(input.leaseToken, 'leaseToken')
    const observedAt = now()
    try {
      const loaded = await pool.query(
        `SELECT alert.id AS alert_id,
                action.id AS action_id,
                session.tenant_id,
                action.triage_session_id,
                action.owner_team,
                action.owner_user_id,
                action.status AS action_status,
                alert.severity,
                alert.escalation_level
           FROM triage_emergency_action_alerts alert
           JOIN triage_emergency_actions action
             ON action.id = alert.emergency_action_id
           JOIN triage_sessions session
             ON session.id = action.triage_session_id
          WHERE alert.id = $1
            AND action.id = $2
            AND alert.status = 'leased'
            AND alert.lease_token = $3
            AND alert.lease_expires_at > $4
            AND action.status IN ${ACTIVE_ACTION_STATUSES}`,
        [alertId, actionId, leaseToken, observedAt],
      )
      if (rowCount(loaded) !== 1) {
        throw outboxError(
          'stale_or_missing_lease',
          'The emergency alert lease is stale or unavailable.',
        )
      }
      const raw = loaded.rows[0] as Record<string, unknown>
      const ref = emergencyRef(raw)
      if (
        typeof raw.tenant_id !== 'string' ||
        typeof raw.triage_session_id !== 'string' ||
        typeof raw.owner_team !== 'string' ||
        (raw.owner_user_id !== null &&
          raw.owner_user_id !== undefined &&
          typeof raw.owner_user_id !== 'string') ||
        (raw.action_status !== 'open' &&
          raw.action_status !== 'attempting_contact' &&
          raw.action_status !== 'failed')
      ) {
        throw outboxError(
          'binding_mismatch',
          'Claimed emergency alert routing is invalid.',
        )
      }
      return {
        ...ref,
        tenantId: raw.tenant_id,
        triageSessionId: raw.triage_session_id,
        ownerTeam: raw.owner_team,
        ownerUserId:
          typeof raw.owner_user_id === 'string' ? raw.owner_user_id : null,
        actionStatus: raw.action_status,
      }
    } catch (error) {
      wrapPersistence(error)
    }
  }

  async function markEmergencyAlertSent(input: {
    alertId: string
    actionId: string
    leaseToken: string
  }): Promise<void> {
    const alertId = bounded(input.alertId, 'alertId')
    const actionId = bounded(input.actionId, 'actionId')
    const leaseToken = bounded(input.leaseToken, 'leaseToken')
    const sentAt = now()
    try {
      const sent = await pool.query(
        `UPDATE triage_emergency_action_alerts alert
            SET status = 'sent',
                next_attempt_at = NULL,
                outcome_lease_token = $3,
                lease_token = NULL,
                lease_owner = NULL,
                claimed_at = NULL,
                lease_expires_at = NULL,
                sent_at = $4,
                updated_at = $4
           FROM triage_emergency_actions action
          WHERE alert.id = $1
            AND alert.emergency_action_id = $2
            AND action.id = alert.emergency_action_id
            AND action.status IN ${ACTIVE_ACTION_STATUSES}
            AND alert.status = 'leased'
            AND alert.lease_token = $3
            AND alert.lease_expires_at > $4
        RETURNING alert.id`,
        [alertId, actionId, leaseToken, sentAt],
      )
      if (rowCount(sent) !== 1) {
        throw outboxError(
          'stale_or_missing_lease',
          'The emergency alert lease is stale or unavailable.',
        )
      }
    } catch (error) {
      wrapPersistence(error)
    }
  }

  async function failEmergencyAlert(input: {
    alertId: string
    actionId: string
    leaseToken: string
    error: unknown
    nextRetryAt: Date
  }): Promise<{ status: 'failed' | 'terminal_failure' }> {
    const alertId = bounded(input.alertId, 'alertId')
    const actionId = bounded(input.actionId, 'actionId')
    const leaseToken = bounded(input.leaseToken, 'leaseToken')
    const failedAt = now()
    if (
      !(input.nextRetryAt instanceof Date) ||
      !Number.isFinite(input.nextRetryAt.getTime()) ||
      input.nextRetryAt.getTime() - failedAt.getTime() < MIN_RETRY_DELAY_MS ||
      input.nextRetryAt.getTime() - failedAt.getTime() > MAX_RETRY_DELAY_MS
    ) {
      throw outboxError('invalid_input', 'nextRetryAt is invalid.')
    }
    const sanitized = sanitizePublisherFailure(input.error)
    try {
      const failed = await pool.query(
        `UPDATE triage_emergency_action_alerts alert
            SET status = CASE
                  WHEN attempt_count >= max_attempts THEN 'terminal_failure'
                  ELSE 'failed'
                END,
                next_attempt_at = CASE
                  WHEN attempt_count < max_attempts THEN $8
                  ELSE NULL
                END,
                outcome_lease_token = $3,
                lease_token = NULL,
                lease_owner = NULL,
                claimed_at = NULL,
                lease_expires_at = NULL,
                terminal_failed_at = CASE
                  WHEN attempt_count >= max_attempts THEN $4
                  ELSE NULL
                END,
                last_error_code = $5,
                last_error_detail = $6,
                last_error_at = $7,
                last_error_lease_token = $3,
                updated_at = $4
           FROM triage_emergency_actions action
          WHERE alert.id = $1
            AND alert.emergency_action_id = $2
            AND action.id = alert.emergency_action_id
            AND action.status IN ${ACTIVE_ACTION_STATUSES}
            AND alert.status = 'leased'
            AND alert.lease_token = $3
            AND alert.lease_expires_at > $4
        RETURNING alert.id, alert.status,
                  alert.attempt_count, alert.max_attempts`,
        [
          alertId,
          actionId,
          leaseToken,
          failedAt,
          sanitized.code,
          sanitized.detail,
          failedAt,
          input.nextRetryAt,
        ],
      )
      if (rowCount(failed) !== 1) {
        throw outboxError(
          'stale_or_missing_lease',
          'The emergency alert lease is stale or unavailable.',
        )
      }
      const status = failed.rows[0]?.status
      if (status !== 'failed' && status !== 'terminal_failure') {
        throw outboxError(
          'binding_mismatch',
          'Emergency alert failure status is invalid.',
        )
      }
      return { status }
    } catch (error) {
      wrapPersistence(error)
    }
  }

  async function listTerminalEmergencyAlertFailures(requestedLimit: number) {
    const boundedLimit = limit(requestedLimit)
    try {
      const failures = await pool.query(
        `SELECT id AS alert_id,
                emergency_action_id AS action_id,
                severity,
                escalation_level,
                terminal_failed_at
           FROM triage_emergency_action_alerts
          WHERE status = 'terminal_failure'
          ORDER BY terminal_failed_at DESC, id
          LIMIT $1`,
        [boundedLimit],
      )
      return failures.rows.map((raw) =>
        emergencyRef(raw as Record<string, unknown>),
      )
    } catch (error) {
      wrapPersistence(error)
    }
  }

  return {
    enqueueDueEmergencyActionReminders,
    listDispatchableEmergencyAlertRefs,
    claimEmergencyAlertByRef,
    loadClaimedEmergencyAlertContext,
    markEmergencyAlertSent,
    failEmergencyAlert,
    listTerminalEmergencyAlertFailures,
  }
}
