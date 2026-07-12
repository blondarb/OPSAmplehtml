import { SendMessageBatchCommand, SQSClient } from '@aws-sdk/client-sqs'

import { getPool } from '@/lib/db'
import { createPostgresEmergencyAlertNotificationDelivery } from '@/lib/triage/emergencyAlertNotificationDelivery'
import {
  dispatchEmergencyActionAlerts,
  type EmergencyAlertDispatchEntry,
  type EmergencyAlertDispatchSummary,
} from './triageEmergencyAlertDispatcherCore'
import { parseEmergencyAlertMessage } from './triageEmergencyAlertMessage'

const DEFAULT_DISPATCH_LIMIT = 500

export interface EmergencyAlertDeliveryDispatcherDependencies {
  listRecoverable: (limit: number) => Promise<
    Array<{
      alertId: string
      actionId: string
      severity: 'emergency'
      level: 0 | 1 | 2 | 3
    }>
  >
  sendBatch: (
    entries: EmergencyAlertDispatchEntry[],
  ) => Promise<{ failedEntryIds: string[] }>
}

function requiredQueueUrl(): string {
  const value = process.env.TRIAGE_EMERGENCY_ALERT_DELIVERY_QUEUE_URL?.trim()
  if (!value) throw new Error('Emergency alert delivery queue is not configured.')
  return value
}

function configuredLimit(): number {
  const raw = process.env.TRIAGE_EMERGENCY_ALERT_DELIVERY_DISPATCH_LIMIT
  if (!raw) return DEFAULT_DISPATCH_LIMIT
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1_000) {
    throw new Error('Emergency alert delivery dispatch limit is invalid.')
  }
  return parsed
}

export function buildEmergencyAlertDeliveryFifoEntry(
  entry: EmergencyAlertDispatchEntry,
) {
  const message = parseEmergencyAlertMessage(entry.body)
  if (entry.id.toLowerCase() !== message.alert_id) {
    throw new Error('Emergency alert delivery batch binding is invalid.')
  }
  return {
    Id: entry.id,
    MessageBody: entry.body,
    MessageGroupId: message.action_id,
    MessageDeduplicationId: message.alert_id,
  }
}

export function createTriageEmergencyAlertDeliveryDispatcherHandler(
  dependencies: EmergencyAlertDeliveryDispatcherDependencies,
  limit = DEFAULT_DISPATCH_LIMIT,
) {
  return async (): Promise<EmergencyAlertDispatchSummary> => {
    const summary = await dispatchEmergencyActionAlerts(
      {
        enqueueDueReminders: async () => [],
        listDispatchableAlerts: dependencies.listRecoverable,
        sendBatch: dependencies.sendBatch,
      },
      limit,
    )
    console.info(
      JSON.stringify({
        event: 'triage_emergency_alert_delivery_recovery_completed',
        discovered: summary.discovered,
        enqueued: summary.enqueued,
        batch_count: summary.batchCount,
      }),
    )
    return summary
  }
}

export async function handler(): Promise<EmergencyAlertDispatchSummary> {
  const queueUrl = requiredQueueUrl()
  const delivery = createPostgresEmergencyAlertNotificationDelivery(
    await getPool(),
  )
  const sqs = new SQSClient({
    region: process.env.AWS_REGION || 'us-east-2',
  })
  return createTriageEmergencyAlertDeliveryDispatcherHandler(
    {
      listRecoverable: (limit) =>
        delivery.listRecoverableCriticalUiDeliveryRefs(limit),
      sendBatch: async (entries) => {
        const response = await sqs.send(
          new SendMessageBatchCommand({
            QueueUrl: queueUrl,
            Entries: entries.map(buildEmergencyAlertDeliveryFifoEntry),
          }),
        )
        return {
          failedEntryIds: (response.Failed ?? []).flatMap((failure) =>
            failure.Id ? [failure.Id] : [],
          ),
        }
      },
    },
    configuredLimit(),
  )()
}
