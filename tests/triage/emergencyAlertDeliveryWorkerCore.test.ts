import type { SQSEvent, SQSRecord } from 'aws-lambda'
import { describe, expect, it, vi } from 'vitest'

import { serializeEmergencyAlertMessage } from '@/workers/triageEmergencyAlertMessage'
import {
  emergencyAlertDeliveryNextRetryAt,
  processEmergencyAlertDeliverySqsEvent,
  type ClaimedEmergencyAlertDelivery,
} from '@/workers/triageEmergencyAlertDeliveryWorkerCore'

const ALERT_ID = '54000000-0000-4000-8000-000000000201'
const ACTION_ID = '54000000-0000-4000-8000-000000000101'

function record(
  body = serializeEmergencyAlertMessage({
    alertId: ALERT_ID,
    actionId: ACTION_ID,
    severity: 'emergency',
    level: 2,
  }),
  messageId = 'delivery-message-1',
): SQSRecord {
  return { body, messageId } as SQSRecord
}

function claim(): ClaimedEmergencyAlertDelivery {
  return {
    alertId: ALERT_ID,
    actionId: ACTION_ID,
    severity: 'emergency',
    level: 2,
    leaseToken: '54000000-0000-4000-8000-000000000301',
    attemptCount: 1,
    tenantId: 'tenant-alert',
    triageSessionId: '54000000-0000-4000-8000-000000000001',
    ownerTeam: 'clinical-triage',
    ownerUserId: 'clinician-1',
  }
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    claim: vi.fn(async () => ({ kind: 'claimed' as const, claim: claim() })),
    deliver: vi.fn(async () => ({ status: 'delivered' as const })),
    fail: vi.fn(async () => ({ status: 'failed' as const })),
    defer: vi.fn(async () => undefined),
    terminalFailure: vi.fn(),
    now: () => new Date('2026-07-11T12:00:00.000Z'),
    ...overrides,
  }
}

describe('emergency alert critical-UI delivery worker core', () => {
  it('delivers only after a database claim and then acknowledges SQS', async () => {
    const deps = dependencies()

    await expect(
      processEmergencyAlertDeliverySqsEvent(
        { Records: [record()] } as SQSEvent,
        deps,
      ),
    ).resolves.toEqual({ batchItemFailures: [] })
    expect(deps.deliver).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: ALERT_ID, tenantId: 'tenant-alert' }),
    )
    expect(deps.claim).toHaveBeenCalledBefore(deps.deliver)
  })

  it('acknowledges already delivered, verified suppression, and invalid opaque references', async () => {
    for (const outcome of ['delivered', 'suppressed', 'invalid'] as const) {
      const deps = dependencies({
        claim: vi.fn(async () => ({
          kind: 'acknowledge' as const,
          outcome,
        })),
      })

      await expect(
        processEmergencyAlertDeliverySqsEvent(
          { Records: [record()] } as SQSEvent,
          deps,
        ),
      ).resolves.toEqual({ batchItemFailures: [] })
      expect(deps.deliver).not.toHaveBeenCalled()
    }
  })

  it('does not acknowledge publisher races, active leases, or retry delays', async () => {
    const deps = dependencies({
      claim: vi.fn(async () => ({
        kind: 'retry' as const,
        retryAfterSeconds: 5,
      })),
    })

    await expect(
      processEmergencyAlertDeliverySqsEvent(
        { Records: [record()] } as SQSEvent,
        deps,
      ),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'delivery-message-1' }],
    })
    expect(deps.defer).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'delivery-message-1' }),
      5,
    )
  })

  it('persists retryable failure and returns the SQS item for retry', async () => {
    const deliveryError = new Error('synthetic database notification failure')
    const deps = dependencies({
      deliver: vi.fn(async () => {
        throw deliveryError
      }),
    })

    const response = await processEmergencyAlertDeliverySqsEvent(
      { Records: [record()] } as SQSEvent,
      deps,
    )

    expect(deps.fail).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: ALERT_ID }),
      deliveryError,
      new Date('2026-07-11T12:00:30.000Z'),
    )
    expect(response.batchItemFailures).toEqual([
      { itemIdentifier: 'delivery-message-1' },
    ])
    expect(deps.defer).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'delivery-message-1' }),
      30,
    )
  })

  it('acknowledges and emits a countable signal only after terminal failure is durable', async () => {
    const deps = dependencies({
      deliver: vi.fn(async () => {
        throw new Error('synthetic repeated failure')
      }),
      fail: vi.fn(async () => ({ status: 'terminal_failure' as const })),
    })

    await expect(
      processEmergencyAlertDeliverySqsEvent(
        { Records: [record()] } as SQSEvent,
        deps,
      ),
    ).resolves.toEqual({ batchItemFailures: [] })
    expect(deps.terminalFailure).toHaveBeenCalledOnce()
  })

  it('does not acknowledge malformed messages or uncertain failure persistence', async () => {
    const uncertain = dependencies({
      deliver: vi.fn(async () => {
        throw new Error('synthetic delivery failure')
      }),
      fail: vi.fn(async () => {
        throw new Error('database unavailable')
      }),
    })

    const response = await processEmergencyAlertDeliverySqsEvent(
      {
        Records: [
          record(undefined, 'uncertain'),
          record('contains clinical text', 'malformed'),
        ],
      } as SQSEvent,
      uncertain,
    )

    expect(response.batchItemFailures).toEqual([
      { itemIdentifier: 'uncertain' },
      { itemIdentifier: 'malformed' },
    ])
  })

  it('stops after the first FIFO failure and returns later records unprocessed', async () => {
    const deps = dependencies()
    const later = record(
      serializeEmergencyAlertMessage({
        alertId: '54000000-0000-4000-8000-000000000202',
        actionId: ACTION_ID,
        severity: 'emergency',
        level: 3,
      }),
      'later-fifo-record',
    )

    const response = await processEmergencyAlertDeliverySqsEvent(
      {
        Records: [record('malformed', 'first-failure'), later],
      } as SQSEvent,
      deps,
    )

    expect(response.batchItemFailures).toEqual([
      { itemIdentifier: 'first-failure' },
      { itemIdentifier: 'later-fifo-record' },
    ])
    expect(deps.claim).not.toHaveBeenCalled()
    expect(deps.deliver).not.toHaveBeenCalled()
  })

  it('rejects a claim whose alert binding differs from the opaque message', async () => {
    const deps = dependencies({
      claim: vi.fn(async () => ({
        kind: 'claimed' as const,
        claim: { ...claim(), level: 3 as const },
      })),
    })

    const response = await processEmergencyAlertDeliverySqsEvent(
      { Records: [record()] } as SQSEvent,
      deps,
    )

    expect(deps.deliver).not.toHaveBeenCalled()
    expect(deps.fail).toHaveBeenCalledOnce()
    expect(response.batchItemFailures).toEqual([
      { itemIdentifier: 'delivery-message-1' },
    ])
  })

  it('caps critical-UI delivery retry backoff at fifteen minutes', () => {
    const now = new Date('2026-07-11T12:00:00.000Z')
    expect(emergencyAlertDeliveryNextRetryAt(1, now)).toEqual(
      new Date('2026-07-11T12:00:30.000Z'),
    )
    expect(emergencyAlertDeliveryNextRetryAt(10, now)).toEqual(
      new Date('2026-07-11T12:15:00.000Z'),
    )
  })
})
