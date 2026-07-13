import type { SQSEvent, SQSRecord } from 'aws-lambda'
import { describe, expect, it, vi } from 'vitest'

import {
  emergencyAlertNextRetryAt,
  processEmergencyAlertSqsEvent,
  type ClaimedEmergencyAlertWork,
} from '@/workers/triageEmergencyAlertWorkerCore'
import { serializeEmergencyAlertMessage } from '@/workers/triageEmergencyAlertMessage'

const ALERT_ID = '53000000-0000-4000-8000-000000000201'
const ACTION_ID = '53000000-0000-4000-8000-000000000101'

function record(
  body = serializeEmergencyAlertMessage({
    alertId: ALERT_ID,
    actionId: ACTION_ID,
    severity: 'emergency',
    level: 1,
  }),
  messageId = 'sqs-alert-1',
): SQSRecord {
  return { body, messageId } as SQSRecord
}

function event(...records: SQSRecord[]): SQSEvent {
  return { Records: records }
}

function claim(
  overrides: Partial<ClaimedEmergencyAlertWork> = {},
): ClaimedEmergencyAlertWork {
  return {
    alertId: ALERT_ID,
    actionId: ACTION_ID,
    severity: 'emergency',
    level: 1,
    leaseToken: 'lease-token-1',
    attemptCount: 1,
    ...overrides,
  }
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    claim: vi.fn(async () => claim()),
    loadContext: vi.fn(async () => ({
      tenantId: 'tenant-alert',
      ownerTeam: 'clinical-triage',
    })),
    publish: vi.fn(async () => undefined),
    markSent: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
    now: () => new Date('2026-07-11T12:00:00.000Z'),
    ...overrides,
  }
}

describe('emergency alert SQS publisher core', () => {
  it('claims, reloads active context, publishes idempotently, then marks sent before acknowledgment', async () => {
    const deps = dependencies()

    await expect(
      processEmergencyAlertSqsEvent(event(record()), deps),
    ).resolves.toEqual({ batchItemFailures: [] })
    expect(deps.publish).toHaveBeenCalledWith({
      claim: expect.objectContaining({ alertId: ALERT_ID }),
      context: { tenantId: 'tenant-alert', ownerTeam: 'clinical-triage' },
      idempotencyKey: ALERT_ID,
    })
    expect(deps.loadContext).toHaveBeenCalledBefore(deps.publish)
    expect(deps.publish).toHaveBeenCalledBefore(deps.markSent)
    expect(deps.fail).not.toHaveBeenCalled()
  })

  it('acknowledges duplicate or resolved work that the database declines to lease', async () => {
    const deps = dependencies({ claim: vi.fn(async () => null) })

    const response = await processEmergencyAlertSqsEvent(event(record()), deps)

    expect(response.batchItemFailures).toEqual([])
    expect(deps.loadContext).not.toHaveBeenCalled()
    expect(deps.publish).not.toHaveBeenCalled()
  })

  it('acknowledges verified suppression detected as a stale lease before delivery', async () => {
    const stale = Object.assign(new Error('suppressed'), {
      code: 'stale_or_missing_lease',
    })
    const deps = dependencies({
      loadContext: vi.fn(async () => {
        throw stale
      }),
    })

    const response = await processEmergencyAlertSqsEvent(event(record()), deps)

    expect(response.batchItemFailures).toEqual([])
    expect(deps.publish).not.toHaveBeenCalled()
    expect(deps.fail).not.toHaveBeenCalled()
  })

  it('persists provider failure with bounded backoff and then acknowledges SQS', async () => {
    const providerError = new Error('synthetic provider timeout')
    const deps = dependencies({
      claim: vi.fn(async () => claim({ attemptCount: 2 })),
      publish: vi.fn(async () => {
        throw providerError
      }),
    })

    const response = await processEmergencyAlertSqsEvent(event(record()), deps)

    expect(response.batchItemFailures).toEqual([])
    expect(deps.fail).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: ALERT_ID }),
      providerError,
      new Date('2026-07-11T12:01:00.000Z'),
    )
    expect(deps.markSent).not.toHaveBeenCalled()
  })

  it('does not acknowledge when failure persistence is uncertain', async () => {
    const deps = dependencies({
      publish: vi.fn(async () => {
        throw new Error('synthetic provider failure')
      }),
      fail: vi.fn(async () => {
        throw new Error('database unavailable')
      }),
    })

    const response = await processEmergencyAlertSqsEvent(event(record()), deps)

    expect(response.batchItemFailures).toEqual([
      { itemIdentifier: 'sqs-alert-1' },
    ])
  })

  it('does not acknowledge an uncertain sent-state write after provider success', async () => {
    const deps = dependencies({
      markSent: vi.fn(async () => {
        throw new Error('database unavailable')
      }),
    })

    const response = await processEmergencyAlertSqsEvent(event(record()), deps)

    expect(deps.publish).toHaveBeenCalledOnce()
    expect(response.batchItemFailures).toEqual([
      { itemIdentifier: 'sqs-alert-1' },
    ])
  })

  it('acknowledges a stale sent-state write caused by concurrent verified handoff', async () => {
    const stale = Object.assign(new Error('suppressed'), {
      code: 'stale_or_missing_lease',
    })
    const deps = dependencies({
      markSent: vi.fn(async () => {
        throw stale
      }),
    })

    const response = await processEmergencyAlertSqsEvent(event(record()), deps)

    expect(response.batchItemFailures).toEqual([])
  })

  it('fails a mismatched claimed binding without publishing', async () => {
    const deps = dependencies({
      claim: vi.fn(async () =>
        claim({ actionId: '53000000-0000-4000-8000-000000000999' }),
      ),
    })

    const response = await processEmergencyAlertSqsEvent(event(record()), deps)

    expect(response.batchItemFailures).toEqual([])
    expect(deps.publish).not.toHaveBeenCalled()
    expect(deps.fail).toHaveBeenCalledOnce()
  })

  it('returns only malformed or database-uncertain records as SQS batch failures', async () => {
    const deps = dependencies({
      claim: vi.fn(async (message: { alert_id: string }) => {
        if (message.alert_id !== ALERT_ID) throw new Error('database unavailable')
        return claim()
      }),
    })
    const otherAlert = '53000000-0000-4000-8000-000000000202'
    const other = record(
      serializeEmergencyAlertMessage({
        alertId: otherAlert,
        actionId: ACTION_ID,
        severity: 'emergency',
        level: 1,
      }),
      'db-fail',
    )

    const response = await processEmergencyAlertSqsEvent(
      event(record('contains clinical text', 'invalid'), other),
      deps,
    )

    expect(response.batchItemFailures).toEqual([
      { itemIdentifier: 'invalid' },
      { itemIdentifier: 'db-fail' },
    ])
  })

  it('caps publisher retry backoff at fifteen minutes', () => {
    const now = new Date('2026-07-11T12:00:00.000Z')
    expect(emergencyAlertNextRetryAt(1, now)).toEqual(
      new Date('2026-07-11T12:00:30.000Z'),
    )
    expect(emergencyAlertNextRetryAt(10, now)).toEqual(
      new Date('2026-07-11T12:15:00.000Z'),
    )
  })
})
