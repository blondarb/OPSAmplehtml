import { describe, expect, it, vi } from 'vitest'

import {
  buildEmergencyAlertDeliveryFifoEntry,
  createTriageEmergencyAlertDeliveryDispatcherHandler,
} from '@/workers/triageEmergencyAlertDeliveryDispatcher'
import { serializeEmergencyAlertMessage } from '@/workers/triageEmergencyAlertMessage'

const ALERT_ID = '55000000-0000-4000-8000-000000000201'
const ACTION_ID = '55000000-0000-4000-8000-000000000101'

function ref(index = 0) {
  return {
    alertId:
      index === 0
        ? ALERT_ID
        : `55000000-0000-4000-8000-${String(201 + index).padStart(12, '0')}`,
    actionId: ACTION_ID,
    severity: 'emergency' as const,
    level: Math.min(3, index) as 0 | 1 | 2 | 3,
  }
}

describe('emergency alert delivery recovery dispatcher', () => {
  it('builds an exact opaque FIFO entry keyed by action and alert IDs', () => {
    const body = serializeEmergencyAlertMessage(ref())

    expect(
      buildEmergencyAlertDeliveryFifoEntry({ id: ALERT_ID, body }),
    ).toEqual({
      Id: ALERT_ID,
      MessageBody: body,
      MessageGroupId: ACTION_ID,
      MessageDeduplicationId: ALERT_ID,
    })
    expect(body).not.toMatch(/tenant|patient|text|instruction|contact/i)
  })

  it('re-enqueues due or expired database delivery rows in bounded batches', async () => {
    const listRecoverable = vi.fn(async () =>
      Array.from({ length: 12 }, (_, index) => ref(index)),
    )
    const sendBatch = vi.fn(async () => ({ failedEntryIds: [] }))
    const handler = createTriageEmergencyAlertDeliveryDispatcherHandler({
      listRecoverable,
      sendBatch,
    })

    await expect(handler()).resolves.toEqual({
      remindersCreated: 0,
      discovered: 12,
      enqueued: 12,
      batchCount: 2,
    })
    expect(listRecoverable).toHaveBeenCalledWith(500)
    expect(sendBatch.mock.calls.map(([entries]) => entries.length)).toEqual([
      10, 2,
    ])
  })

  it('rejects an entry whose batch ID is not the serialized alert ID', () => {
    expect(() =>
      buildEmergencyAlertDeliveryFifoEntry({
        id: '55000000-0000-4000-8000-000000000299',
        body: serializeEmergencyAlertMessage(ref()),
      }),
    ).toThrow('binding is invalid')
  })
})
