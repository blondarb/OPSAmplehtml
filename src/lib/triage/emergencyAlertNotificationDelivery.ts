import { randomUUID as nodeRandomUUID } from 'node:crypto'

import type { Pool, PoolClient } from 'pg'

const ACTIVE_ACTION_STATUSES = "('open', 'attempting_contact', 'failed')"
const MIN_LEASE_MS = 10_000
const MAX_LEASE_MS = 15 * 60_000
const MIN_RETRY_MS = 5_000
const MAX_RETRY_MS = 15 * 60_000
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface ClaimedCriticalUiDelivery {
  alertId: string
  actionId: string
  severity: 'emergency'
  level: 0 | 1 | 2 | 3
  leaseToken: string
  attemptCount: number
  tenantId: string
  triageSessionId: string
  ownerTeam: string
  ownerUserId: string | null
}

export interface RecoverableCriticalUiDeliveryRef {
  alertId: string
  actionId: string
  severity: 'emergency'
  level: 0 | 1 | 2 | 3
}

export type CriticalUiDeliveryClaimResult =
  | { kind: 'claimed'; claim: ClaimedCriticalUiDelivery }
  | {
      kind: 'acknowledge'
      outcome: 'delivered' | 'suppressed' | 'terminal_failure' | 'invalid'
    }
  | { kind: 'retry'; retryAfterSeconds: number }

export type CriticalUiDeliveryOutcome =
  | { status: 'delivered' }
  | { status: 'suppressed' }
  | { status: 'terminal_failure' }

export type CriticalUiDeliveryFailureOutcome =
  | { status: 'failed' }
  | { status: 'terminal_failure' }
  | { status: 'delivered' }
  | { status: 'suppressed' }

type ErrorCode =
  | 'invalid_input'
  | 'binding_mismatch'
  | 'stale_or_missing_lease'
  | 'persistence_failed'

export class EmergencyAlertNotificationDeliveryError extends Error {
  readonly name = 'EmergencyAlertNotificationDeliveryError'

  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

interface Dependencies {
  now?: () => Date
  randomUUID?: () => string
}

function error(code: ErrorCode, message: string) {
  return new EmergencyAlertNotificationDeliveryError(code, message)
}

function wrapPersistence(cause: unknown): never {
  if (cause instanceof EmergencyAlertNotificationDeliveryError) throw cause
  throw error(
    'persistence_failed',
    'Emergency alert critical-UI delivery persistence failed.',
  )
}

function count(result: { rowCount: number | null }) {
  return result.rowCount ?? 0
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw error('invalid_input', `${field} is invalid.`)
  }
  return value.toLowerCase()
}

function bounded(value: unknown, field: string, maximum = 200): string {
  if (typeof value !== 'string') {
    throw error('invalid_input', `${field} is invalid.`)
  }
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maximum) {
    throw error('invalid_input', `${field} is invalid.`)
  }
  return trimmed
}

function boundedLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000) {
    throw error('invalid_input', 'limit is invalid.')
  }
  return value
}

function level(value: unknown): 0 | 1 | 2 | 3 {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 3) {
    throw error('binding_mismatch', 'Emergency alert level is invalid.')
  }
  return parsed as 0 | 1 | 2 | 3
}

function date(value: unknown): Date | null {
  if (value === null || value === undefined) return null
  const parsed = value instanceof Date ? value : new Date(String(value))
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function activeAction(status: unknown): boolean {
  return (
    status === 'open' ||
    status === 'attempting_contact' ||
    status === 'failed'
  )
}

function resolvedAction(status: unknown): boolean {
  return status === 'handed_off' || status === 'closed'
}

function retryAfterSeconds(target: Date | null, observedAt: Date): number {
  if (target === null) return 30
  return Math.max(
    5,
    Math.min(900, Math.ceil((target.getTime() - observedAt.getTime()) / 1_000)),
  )
}

function terminalOutcome(status: unknown): CriticalUiDeliveryClaimResult | null {
  if (status === 'delivered') {
    return { kind: 'acknowledge', outcome: 'delivered' }
  }
  if (status === 'suppressed') {
    return { kind: 'acknowledge', outcome: 'suppressed' }
  }
  if (status === 'terminal_failure') {
    return { kind: 'acknowledge', outcome: 'terminal_failure' }
  }
  return null
}

function sanitizedDeliveryFailure(cause: unknown): {
  code: string
  detail: string
} {
  const name = cause instanceof Error ? cause.name.toLowerCase() : ''
  const message = cause instanceof Error ? cause.message.toLowerCase() : ''
  if (name.includes('abort') || message.includes('timeout')) {
    return {
      code: 'critical_ui_timeout',
      detail: 'Critical UI notification persistence timed out.',
    }
  }
  if (message.includes('connection') || message.includes('unavailable')) {
    return {
      code: 'critical_ui_unavailable',
      detail: 'Critical UI notification persistence was unavailable.',
    }
  }
  return {
    code: 'critical_ui_delivery_failed',
    detail: 'Critical UI notification persistence failed.',
  }
}

async function rollback(client: PoolClient) {
  try {
    await client.query('ROLLBACK')
  } catch {
    // Preserve the original sanitized persistence failure.
  }
}

export function createPostgresEmergencyAlertNotificationDelivery(
  pool: Pool,
  dependencies: Dependencies = {},
) {
  const now = dependencies.now ?? (() => new Date())
  const randomUUID = dependencies.randomUUID ?? nodeRandomUUID

  async function listRecoverableCriticalUiDeliveryRefs(
    requestedLimit: number,
  ): Promise<RecoverableCriticalUiDeliveryRef[]> {
    const limit = boundedLimit(requestedLimit)
    const observedAt = now()
    try {
      const recoverable = await pool.query(
        `SELECT alert.id AS alert_id,
                action.id AS action_id,
                alert.severity,
                alert.escalation_level
           FROM triage_emergency_alert_notification_deliveries delivery
           JOIN triage_emergency_action_alerts alert
             ON alert.id = delivery.emergency_alert_id
           JOIN triage_emergency_actions action
             ON action.id = delivery.emergency_action_id
            AND action.id = alert.emergency_action_id
          WHERE alert.status = 'sent'
            AND action.status IN ${ACTIVE_ACTION_STATUSES}
            AND (
              (delivery.status IN ('pending', 'failed')
                AND delivery.next_attempt_at <= $1)
              OR (delivery.status = 'leased'
                AND delivery.lease_expires_at <= $1)
            )
          ORDER BY COALESCE(
                     delivery.next_attempt_at,
                     delivery.lease_expires_at
                   ),
                   delivery.created_at,
                   delivery.emergency_alert_id
          LIMIT $2`,
        [observedAt, limit],
      )
      return recoverable.rows.map((raw) => {
        const row = raw as Record<string, unknown>
        if (row.severity !== 'emergency') {
          throw error('binding_mismatch', 'Delivery severity is invalid.')
        }
        return {
          alertId: uuid(row.alert_id, 'persisted alertId'),
          actionId: uuid(row.action_id, 'persisted actionId'),
          severity: 'emergency',
          level: level(row.escalation_level),
        }
      })
    } catch (cause) {
      wrapPersistence(cause)
    }
  }

  async function claimCriticalUiDelivery(input: {
    alertId: string
    actionId: string
    severity: 'emergency'
    level: 0 | 1 | 2 | 3
    workerId: string
    leaseDurationMs: number
  }): Promise<CriticalUiDeliveryClaimResult> {
    const alertId = uuid(input.alertId, 'alertId')
    const actionId = uuid(input.actionId, 'actionId')
    const workerId = bounded(input.workerId, 'workerId')
    if (input.severity !== 'emergency') {
      throw error('invalid_input', 'severity is invalid.')
    }
    const requestedLevel = level(input.level)
    if (
      !Number.isSafeInteger(input.leaseDurationMs) ||
      input.leaseDurationMs < MIN_LEASE_MS ||
      input.leaseDurationMs > MAX_LEASE_MS
    ) {
      throw error('invalid_input', 'leaseDurationMs is invalid.')
    }
    const claimedAt = now()
    const leaseExpiresAt = new Date(
      claimedAt.getTime() + input.leaseDurationMs,
    )
    const leaseToken = uuid(randomUUID(), 'leaseToken')
    let client: PoolClient
    try {
      client = await pool.connect()
    } catch {
      throw error(
        'persistence_failed',
        'Emergency alert critical-UI delivery persistence failed.',
      )
    }

    try {
      await client.query('BEGIN')
      const actionBinding = await client.query(
        `SELECT action.id AS action_id,
                action.status AS action_status,
                session.tenant_id,
                action.triage_session_id,
                action.owner_team,
                action.owner_user_id
           FROM triage_emergency_actions action
           JOIN triage_sessions session
             ON session.id = action.triage_session_id
          WHERE action.id = $1
          FOR UPDATE OF action`,
        [actionId],
      )
      if (count(actionBinding) === 0) {
        await client.query('COMMIT')
        return { kind: 'acknowledge', outcome: 'invalid' }
      }
      if (count(actionBinding) !== 1) {
        throw error('persistence_failed', 'Emergency action binding is ambiguous.')
      }
      const alertBinding = await client.query(
        `SELECT alert.id AS alert_id,
                alert.emergency_action_id AS action_id,
                alert.status AS alert_status,
                alert.severity,
                alert.escalation_level
           FROM triage_emergency_action_alerts alert
          WHERE alert.id = $1
            AND alert.emergency_action_id = $2
          FOR UPDATE OF alert`,
        [alertId, actionId],
      )
      if (count(alertBinding) === 0) {
        await client.query('COMMIT')
        return { kind: 'acknowledge', outcome: 'invalid' }
      }
      if (count(alertBinding) !== 1) {
        throw error('persistence_failed', 'Emergency alert binding is ambiguous.')
      }
      const row = {
        ...(actionBinding.rows[0] as Record<string, unknown>),
        ...(alertBinding.rows[0] as Record<string, unknown>),
      }
      if (
        row.alert_id !== alertId ||
        row.action_id !== actionId ||
        row.severity !== input.severity ||
        level(row.escalation_level) !== requestedLevel ||
        typeof row.tenant_id !== 'string' ||
        typeof row.triage_session_id !== 'string' ||
        typeof row.owner_team !== 'string' ||
        (row.owner_user_id !== null &&
          row.owner_user_id !== undefined &&
          typeof row.owner_user_id !== 'string')
      ) {
        await client.query('COMMIT')
        return { kind: 'acknowledge', outcome: 'invalid' }
      }

      const deliveryResult = await client.query(
        `SELECT delivery.status,
                delivery.attempt_count,
                delivery.max_attempts,
                delivery.next_attempt_at,
                delivery.lease_token,
                delivery.lease_expires_at
           FROM triage_emergency_alert_notification_deliveries delivery
          WHERE delivery.emergency_alert_id = $1
            AND delivery.emergency_action_id = $2
          FOR UPDATE OF delivery`,
        [alertId, actionId],
      )
      const delivery = deliveryResult.rows[0] as
        | Record<string, unknown>
        | undefined

      if (resolvedAction(row.action_status)) {
        if (delivery && !terminalOutcome(delivery.status)) {
          const suppressed = await client.query(
            `UPDATE triage_emergency_alert_notification_deliveries
                SET status = 'suppressed',
                    next_attempt_at = NULL,
                    outcome_lease_token = COALESCE(lease_token, outcome_lease_token),
                    lease_token = NULL,
                    lease_owner = NULL,
                    claimed_at = NULL,
                    lease_expires_at = NULL,
                    suppressed_at = $3,
                    updated_at = $3
              WHERE emergency_alert_id = $1
                AND emergency_action_id = $2
                AND status IN ('pending', 'leased', 'failed')
          RETURNING status`,
            [alertId, actionId, claimedAt],
          )
          if (count(suppressed) !== 1) {
            throw error(
              'persistence_failed',
              'Resolved emergency alert delivery suppression failed.',
            )
          }
        }
        await client.query('COMMIT')
        return { kind: 'acknowledge', outcome: 'suppressed' }
      }

      if (!activeAction(row.action_status)) {
        await client.query('COMMIT')
        return { kind: 'retry', retryAfterSeconds: 30 }
      }

      if (row.alert_status !== 'sent') {
        await client.query('COMMIT')
        if (
          row.alert_status === 'terminal_failure' ||
          row.alert_status === 'suppressed'
        ) {
          return { kind: 'acknowledge', outcome: 'suppressed' }
        }
        return { kind: 'retry', retryAfterSeconds: 5 }
      }

      if (!delivery) {
        throw error(
          'persistence_failed',
          'Sent emergency alert is missing its critical-UI delivery row.',
        )
      }
      const terminal = terminalOutcome(delivery.status)
      if (terminal) {
        await client.query('COMMIT')
        return terminal
      }

      const attemptCount = Number(delivery.attempt_count)
      const maxAttempts = Number(delivery.max_attempts)
      if (
        !Number.isSafeInteger(attemptCount) ||
        !Number.isSafeInteger(maxAttempts) ||
        attemptCount < 0 ||
        maxAttempts < 1 ||
        attemptCount > maxAttempts
      ) {
        throw error('binding_mismatch', 'Delivery attempt state is invalid.')
      }
      const nextAttemptAt = date(delivery.next_attempt_at)
      const currentLeaseExpiry = date(delivery.lease_expires_at)
      const eligible =
        ((delivery.status === 'pending' || delivery.status === 'failed') &&
          nextAttemptAt !== null &&
          nextAttemptAt <= claimedAt) ||
        (delivery.status === 'leased' &&
          currentLeaseExpiry !== null &&
          currentLeaseExpiry <= claimedAt)

      if (!eligible) {
        await client.query('COMMIT')
        return {
          kind: 'retry',
          retryAfterSeconds: retryAfterSeconds(
            delivery.status === 'leased' ? currentLeaseExpiry : nextAttemptAt,
            claimedAt,
          ),
        }
      }

      if (delivery.status === 'leased' && attemptCount >= maxAttempts) {
        const terminalized = await client.query(
          `UPDATE triage_emergency_alert_notification_deliveries
              SET status = 'terminal_failure',
                  next_attempt_at = NULL,
                  outcome_lease_token = lease_token,
                  lease_token = NULL,
                  lease_owner = NULL,
                  claimed_at = NULL,
                  lease_expires_at = NULL,
                  terminal_failed_at = $3,
                  last_error_code = 'delivery_lease_expired',
                  last_error_detail = 'Critical UI delivery lease expired after retry exhaustion.',
                  last_error_at = $3,
                  last_error_lease_token = lease_token,
                  updated_at = $3
            WHERE emergency_alert_id = $1
              AND emergency_action_id = $2
              AND status = 'leased'
              AND lease_expires_at <= $3
              AND attempt_count = max_attempts
        RETURNING status`,
          [alertId, actionId, claimedAt],
        )
        if (count(terminalized) !== 1) {
          throw error(
            'persistence_failed',
            'Expired critical-UI delivery terminalization failed.',
          )
        }
        await client.query('COMMIT')
        return { kind: 'acknowledge', outcome: 'terminal_failure' }
      }

      const claimed = await client.query(
        `UPDATE triage_emergency_alert_notification_deliveries
            SET status = 'leased',
                attempt_count = attempt_count + 1,
                next_attempt_at = NULL,
                lease_token = $4,
                lease_owner = $5,
                claimed_at = $3,
                lease_expires_at = $6,
                outcome_lease_token = NULL,
                updated_at = $3
          WHERE emergency_alert_id = $1
            AND emergency_action_id = $2
            AND status = $7
            AND lease_token IS NOT DISTINCT FROM $8
            AND attempt_count < max_attempts
            AND (
              (status IN ('pending', 'failed') AND next_attempt_at <= $3)
              OR (status = 'leased' AND lease_expires_at <= $3)
            )
      RETURNING status, lease_token, attempt_count`,
        [
          alertId,
          actionId,
          claimedAt,
          leaseToken,
          workerId,
          leaseExpiresAt,
          delivery.status,
          delivery.lease_token ?? null,
        ],
      )
      if (count(claimed) !== 1) {
        throw error(
          'persistence_failed',
          'Critical-UI delivery claim failed.',
        )
      }
      const claimedRow = claimed.rows[0] as Record<string, unknown>
      if (
        claimedRow.status !== 'leased' ||
        claimedRow.lease_token !== leaseToken ||
        !Number.isSafeInteger(Number(claimedRow.attempt_count))
      ) {
        throw error('binding_mismatch', 'Claimed delivery state is invalid.')
      }

      await client.query('COMMIT')
      return {
        kind: 'claimed',
        claim: {
          alertId,
          actionId,
          severity: 'emergency',
          level: requestedLevel,
          leaseToken,
          attemptCount: Number(claimedRow.attempt_count),
          tenantId: row.tenant_id,
          triageSessionId: row.triage_session_id,
          ownerTeam: row.owner_team,
          ownerUserId:
            typeof row.owner_user_id === 'string' ? row.owner_user_id : null,
        },
      }
    } catch (cause) {
      await rollback(client)
      wrapPersistence(cause)
    } finally {
      client.release()
    }
  }

  async function deliverCriticalUiNotification(
    input: ClaimedCriticalUiDelivery,
  ): Promise<CriticalUiDeliveryOutcome> {
    const alertId = uuid(input.alertId, 'alertId')
    const actionId = uuid(input.actionId, 'actionId')
    const leaseToken = uuid(input.leaseToken, 'leaseToken')
    const deliveredAt = now()
    let client: PoolClient
    try {
      client = await pool.connect()
    } catch {
      throw error(
        'persistence_failed',
        'Emergency alert critical-UI delivery persistence failed.',
      )
    }

    try {
      await client.query('BEGIN')
      // Lock the action before the delivery row. The action handoff trigger
      // uses the same order, preventing a delivery/handoff deadlock while
      // making the active-vs-resolved decision authoritative.
      const binding = await client.query(
        `SELECT alert.id AS alert_id,
                action.id AS action_id,
                alert.status AS alert_status,
                action.status AS action_status,
                alert.severity,
                alert.escalation_level,
                session.tenant_id,
                action.triage_session_id,
                action.owner_team,
                action.owner_user_id
           FROM triage_emergency_actions action
           JOIN triage_emergency_action_alerts alert
             ON alert.emergency_action_id = action.id
           JOIN triage_sessions session
             ON session.id = action.triage_session_id
          WHERE alert.id = $1
            AND action.id = $2
          FOR UPDATE OF action`,
        [alertId, actionId],
      )
      if (count(binding) !== 1) {
        throw error(
          'stale_or_missing_lease',
          'Critical-UI delivery lease is stale or unavailable.',
        )
      }
      const deliveryState = await client.query(
        `SELECT delivery.status AS delivery_status,
                delivery.lease_token,
                delivery.lease_expires_at,
                delivery.notification_id
           FROM triage_emergency_alert_notification_deliveries delivery
          WHERE delivery.emergency_alert_id = $1
            AND delivery.emergency_action_id = $2
          FOR UPDATE OF delivery`,
        [alertId, actionId],
      )
      if (count(deliveryState) !== 1) {
        throw error(
          'stale_or_missing_lease',
          'Critical-UI delivery lease is stale or unavailable.',
        )
      }
      const row = {
        ...(binding.rows[0] as Record<string, unknown>),
        ...(deliveryState.rows[0] as Record<string, unknown>),
      }
      if (row.delivery_status === 'delivered') {
        await client.query('COMMIT')
        return { status: 'delivered' }
      }
      if (row.delivery_status === 'suppressed') {
        await client.query('COMMIT')
        return { status: 'suppressed' }
      }
      if (row.delivery_status === 'terminal_failure') {
        await client.query('COMMIT')
        return { status: 'terminal_failure' }
      }
      if (
        row.alert_id !== alertId ||
        row.action_id !== actionId ||
        row.severity !== input.severity ||
        level(row.escalation_level) !== input.level ||
        row.tenant_id !== input.tenantId ||
        row.triage_session_id !== input.triageSessionId ||
        row.owner_team !== input.ownerTeam ||
        (row.owner_user_id ?? null) !== input.ownerUserId
      ) {
        throw error('binding_mismatch', 'Critical-UI routing binding changed.')
      }
      if (
        row.delivery_status !== 'leased' ||
        row.lease_token !== leaseToken ||
        date(row.lease_expires_at) === null ||
        (date(row.lease_expires_at) as Date) <= deliveredAt ||
        row.alert_status !== 'sent'
      ) {
        throw error(
          'stale_or_missing_lease',
          'Critical-UI delivery lease is stale or unavailable.',
        )
      }
      if (resolvedAction(row.action_status)) {
        const suppressed = await client.query(
          `UPDATE triage_emergency_alert_notification_deliveries
              SET status = 'suppressed',
                  next_attempt_at = NULL,
                  outcome_lease_token = lease_token,
                  lease_token = NULL,
                  lease_owner = NULL,
                  claimed_at = NULL,
                  lease_expires_at = NULL,
                  suppressed_at = $4,
                  updated_at = $4
            WHERE emergency_alert_id = $1
              AND emergency_action_id = $2
              AND status = 'leased'
              AND lease_token = $3
        RETURNING status`,
          [alertId, actionId, leaseToken, deliveredAt],
        )
        if (count(suppressed) !== 1) {
          throw error('persistence_failed', 'Delivery suppression failed.')
        }
        await client.query('COMMIT')
        return { status: 'suppressed' }
      }
      if (!activeAction(row.action_status)) {
        throw error('binding_mismatch', 'Emergency action state is invalid.')
      }

      // Do not use the legacy non-throwing createNotification helper here. The
      // insert and delivery evidence must succeed or roll back together.
      const notification = await client.query(
        `INSERT INTO notifications (
           tenant_id,
           recipient_user_id,
           source_type,
           source_id,
           patient_id,
           priority,
           title,
           body,
           metadata
         )
         SELECT session.tenant_id,
                action.owner_user_id,
                'triage_result',
                $5,
                NULL,
                'critical',
                'Emergency neurology triage action requires immediate response',
                'Open the emergency action and document verified handoff or closure.',
                jsonb_build_object(
                  'critical_ui', true,
                  'action_label', 'Open emergency action',
                  'emergency_alert_id', alert.id,
                  'emergency_action_id', action.id,
                  'triage_session_id', action.triage_session_id,
                  'owner_team', action.owner_team,
                  'escalation_level', alert.escalation_level
                )
           FROM triage_emergency_alert_notification_deliveries delivery
           JOIN triage_emergency_action_alerts alert
             ON alert.id = delivery.emergency_alert_id
           JOIN triage_emergency_actions action
             ON action.id = delivery.emergency_action_id
            AND action.id = alert.emergency_action_id
           JOIN triage_sessions session
             ON session.id = action.triage_session_id
          WHERE delivery.emergency_alert_id = $1
            AND delivery.emergency_action_id = $2
            AND delivery.status = 'leased'
            AND delivery.lease_token = $3
            AND delivery.lease_expires_at > $4
            AND alert.status = 'sent'
            AND action.status IN ${ACTIVE_ACTION_STATUSES}
      RETURNING id::text AS id`,
        // Keep a distinct context-typed parameter for source_id so this is
        // compatible whether the existing notifications schema uses text or
        // uuid. Its value is still the immutable alert ID.
        [alertId, actionId, leaseToken, deliveredAt, alertId],
      )
      if (count(notification) !== 1 || typeof notification.rows[0]?.id !== 'string') {
        throw error(
          'persistence_failed',
          'Critical UI notification insertion failed.',
        )
      }

      const marked = await client.query(
        `UPDATE triage_emergency_alert_notification_deliveries
            SET status = 'delivered',
                next_attempt_at = NULL,
                outcome_lease_token = $3,
                lease_token = NULL,
                lease_owner = NULL,
                claimed_at = NULL,
                lease_expires_at = NULL,
                notification_id = $5,
                delivered_at = $4,
                updated_at = $4
          WHERE emergency_alert_id = $1
            AND emergency_action_id = $2
            AND status = 'leased'
            AND lease_token = $3
            AND lease_expires_at > $4
      RETURNING status`,
        [
          alertId,
          actionId,
          leaseToken,
          deliveredAt,
          notification.rows[0].id,
        ],
      )
      if (count(marked) !== 1 || marked.rows[0]?.status !== 'delivered') {
        throw error(
          'persistence_failed',
          'Critical UI notification delivery evidence failed.',
        )
      }
      await client.query('COMMIT')
      return { status: 'delivered' }
    } catch (cause) {
      await rollback(client)
      wrapPersistence(cause)
    } finally {
      client.release()
    }
  }

  async function failCriticalUiDelivery(input: {
    alertId: string
    actionId: string
    leaseToken: string
    error: unknown
    nextRetryAt: Date
  }): Promise<CriticalUiDeliveryFailureOutcome> {
    const alertId = uuid(input.alertId, 'alertId')
    const actionId = uuid(input.actionId, 'actionId')
    const leaseToken = uuid(input.leaseToken, 'leaseToken')
    const failedAt = now()
    if (
      !(input.nextRetryAt instanceof Date) ||
      !Number.isFinite(input.nextRetryAt.getTime()) ||
      input.nextRetryAt.getTime() - failedAt.getTime() < MIN_RETRY_MS ||
      input.nextRetryAt.getTime() - failedAt.getTime() > MAX_RETRY_MS
    ) {
      throw error('invalid_input', 'nextRetryAt is invalid.')
    }
    const sanitized = sanitizedDeliveryFailure(input.error)
    let client: PoolClient
    try {
      client = await pool.connect()
    } catch {
      throw error(
        'persistence_failed',
        'Emergency alert critical-UI delivery persistence failed.',
      )
    }

    try {
      await client.query('BEGIN')
      const failed = await client.query(
        `UPDATE triage_emergency_alert_notification_deliveries delivery
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
          WHERE delivery.emergency_alert_id = $1
            AND delivery.emergency_action_id = $2
            AND action.id = delivery.emergency_action_id
            AND action.status IN ${ACTIVE_ACTION_STATUSES}
            AND delivery.status = 'leased'
            AND delivery.lease_token = $3
            AND delivery.lease_expires_at > $4
      RETURNING delivery.status`,
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
      if (count(failed) === 1) {
        const status = failed.rows[0]?.status
        if (status !== 'failed' && status !== 'terminal_failure') {
          throw error('binding_mismatch', 'Delivery failure status is invalid.')
        }
        await client.query('COMMIT')
        return { status }
      }

      const existing = await client.query(
        `SELECT status
           FROM triage_emergency_alert_notification_deliveries
          WHERE emergency_alert_id = $1
            AND emergency_action_id = $2
          FOR UPDATE`,
        [alertId, actionId],
      )
      const status = existing.rows[0]?.status
      if (
        status === 'delivered' ||
        status === 'suppressed' ||
        status === 'terminal_failure'
      ) {
        await client.query('COMMIT')
        return { status }
      }
      throw error(
        'stale_or_missing_lease',
        'Critical-UI delivery lease is stale or unavailable.',
      )
    } catch (cause) {
      await rollback(client)
      wrapPersistence(cause)
    } finally {
      client.release()
    }
  }

  return {
    listRecoverableCriticalUiDeliveryRefs,
    claimCriticalUiDelivery,
    deliverCriticalUiNotification,
    failCriticalUiDelivery,
  }
}
