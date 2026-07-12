import { describe, expect, it, vi } from 'vitest'

import {
  dispatchEmergencyActionAlerts,
  EmergencyAlertDispatchError,
} from '@/workers/triageEmergencyAlertDispatcherCore'
import { parseEmergencyAlertMessage } from '@/workers/triageEmergencyAlertMessage'

function uuid(prefix: 'alert' | 'action', index: number): string {
  const base = prefix === 'alert' ? 200 : 100
  return `53000000-0000-4000-8000-${String(base + index).padStart(12, '0')}`
}

function ref(index: number, level = Math.min(3, index % 4)) {
  return {
    alertId: uuid('alert', index),
    actionId: uuid('action', index),
    severity: 'emergency' as const,
    level: level as 0 | 1 | 2 | 3,
  }
}

describe('emergency alert scheduled dispatcher core', () => {
  it('materializes due reminders before sending opaque ten-entry batches', async () => {
    const enqueueDueReminders = vi.fn(async () => [ref(24, 3)])
    const listDispatchableAlerts = vi.fn(async () =>
      Array.from({ length: 23 }, (_, index) => ref(index + 1)),
    )
    const sendBatch = vi.fn(async () => ({ failedEntryIds: [] }))

    await expect(
      dispatchEmergencyActionAlerts({
        enqueueDueReminders,
        listDispatchableAlerts,
        sendBatch,
      }),
    ).resolves.toEqual({
      remindersCreated: 1,
      discovered: 23,
      enqueued: 23,
      batchCount: 3,
    })
    expect(enqueueDueReminders).toHaveBeenCalledBefore(listDispatchableAlerts)
    expect(sendBatch.mock.calls.map(([entries]) => entries.length)).toEqual([
      10, 10, 3,
    ])
    for (const [entries] of sendBatch.mock.calls) {
      for (const entry of entries) {
        expect(parseEmergencyAlertMessage(entry.body)).toMatchObject({
          severity: 'emergency',
        })
        expect(entry.body).not.toMatch(
          /tenant|patient|source|text|instruction|contact/i,
        )
      }
    }
  })

  it('deduplicates sweep results by opaque alert and action identity', async () => {
    const item = ref(1)
    const sendBatch = vi.fn(async () => ({ failedEntryIds: [] }))

    const summary = await dispatchEmergencyActionAlerts({
      enqueueDueReminders: async () => [],
      listDispatchableAlerts: async () => [item, item],
      sendBatch,
    })

    expect(summary.discovered).toBe(1)
    expect(sendBatch.mock.calls[0][0]).toHaveLength(1)
  })

  it('fails the scheduled invocation on a partial SQS batch response', async () => {
    await expect(
      dispatchEmergencyActionAlerts({
        enqueueDueReminders: async () => [],
        listDispatchableAlerts: async () => [ref(1), ref(2)],
        sendBatch: async (entries) => ({
          failedEntryIds: [entries[1].id],
        }),
      }),
    ).rejects.toThrow(EmergencyAlertDispatchError)
  })

  it('does no queue work when there is nothing dispatchable', async () => {
    const sendBatch = vi.fn()
    await expect(
      dispatchEmergencyActionAlerts({
        enqueueDueReminders: async () => [],
        listDispatchableAlerts: async () => [],
        sendBatch,
      }),
    ).resolves.toEqual({
      remindersCreated: 0,
      discovered: 0,
      enqueued: 0,
      batchCount: 0,
    })
    expect(sendBatch).not.toHaveBeenCalled()
  })
})
