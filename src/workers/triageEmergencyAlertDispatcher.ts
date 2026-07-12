import { SendMessageBatchCommand, SQSClient } from '@aws-sdk/client-sqs'

import { getPool } from '@/lib/db'
import { createPostgresEmergencyActionAlertOutbox } from '@/lib/triage/emergencyActionAlertOutbox'
import {
  dispatchEmergencyActionAlerts,
  type EmergencyAlertDispatcherDependencies,
  type EmergencyAlertDispatchSummary,
} from './triageEmergencyAlertDispatcherCore'

const DEFAULT_DISPATCH_LIMIT = 500

function requiredQueueUrl(): string {
  const value = process.env.TRIAGE_EMERGENCY_ALERT_WORK_QUEUE_URL?.trim()
  if (!value) throw new Error('Emergency alert work queue is not configured.')
  return value
}

function configuredLimit(): number {
  const raw = process.env.TRIAGE_EMERGENCY_ALERT_DISPATCH_LIMIT
  if (!raw) return DEFAULT_DISPATCH_LIMIT
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1_000) {
    throw new Error('Emergency alert dispatch limit is invalid.')
  }
  return parsed
}

export function createTriageEmergencyAlertDispatcherHandler(
  dependencies: EmergencyAlertDispatcherDependencies,
  limit = DEFAULT_DISPATCH_LIMIT,
) {
  return async (): Promise<EmergencyAlertDispatchSummary> => {
    const summary = await dispatchEmergencyActionAlerts(dependencies, limit)
    console.info(
      JSON.stringify({
        event: 'triage_emergency_alert_dispatch_completed',
        reminders_created: summary.remindersCreated,
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
  const outbox = createPostgresEmergencyActionAlertOutbox(await getPool())
  const sqs = new SQSClient({
    region: process.env.AWS_REGION || 'us-east-2',
  })
  return createTriageEmergencyAlertDispatcherHandler(
    {
      enqueueDueReminders: (limit) =>
        outbox.enqueueDueEmergencyActionReminders(limit),
      listDispatchableAlerts: (limit) =>
        outbox.listDispatchableEmergencyAlertRefs(limit),
      sendBatch: async (entries) => {
        const response = await sqs.send(
          new SendMessageBatchCommand({
            QueueUrl: queueUrl,
            Entries: entries.map((entry) => ({
              Id: entry.id,
              MessageBody: entry.body,
            })),
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
