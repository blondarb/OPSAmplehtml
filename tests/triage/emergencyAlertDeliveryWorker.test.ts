import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { SQSEvent } from 'aws-lambda'
import { describe, expect, it, vi } from 'vitest'

import { createTriageEmergencyAlertDeliveryWorkerHandler } from '@/workers/triageEmergencyAlertDeliveryWorker'

describe('emergency alert critical-UI delivery handler', () => {
  it('delegates to the durable delivery service without a best-effort notification helper', async () => {
    const process = vi.fn(async () => ({ batchItemFailures: [] }))
    const handler = createTriageEmergencyAlertDeliveryWorkerHandler(process)
    const event = { Records: [] } as SQSEvent

    await expect(handler(event)).resolves.toEqual({ batchItemFailures: [] })
    expect(process).toHaveBeenCalledWith(event)
  })

  it('uses the transactional delivery service instead of the non-throwing notification helper', () => {
    const worker = readFileSync(
      resolve(
        process.cwd(),
        'src/workers/triageEmergencyAlertDeliveryWorker.ts',
      ),
      'utf8',
    )
    const delivery = readFileSync(
      resolve(
        process.cwd(),
        'src/lib/triage/emergencyAlertNotificationDelivery.ts',
      ),
      'utf8',
    )

    expect(worker).not.toContain("from '@/lib/notifications'")
    expect(delivery).not.toContain("from '@/lib/notifications'")
    expect(delivery).toContain('INSERT INTO notifications')
    expect(delivery).toContain("'critical'")
    expect(delivery).toContain('source_id')
    expect(delivery).toContain('immutable alert ID')
    expect(delivery).toContain('FOR UPDATE OF action')
    expect(delivery).toContain('FOR UPDATE OF delivery')
    expect(worker).toContain('ChangeMessageVisibilityCommand')
  })
})
