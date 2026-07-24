import type { Pool, PoolClient, QueryResult } from 'pg'
import { describe, expect, it, vi } from 'vitest'

import { createPostgresEmergencyAlertNotificationDelivery } from '@/lib/triage/emergencyAlertNotificationDelivery'

type QueryCall = { sql: string; values: unknown[] }

const ALERT_ID = '54000000-0000-4000-8000-000000000201'
const ACTION_ID = '54000000-0000-4000-8000-000000000101'
const SESSION_ID = '54000000-0000-4000-8000-000000000001'
const LEASE_TOKEN = '54000000-0000-4000-8000-000000000301'
const NOW = new Date('2026-07-11T12:00:00.000Z')

function result(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length,
): QueryResult<Record<string, unknown>> {
  return { rows, rowCount } as QueryResult<Record<string, unknown>>
}

function transactionalPool(
  handler: (sql: string, values: unknown[]) => QueryResult<Record<string, unknown>>,
) {
  const calls: QueryCall[] = []
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values })
    return handler(sql, values)
  })
  const release = vi.fn()
  const client = { query, release } as unknown as PoolClient
  const pool = {
    connect: vi.fn(async () => client),
  } as unknown as Pool
  return { pool, calls, release }
}

function directPool(
  handler: (sql: string, values: unknown[]) => QueryResult<Record<string, unknown>>,
) {
  const calls: QueryCall[] = []
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values })
    return handler(sql, values)
  })
  return { pool: { query } as unknown as Pool, calls }
}

function service(pool: Pool) {
  return createPostgresEmergencyAlertNotificationDelivery(pool, {
    now: () => NOW,
    randomUUID: () => LEASE_TOKEN,
  })
}

function bindingRow(overrides: Record<string, unknown> = {}) {
  return {
    alert_id: ALERT_ID,
    action_id: ACTION_ID,
    alert_status: 'sent',
    action_status: 'open',
    severity: 'emergency',
    escalation_level: 2,
    tenant_id: 'tenant-alert',
    triage_session_id: SESSION_ID,
    owner_team: 'clinical-triage',
    owner_user_id: 'clinician-1',
    ...overrides,
  }
}

describe('Postgres emergency alert critical-UI notification delivery', () => {
  it('lists only due opaque delivery references for active sent alerts', async () => {
    const { pool, calls } = directPool(() =>
      result([
        {
          alert_id: ALERT_ID,
          action_id: ACTION_ID,
          severity: 'emergency',
          escalation_level: 2,
        },
      ]),
    )

    const refs = await service(pool).listRecoverableCriticalUiDeliveryRefs(25)

    expect(refs).toEqual([
      {
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        severity: 'emergency',
        level: 2,
      },
    ])
    expect(Object.keys(refs[0]).sort()).toEqual([
      'actionId',
      'alertId',
      'level',
      'severity',
    ])
    expect(calls[0].sql).toContain("alert.status = 'sent'")
    expect(calls[0].sql).toContain(
      "action.status IN ('open', 'attempting_contact', 'failed')",
    )
    expect(calls[0].sql).toContain("delivery.status IN ('pending', 'failed')")
    expect(calls[0].sql).toContain("delivery.status = 'leased'")
    expect(calls[0].sql).not.toMatch(/tenant_id|patient|source_text|owner_team/i)
  })

  it('claims only a sent alert and resolves tenant/team routing behind database locks', async () => {
    const { pool, calls } = transactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/SELECT action.id AS action_id/.test(sql)) return result([bindingRow()])
      if (/SELECT alert.id AS alert_id/.test(sql)) return result([bindingRow()])
      if (/SELECT delivery.status/.test(sql)) {
        return result([
          {
            status: 'pending',
            attempt_count: 0,
            max_attempts: 5,
            next_attempt_at: NOW,
            lease_token: null,
            lease_expires_at: null,
          },
        ])
      }
      if (/UPDATE triage_emergency_alert_notification_deliveries/.test(sql)) {
        return result(
          [
            {
              status: 'leased',
              lease_token: LEASE_TOKEN,
              attempt_count: 1,
            },
          ],
          1,
        )
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(
      service(pool).claimCriticalUiDelivery({
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        severity: 'emergency',
        level: 2,
        workerId: 'critical-ui-worker-1',
        leaseDurationMs: 120_000,
      }),
    ).resolves.toEqual({
      kind: 'claimed',
      claim: {
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        severity: 'emergency',
        level: 2,
        leaseToken: LEASE_TOKEN,
        attemptCount: 1,
        tenantId: 'tenant-alert',
        triageSessionId: SESSION_ID,
        ownerTeam: 'clinical-triage',
        ownerUserId: 'clinician-1',
      },
    })
    const actionBinding = calls.find((call) =>
      call.sql.includes('SELECT action.id AS action_id'),
    )
    const alertBinding = calls.find((call) =>
      call.sql.includes('SELECT alert.id AS alert_id'),
    )
    expect(actionBinding?.sql).toContain('FOR UPDATE OF action')
    expect(alertBinding?.sql).toContain('FOR UPDATE OF alert')
    expect(actionBinding?.values).not.toContain('tenant-alert')
    expect(actionBinding?.sql).not.toMatch(/patient|text_input|instruction_given/i)
  })

  it('returns retry while the publisher is not durably sent and never routes from queue data', async () => {
    const { pool, calls } = transactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/SELECT action.id AS action_id/.test(sql)) return result([bindingRow()])
      if (/SELECT alert.id AS alert_id/.test(sql)) {
        return result([bindingRow({ alert_status: 'leased' })])
      }
      if (/SELECT delivery.status/.test(sql)) return result([], 0)
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(
      service(pool).claimCriticalUiDelivery({
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        severity: 'emergency',
        level: 2,
        workerId: 'critical-ui-worker-1',
        leaseDurationMs: 120_000,
      }),
    ).resolves.toEqual({ kind: 'retry', retryAfterSeconds: 5 })
    expect(calls.some((call) => /UPDATE notifications/.test(call.sql))).toBe(false)
  })

  it('terminalizes an expired final delivery lease instead of leaving a stuck alert', async () => {
    const { pool, calls } = transactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/SELECT action.id AS action_id/.test(sql)) return result([bindingRow()])
      if (/SELECT alert.id AS alert_id/.test(sql)) return result([bindingRow()])
      if (/SELECT delivery.status/.test(sql)) {
        return result([
          {
            status: 'leased',
            attempt_count: 5,
            max_attempts: 5,
            next_attempt_at: null,
            lease_token: '54000000-0000-4000-8000-000000000302',
            lease_expires_at: new Date('2026-07-11T11:59:00.000Z'),
          },
        ])
      }
      if (/last_error_code = 'delivery_lease_expired'/.test(sql)) {
        return result([{ status: 'terminal_failure' }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(
      service(pool).claimCriticalUiDelivery({
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        severity: 'emergency',
        level: 2,
        workerId: 'critical-ui-worker-2',
        leaseDurationMs: 60_000,
      }),
    ).resolves.toEqual({
      kind: 'acknowledge',
      outcome: 'terminal_failure',
    })
    expect(
      calls.some((call) =>
        call.sql.includes("last_error_code = 'delivery_lease_expired'"),
      ),
    ).toBe(true)
  })

  it('defers an active lease only until its authoritative expiry', async () => {
    const { pool } = transactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/SELECT action.id AS action_id/.test(sql)) return result([bindingRow()])
      if (/SELECT alert.id AS alert_id/.test(sql)) return result([bindingRow()])
      if (/SELECT delivery.status/.test(sql)) {
        return result([
          {
            status: 'leased',
            attempt_count: 1,
            max_attempts: 5,
            next_attempt_at: null,
            lease_token: '54000000-0000-4000-8000-000000000302',
            lease_expires_at: new Date('2026-07-11T12:00:42.000Z'),
          },
        ])
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(
      service(pool).claimCriticalUiDelivery({
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        severity: 'emergency',
        level: 2,
        workerId: 'critical-ui-worker-2',
        leaseDurationMs: 60_000,
      }),
    ).resolves.toEqual({ kind: 'retry', retryAfterSeconds: 42 })
  })

  it('atomically inserts one static critical UI notification and marks delivery', async () => {
    const { pool, calls } = transactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/SELECT alert.id AS alert_id/.test(sql)) {
        return result([bindingRow()])
      }
      if (/SELECT delivery.status AS delivery_status/.test(sql)) {
        return result([
          {
            delivery_status: 'leased',
            lease_token: LEASE_TOKEN,
            lease_expires_at: new Date('2026-07-11T12:02:00.000Z'),
          },
        ])
      }
      if (/INSERT INTO notifications/.test(sql)) {
        return result([{ id: 'notification-1' }], 1)
      }
      if (/UPDATE triage_emergency_alert_notification_deliveries/.test(sql)) {
        return result([{ status: 'delivered' }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(
      service(pool).deliverCriticalUiNotification({
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        severity: 'emergency',
        level: 2,
        leaseToken: LEASE_TOKEN,
        attemptCount: 1,
        tenantId: 'tenant-alert',
        triageSessionId: SESSION_ID,
        ownerTeam: 'clinical-triage',
        ownerUserId: 'clinician-1',
      }),
    ).resolves.toEqual({ status: 'delivered' })

    const insertion = calls.find((call) =>
      call.sql.includes('INSERT INTO notifications'),
    )
    expect(insertion?.sql).toContain("'critical'")
    expect(insertion?.sql).toContain("'triage_result'")
    expect(insertion?.sql).toContain('source_id')
    expect(insertion?.sql).toContain('jsonb_build_object')
    expect(insertion?.sql).not.toMatch(/patient_name|chief_complaint|note|source_text/i)
    expect(insertion?.values).toEqual([
      ALERT_ID,
      ACTION_ID,
      LEASE_TOKEN,
      NOW,
      ALERT_ID,
    ])
    expect(calls.at(-2)?.sql).toContain(
      'UPDATE triage_emergency_alert_notification_deliveries',
    )
    expect(calls.at(-1)?.sql).toBe('COMMIT')
  })

  it('acknowledges idempotently without inserting a second notification', async () => {
    const { pool, calls } = transactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/SELECT alert.id AS alert_id/.test(sql)) {
        return result([bindingRow()])
      }
      if (/SELECT delivery.status AS delivery_status/.test(sql)) {
        return result([
          {
            delivery_status: 'delivered',
            notification_id: 'notification-1',
          },
        ])
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(
      service(pool).deliverCriticalUiNotification({
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        severity: 'emergency',
        level: 2,
        leaseToken: LEASE_TOKEN,
        attemptCount: 1,
        tenantId: 'tenant-alert',
        triageSessionId: SESSION_ID,
        ownerTeam: 'clinical-triage',
        ownerUserId: 'clinician-1',
      }),
    ).resolves.toEqual({ status: 'delivered' })
    expect(calls.some((call) => call.sql.includes('INSERT INTO notifications'))).toBe(false)
  })

  it('suppresses before insertion if verified handoff wins the race', async () => {
    const { pool, calls } = transactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/SELECT alert.id AS alert_id/.test(sql)) {
        return result([bindingRow({ action_status: 'handed_off' })])
      }
      if (/SELECT delivery.status AS delivery_status/.test(sql)) {
        return result([
          {
            delivery_status: 'suppressed',
          },
        ])
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(
      service(pool).deliverCriticalUiNotification({
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        severity: 'emergency',
        level: 2,
        leaseToken: LEASE_TOKEN,
        attemptCount: 1,
        tenantId: 'tenant-alert',
        triageSessionId: SESSION_ID,
        ownerTeam: 'clinical-triage',
        ownerUserId: 'clinician-1',
      }),
    ).resolves.toEqual({ status: 'suppressed' })
    expect(calls.some((call) => call.sql.includes('INSERT INTO notifications'))).toBe(false)
  })

  it('sanitizes delivery errors and terminalizes retry exhaustion without resolving the action', async () => {
    const raw = 'synthetic patient-like error SECRET-DO-NOT-PERSIST'
    const { pool, calls } = transactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_emergency_alert_notification_deliveries/.test(sql)) {
        return result([{ status: 'terminal_failure' }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(
      service(pool).failCriticalUiDelivery({
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        leaseToken: LEASE_TOKEN,
        error: new Error(raw),
        nextRetryAt: new Date('2026-07-11T12:01:00.000Z'),
      }),
    ).resolves.toEqual({ status: 'terminal_failure' })
    const mutation = calls.find((call) =>
      call.sql.includes('UPDATE triage_emergency_alert_notification_deliveries'),
    )
    expect(mutation?.sql).not.toContain('UPDATE triage_emergency_actions')
    expect(JSON.stringify(mutation?.values)).not.toContain(raw)
    expect(JSON.stringify(mutation?.values)).not.toContain(
      'SECRET-DO-NOT-PERSIST',
    )
  })
})

describe('sql type safety', () => {
  it('guards the owner_user_id -> recipient_user_id uuid cast instead of casting it bare', async () => {
    const { pool, calls } = transactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/SELECT alert.id AS alert_id/.test(sql)) {
        return result([bindingRow()])
      }
      if (/SELECT delivery.status AS delivery_status/.test(sql)) {
        return result([
          {
            delivery_status: 'leased',
            lease_token: LEASE_TOKEN,
            lease_expires_at: new Date('2026-07-11T12:02:00.000Z'),
          },
        ])
      }
      if (/INSERT INTO notifications/.test(sql)) {
        return result([{ id: 'notification-1' }], 1)
      }
      if (/UPDATE triage_emergency_alert_notification_deliveries/.test(sql)) {
        return result([{ status: 'delivered' }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(
      service(pool).deliverCriticalUiNotification({
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        severity: 'emergency',
        level: 2,
        leaseToken: LEASE_TOKEN,
        attemptCount: 1,
        tenantId: 'tenant-alert',
        triageSessionId: SESSION_ID,
        ownerTeam: 'clinical-triage',
        ownerUserId: 'clinician-1',
      }),
    ).resolves.toEqual({ status: 'delivered' })

    const insertion = calls.find((call) =>
      call.sql.includes('INSERT INTO notifications'),
    )
    expect(insertion?.sql).toContain('action.owner_user_id::uuid')
    expect(insertion?.sql).toContain('~*')
    expect(insertion?.sql).not.toContain(
      '                action.owner_user_id,',
    )
  })

  it('pins the next_attempt_at bind parameter to timestamptz inside the bare CASE...THEN', async () => {
    const { pool, calls } = transactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/UPDATE triage_emergency_alert_notification_deliveries/.test(sql)) {
        return result([{ status: 'terminal_failure' }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(
      service(pool).failCriticalUiDelivery({
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        leaseToken: LEASE_TOKEN,
        error: new Error('synthetic failure'),
        nextRetryAt: new Date('2026-07-11T12:01:00.000Z'),
      }),
    ).resolves.toEqual({ status: 'terminal_failure' })

    const mutation = calls.find((call) =>
      call.sql.includes('UPDATE triage_emergency_alert_notification_deliveries'),
    )
    expect(mutation?.sql).toContain('$8::timestamptz')
  })
})
