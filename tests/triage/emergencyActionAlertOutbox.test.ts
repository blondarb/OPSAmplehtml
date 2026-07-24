import type { Pool, PoolClient, QueryResult } from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPostgresEmergencyActionAlertOutbox,
  EmergencyActionAlertOutboxError,
} from '@/lib/triage/emergencyActionAlertOutbox'

type QueryCall = { sql: string; values: unknown[] }

const ACTION_ID = '53000000-0000-4000-8000-000000000101'
const ALERT_ID = '53000000-0000-4000-8000-000000000201'
const LEASE_TOKEN = '53000000-0000-4000-8000-000000000301'
const NOW = new Date('2026-07-11T12:00:00.000Z')

function result(
  rows: Record<string, unknown>[] = [],
  rowCount = rows.length,
): QueryResult<Record<string, unknown>> {
  return { rows, rowCount } as QueryResult<Record<string, unknown>>
}

function mockDirectPool(
  handler: (sql: string, values: unknown[]) => QueryResult<Record<string, unknown>>,
) {
  const calls: QueryCall[] = []
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values })
    return handler(sql, values)
  })
  return { pool: { query } as unknown as Pool, calls, query }
}

function mockTransactionalPool(
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
    query: vi.fn(),
  } as unknown as Pool
  return { pool, calls, query, release }
}

function service(pool: Pool) {
  return createPostgresEmergencyActionAlertOutbox(pool, {
    now: () => NOW,
    randomUUID: () => LEASE_TOKEN,
  })
}

describe('Postgres emergency-action alert outbox', () => {
  beforeEach(() => vi.clearAllMocks())

  it('locks due active actions, appends one deduplicated reminder, and advances cadence atomically', async () => {
    const { pool, calls, release } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/SELECT action.id AS action_id/.test(sql)) {
        return result([
          {
            action_id: ACTION_ID,
            next_sequence_number: 1,
            escalation_level: 1,
          },
        ])
      }
      if (/INSERT INTO triage_emergency_action_alerts/.test(sql)) {
        return result(
          [
            {
              alert_id: ALERT_ID,
              action_id: ACTION_ID,
              severity: 'emergency',
              escalation_level: 1,
            },
          ],
          1,
        )
      }
      if (/UPDATE triage_emergency_actions/.test(sql)) {
        return result([{ id: ACTION_ID }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(
      service(pool).enqueueDueEmergencyActionReminders(10),
    ).resolves.toEqual([
      {
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        severity: 'emergency',
        level: 1,
      },
    ])

    const selection = calls.find((call) =>
      call.sql.includes('SELECT action.id AS action_id'),
    )
    expect(selection?.sql).toContain('FOR UPDATE OF action SKIP LOCKED')
    expect(selection?.sql).toContain(
      "action.status IN ('open', 'attempting_contact', 'failed')",
    )
    expect(selection?.sql).toContain('NOT EXISTS')
    expect(selection?.sql).toContain(
      "outstanding.status IN ('pending', 'leased', 'failed')",
    )
    const insertion = calls.find((call) =>
      call.sql.includes('INSERT INTO triage_emergency_action_alerts'),
    )
    expect(insertion?.sql).toContain(
      'ON CONFLICT (emergency_action_id, sequence_number) DO NOTHING',
    )
    const actionUpdate = calls.find((call) =>
      call.sql.includes('UPDATE triage_emergency_actions'),
    )
    expect(actionUpdate?.values.map(String)).toContain(
      String(new Date('2026-07-11T12:05:00.000Z')),
    )
    expect(calls.some((call) => call.sql === 'COMMIT')).toBe(true)
    expect(release).toHaveBeenCalledOnce()
  })

  it('continues reminders indefinitely at capped level three and a fifteen-minute cadence', async () => {
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/SELECT action.id AS action_id/.test(sql)) {
        return result([
          {
            action_id: ACTION_ID,
            next_sequence_number: 41,
            escalation_level: 3,
          },
        ])
      }
      if (/INSERT INTO triage_emergency_action_alerts/.test(sql)) {
        return result(
          [
            {
              alert_id: ALERT_ID,
              action_id: ACTION_ID,
              severity: 'emergency',
              escalation_level: 3,
            },
          ],
          1,
        )
      }
      if (/UPDATE triage_emergency_actions/.test(sql)) {
        return result([{ id: ACTION_ID }], 1)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await service(pool).enqueueDueEmergencyActionReminders(1)

    const insertion = calls.find((call) =>
      call.sql.includes('INSERT INTO triage_emergency_action_alerts'),
    )
    expect(insertion?.values).toEqual(
      expect.arrayContaining([ACTION_ID, 41, 3]),
    )
    const actionUpdate = calls.find((call) =>
      call.sql.includes('UPDATE triage_emergency_actions'),
    )
    expect(actionUpdate?.values.map(String)).toContain(
      String(new Date('2026-07-11T12:15:00.000Z')),
    )
  })

  it('rolls back if any reminder mutation does not affect exactly one row', async () => {
    const { pool, calls } = mockTransactionalPool((sql) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return result()
      if (/SELECT action.id AS action_id/.test(sql)) {
        return result([
          {
            action_id: ACTION_ID,
            next_sequence_number: 1,
            escalation_level: 1,
          },
        ])
      }
      if (/INSERT INTO triage_emergency_action_alerts/.test(sql)) {
        return result([], 0)
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    await expect(
      service(pool).enqueueDueEmergencyActionReminders(1),
    ).rejects.toMatchObject({ code: 'persistence_failed' })
    expect(calls.some((call) => call.sql === 'ROLLBACK')).toBe(true)
    expect(calls.some((call) => call.sql === 'COMMIT')).toBe(false)
  })

  it('lists only PHI-free opaque publisher references', async () => {
    const { pool, calls } = mockDirectPool(() =>
      result([
        {
          alert_id: ALERT_ID,
          action_id: ACTION_ID,
          severity: 'emergency',
          escalation_level: 2,
        },
      ]),
    )

    const refs = await service(pool).listDispatchableEmergencyAlertRefs(10)

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
    expect(calls[0].sql).not.toMatch(
      /tenant_id|patient|text_input|instruction_given|contact_channel/i,
    )
    expect(calls[0].sql).toContain(
      "action.status IN ('open', 'attempting_contact', 'failed')",
    )
  })

  it('claims an opaque alert while resolving tenant inside the locked conditional mutation', async () => {
    const { pool, calls } = mockDirectPool(() =>
      result(
        [
          {
            id: ALERT_ID,
            emergency_action_id: ACTION_ID,
            tenant_id: 'tenant-alert',
            triage_session_id: '53000000-0000-4000-8000-000000000001',
            owner_team: 'clinical-triage',
            severity: 'emergency',
            escalation_level: 2,
            lease_token: LEASE_TOKEN,
            attempt_count: 1,
            previous_status: 'pending',
          },
        ],
        1,
      ),
    )

    await expect(
      service(pool).claimEmergencyAlertByRef({
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        workerId: 'publisher-1',
        leaseDurationMs: 60_000,
      }),
    ).resolves.toMatchObject({
      alertId: ALERT_ID,
      actionId: ACTION_ID,
      tenantId: 'tenant-alert',
      leaseToken: LEASE_TOKEN,
      claimKind: 'initial',
    })
    expect(calls[0].values).not.toContain('tenant-alert')
    expect(calls[0].sql).toContain('FOR UPDATE OF alert SKIP LOCKED')
    expect(calls[0].sql).toContain(
      'alert.lease_token IS NOT DISTINCT FROM candidate.previous_lease_token',
    )
    expect(calls[0].sql).toContain(
      "action.status IN ('open', 'attempting_contact', 'failed')",
    )
  })

  it('loads routing context only behind an active lease and active action', async () => {
    const { pool, calls } = mockDirectPool(() =>
      result([
        {
          alert_id: ALERT_ID,
          action_id: ACTION_ID,
          tenant_id: 'tenant-alert',
          triage_session_id: '53000000-0000-4000-8000-000000000001',
          owner_team: 'clinical-triage',
          owner_user_id: 'clinician-1',
          action_status: 'open',
          severity: 'emergency',
          escalation_level: 1,
        },
      ]),
    )

    await expect(
      service(pool).loadClaimedEmergencyAlertContext({
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        leaseToken: LEASE_TOKEN,
      }),
    ).resolves.toEqual({
      alertId: ALERT_ID,
      actionId: ACTION_ID,
      tenantId: 'tenant-alert',
      triageSessionId: '53000000-0000-4000-8000-000000000001',
      ownerTeam: 'clinical-triage',
      ownerUserId: 'clinician-1',
      actionStatus: 'open',
      severity: 'emergency',
      level: 1,
    })
    expect(calls[0].sql).toContain("alert.status = 'leased'")
    expect(calls[0].sql).toContain('alert.lease_token = $3')
    expect(calls[0].sql).toContain('alert.lease_expires_at > $4')
    expect(calls[0].sql).toContain(
      "action.status IN ('open', 'attempting_contact', 'failed')",
    )
  })

  it('rejects a stale sent completion and predicates on action, status, token, and expiry', async () => {
    const { pool, calls } = mockDirectPool(() => result([], 0))

    await expect(
      service(pool).markEmergencyAlertSent({
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        leaseToken: LEASE_TOKEN,
      }),
    ).rejects.toMatchObject({ code: 'stale_or_missing_lease' })
    expect(calls[0].sql).toContain("alert.status = 'leased'")
    expect(calls[0].sql).toContain('alert.lease_token = $3')
    expect(calls[0].sql).toContain('alert.lease_expires_at > $4')
    expect(calls[0].sql).toContain(
      "action.status IN ('open', 'attempting_contact', 'failed')",
    )
  })

  it('sanitizes publisher failures and makes retry exhaustion terminal', async () => {
    const rawSecret =
      'patient-like text with synthetic credential marker DO-NOT-PERSIST'
    const { pool, calls } = mockDirectPool(() =>
      result(
        [
          {
            id: ALERT_ID,
            status: 'terminal_failure',
            attempt_count: 5,
            max_attempts: 5,
          },
        ],
        1,
      ),
    )

    await expect(
      service(pool).failEmergencyAlert({
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        leaseToken: LEASE_TOKEN,
        error: new Error(rawSecret),
        nextRetryAt: new Date('2026-07-11T12:01:00.000Z'),
      }),
    ).resolves.toEqual({ status: 'terminal_failure' })
    expect(calls[0].sql).toContain(
      "WHEN attempt_count >= max_attempts THEN 'terminal_failure'",
    )
    expect(calls[0].sql).toContain(
      'WHEN attempt_count < max_attempts THEN $8',
    )
    const serialized = JSON.stringify(calls[0].values)
    expect(serialized).not.toContain(rawSecret)
    expect(serialized).not.toContain('DO-NOT-PERSIST')
  })

  it('rejects retry timestamps that could create a publisher storm or disappear too long', async () => {
    const { pool, query } = mockDirectPool(() => result())
    const outbox = service(pool)
    const base = {
      alertId: ALERT_ID,
      actionId: ACTION_ID,
      leaseToken: LEASE_TOKEN,
      error: new Error('synthetic publisher failure'),
    }

    await expect(
      outbox.failEmergencyAlert({ ...base, nextRetryAt: NOW }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      outbox.failEmergencyAlert({
        ...base,
        nextRetryAt: new Date('2026-07-11T12:30:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    expect(query).not.toHaveBeenCalled()
  })

  it('exposes terminal publisher failures without tenant or clinical content', async () => {
    const { pool, calls } = mockDirectPool(() =>
      result([
        {
          alert_id: ALERT_ID,
          action_id: ACTION_ID,
          severity: 'emergency',
          escalation_level: 3,
          terminal_failed_at: '2026-07-11T12:00:00.000Z',
        },
      ]),
    )

    await expect(
      service(pool).listTerminalEmergencyAlertFailures(10),
    ).resolves.toEqual([
      {
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        severity: 'emergency',
        level: 3,
      },
    ])
    const terminalRefs = await service(pool).listTerminalEmergencyAlertFailures(10)
    expect(Object.keys(terminalRefs[0]).sort()).toEqual([
      'actionId',
      'alertId',
      'level',
      'severity',
    ])
    expect(calls[0].sql).not.toMatch(
      /tenant_id|patient|text_input|last_error_detail/i,
    )
  })

  it('uses a sanitized service error type for malformed persisted rows', async () => {
    const { pool } = mockDirectPool(() =>
      result([
        {
          alert_id: ALERT_ID,
          action_id: ACTION_ID,
          severity: 'routine',
          escalation_level: 99,
        },
      ]),
    )

    await expect(
      service(pool).listDispatchableEmergencyAlertRefs(10),
    ).rejects.toBeInstanceOf(EmergencyActionAlertOutboxError)
  })
})

describe('sql type safety', () => {
  it('pins the next_attempt_at bind parameter to timestamptz inside the bare CASE...THEN', async () => {
    const { pool, calls } = mockDirectPool(() =>
      result(
        [
          {
            id: ALERT_ID,
            status: 'terminal_failure',
            attempt_count: 5,
            max_attempts: 5,
          },
        ],
        1,
      ),
    )

    await expect(
      service(pool).failEmergencyAlert({
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        leaseToken: LEASE_TOKEN,
        error: new Error('synthetic publisher failure'),
        nextRetryAt: new Date('2026-07-11T12:01:00.000Z'),
      }),
    ).resolves.toEqual({ status: 'terminal_failure' })
    expect(calls[0].sql).toContain('$8::timestamptz')
  })
})
