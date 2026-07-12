import { describe, expect, it, vi } from 'vitest'

import { createTriageEmergencyAlertDispatcherHandler } from '@/workers/triageEmergencyAlertDispatcher'

describe('emergency alert scheduled dispatcher handler', () => {
  it('logs counts only after a successful bounded dispatch', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const item = {
      alertId: '53000000-0000-4000-8000-000000000201',
      actionId: '53000000-0000-4000-8000-000000000101',
      severity: 'emergency' as const,
      level: 1 as const,
    }
    const handler = createTriageEmergencyAlertDispatcherHandler({
      enqueueDueReminders: async () => [item],
      listDispatchableAlerts: async () => [item],
      sendBatch: async () => ({ failedEntryIds: [] }),
    })

    await expect(handler()).resolves.toEqual({
      remindersCreated: 1,
      discovered: 1,
      enqueued: 1,
      batchCount: 1,
    })
    expect(info).toHaveBeenCalledOnce()
    const logged = String(info.mock.calls[0][0])
    expect(logged).toContain('triage_emergency_alert_dispatch_completed')
    expect(logged).not.toMatch(/53000000|tenant|patient|message_body/i)
    info.mockRestore()
  })
})
