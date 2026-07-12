import type { SQSEvent, SQSRecord } from 'aws-lambda'
import { describe, expect, it, vi } from 'vitest'

import { createTriageEmergencyAlertWorkerHandler } from '@/workers/triageEmergencyAlertWorker'
import { serializeEmergencyAlertMessage } from '@/workers/triageEmergencyAlertMessage'

const ALERT_ID = '53000000-0000-4000-8000-000000000201'
const ACTION_ID = '53000000-0000-4000-8000-000000000101'

describe('emergency alert publisher handler', () => {
  it('passes the opaque alert through the durable claim and delivery adapter', async () => {
    const body = serializeEmergencyAlertMessage({
      alertId: ALERT_ID,
      actionId: ACTION_ID,
      severity: 'emergency',
      level: 2,
    })
    const event = {
      Records: [{ body, messageId: 'message-1' } as SQSRecord],
    } as SQSEvent
    const publish = vi.fn(async () => undefined)
    const markSent = vi.fn(async () => undefined)
    const handler = createTriageEmergencyAlertWorkerHandler({
      claim: async () => ({
        alertId: ALERT_ID,
        actionId: ACTION_ID,
        severity: 'emergency',
        level: 2,
        leaseToken: 'lease-1',
        attemptCount: 1,
      }),
      loadContext: async () => ({ tenantId: 'tenant-alert' }),
      publish,
      markSent,
      fail: async () => undefined,
    })

    await expect(handler(event)).resolves.toEqual({ batchItemFailures: [] })
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: ALERT_ID }),
    )
    expect(markSent).toHaveBeenCalledOnce()
  })
})
