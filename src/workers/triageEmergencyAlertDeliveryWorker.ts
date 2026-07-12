import { ChangeMessageVisibilityCommand, SQSClient } from '@aws-sdk/client-sqs'
import type { SQSBatchResponse, SQSEvent } from 'aws-lambda'

import { getPool } from '@/lib/db'
import { createPostgresEmergencyAlertNotificationDelivery } from '@/lib/triage/emergencyAlertNotificationDelivery'
import { processEmergencyAlertDeliverySqsEvent } from './triageEmergencyAlertDeliveryWorkerCore'

const DEFAULT_LEASE_SECONDS = 60

function requiredDeliveryQueueUrl(): string {
  const value = process.env.TRIAGE_EMERGENCY_ALERT_DELIVERY_QUEUE_URL?.trim()
  if (!value) throw new Error('Emergency alert delivery queue is not configured.')
  return value
}

function configuredLeaseMs(): number {
  const raw = process.env.TRIAGE_EMERGENCY_ALERT_DELIVERY_LEASE_SECONDS
  if (!raw) return DEFAULT_LEASE_SECONDS * 1_000
  const seconds = Number(raw)
  if (!Number.isSafeInteger(seconds) || seconds < 10 || seconds > 900) {
    throw new Error('Emergency alert delivery lease duration is invalid.')
  }
  return seconds * 1_000
}

export function createTriageEmergencyAlertDeliveryWorkerHandler(
  processor: (event: SQSEvent) => Promise<SQSBatchResponse>,
) {
  return (event: SQSEvent): Promise<SQSBatchResponse> => processor(event)
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const queueUrl = requiredDeliveryQueueUrl()
  const delivery = createPostgresEmergencyAlertNotificationDelivery(
    await getPool(),
  )
  const leaseDurationMs = configuredLeaseMs()
  const sqs = new SQSClient({
    region: process.env.AWS_REGION || 'us-east-2',
  })
  return processEmergencyAlertDeliverySqsEvent(event, {
    claim: (message) =>
      delivery.claimCriticalUiDelivery({
        alertId: message.alert_id,
        actionId: message.action_id,
        severity: message.severity,
        level: message.level,
        workerId:
          process.env.AWS_LAMBDA_LOG_STREAM_NAME ||
          'emergency-alert-delivery-worker',
        leaseDurationMs,
      }),
    deliver: (claim) => delivery.deliverCriticalUiNotification(claim),
    fail: (claim, cause, nextRetryAt) =>
      delivery.failCriticalUiDelivery({
        alertId: claim.alertId,
        actionId: claim.actionId,
        leaseToken: claim.leaseToken,
        error: cause,
        nextRetryAt,
      }),
    defer: async (record, retryAfterSeconds) => {
      if (!record.receiptHandle) {
        throw new Error('Emergency alert delivery receipt handle is missing.')
      }
      await sqs.send(
        new ChangeMessageVisibilityCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: record.receiptHandle,
          VisibilityTimeout: Math.max(
            1,
            Math.min(900, Math.ceil(retryAfterSeconds)),
          ),
        }),
      )
    },
    terminalFailure: () => {
      // Deliberately omit alert/action/tenant identifiers and error details.
      console.error(
        JSON.stringify({
          event: 'triage_emergency_alert_delivery_terminal_failure',
          severity: 'emergency',
        }),
      )
    },
  })
}
