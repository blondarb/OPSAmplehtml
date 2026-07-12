import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import type { SQSBatchResponse, SQSEvent } from 'aws-lambda'

import { getPool } from '@/lib/db'
import { createPostgresEmergencyActionAlertOutbox } from '@/lib/triage/emergencyActionAlertOutbox'
import { serializeEmergencyAlertMessage } from './triageEmergencyAlertMessage'
import {
  processEmergencyAlertSqsEvent,
  type EmergencyAlertPublisherDependencies,
} from './triageEmergencyAlertWorkerCore'

const DEFAULT_LEASE_SECONDS = 120

function requiredDeliveryQueueUrl(): string {
  const value = process.env.TRIAGE_EMERGENCY_ALERT_DELIVERY_QUEUE_URL?.trim()
  if (!value) throw new Error('Emergency alert delivery queue is not configured.')
  return value
}

function configuredLeaseMs(): number {
  const raw = process.env.TRIAGE_EMERGENCY_ALERT_LEASE_SECONDS
  if (!raw) return DEFAULT_LEASE_SECONDS * 1_000
  const seconds = Number(raw)
  if (!Number.isSafeInteger(seconds) || seconds < 10 || seconds > 900) {
    throw new Error('Emergency alert lease duration is invalid.')
  }
  return seconds * 1_000
}

export function createTriageEmergencyAlertWorkerHandler<
  Claim extends {
    alertId: string
    actionId: string
    severity: 'emergency'
    level: 0 | 1 | 2 | 3
    leaseToken: string
    attemptCount: number
  },
  Context,
>(dependencies: EmergencyAlertPublisherDependencies<Claim, Context>) {
  return (event: SQSEvent): Promise<SQSBatchResponse> =>
    processEmergencyAlertSqsEvent(event, dependencies)
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const deliveryQueueUrl = requiredDeliveryQueueUrl()
  const leaseDurationMs = configuredLeaseMs()
  const outbox = createPostgresEmergencyActionAlertOutbox(await getPool())
  const sqs = new SQSClient({
    region: process.env.AWS_REGION || 'us-east-2',
  })

  return createTriageEmergencyAlertWorkerHandler({
    claim: (message) =>
      outbox.claimEmergencyAlertByRef({
        alertId: message.alert_id,
        actionId: message.action_id,
        workerId: process.env.AWS_LAMBDA_LOG_STREAM_NAME || 'emergency-alert-worker',
        leaseDurationMs,
      }),
    loadContext: (claim) =>
      outbox.loadClaimedEmergencyAlertContext({
        alertId: claim.alertId,
        actionId: claim.actionId,
        leaseToken: claim.leaseToken,
      }),
    publish: async ({ claim }) => {
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: deliveryQueueUrl,
          MessageBody: serializeEmergencyAlertMessage(claim),
          MessageGroupId: claim.actionId,
          MessageDeduplicationId: claim.alertId,
        }),
      )
    },
    markSent: (claim) =>
      outbox.markEmergencyAlertSent({
        alertId: claim.alertId,
        actionId: claim.actionId,
        leaseToken: claim.leaseToken,
      }),
    fail: async (claim, error, nextRetryAt) => {
      const outcome = await outbox.failEmergencyAlert({
        alertId: claim.alertId,
        actionId: claim.actionId,
        leaseToken: claim.leaseToken,
        error,
        nextRetryAt,
      })
      if (outcome.status === 'terminal_failure') {
        // Deliberately omit alert/action/tenant identifiers and error detail.
        console.error(
          JSON.stringify({
            event: 'triage_emergency_alert_terminal_failure',
            severity: 'emergency',
            level: claim.level,
          }),
        )
      }
    },
  })(event)
}
