import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda'

import {
  parseEmergencyAlertMessage,
  type EmergencyAlertMessage,
} from './triageEmergencyAlertMessage'

export interface ClaimedEmergencyAlertWork {
  alertId: string
  actionId: string
  severity: 'emergency'
  level: 0 | 1 | 2 | 3
  leaseToken: string
  attemptCount: number
}

export interface EmergencyAlertPublisherDependencies<
  Claim extends ClaimedEmergencyAlertWork = ClaimedEmergencyAlertWork,
  Context = unknown,
> {
  claim: (message: EmergencyAlertMessage) => Promise<Claim | null>
  loadContext: (claim: Claim) => Promise<Context>
  publish: (input: {
    claim: Claim
    context: Context
    idempotencyKey: string
  }) => Promise<void>
  markSent: (claim: Claim) => Promise<void>
  fail: (claim: Claim, error: unknown, nextRetryAt: Date) => Promise<void>
  now?: () => Date
}

export function emergencyAlertNextRetryAt(
  attemptCount: number,
  now: Date,
): Date {
  const normalizedAttempt = Number.isSafeInteger(attemptCount)
    ? Math.max(1, Math.min(attemptCount, 10))
    : 1
  const delayMs = Math.min(
    15 * 60_000,
    30_000 * 2 ** (normalizedAttempt - 1),
  )
  return new Date(now.getTime() + delayMs)
}

function staleLease(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'stale_or_missing_lease'
  )
}

function bindingMatches(
  claim: ClaimedEmergencyAlertWork,
  message: EmergencyAlertMessage,
): boolean {
  return (
    claim.alertId.toLowerCase() === message.alert_id &&
    claim.actionId.toLowerCase() === message.action_id &&
    claim.severity === message.severity &&
    claim.level === message.level
  )
}

async function persistFailure<Claim extends ClaimedEmergencyAlertWork>(
  claim: Claim,
  error: unknown,
  dependencies: EmergencyAlertPublisherDependencies<Claim, unknown>,
): Promise<boolean> {
  try {
    const observedAt = (dependencies.now ?? (() => new Date()))()
    await dependencies.fail(
      claim,
      error,
      emergencyAlertNextRetryAt(claim.attemptCount, observedAt),
    )
    return true
  } catch (failureError) {
    return staleLease(failureError)
  }
}

async function processRecord<
  Claim extends ClaimedEmergencyAlertWork,
  Context,
>(
  record: SQSRecord,
  dependencies: EmergencyAlertPublisherDependencies<Claim, Context>,
): Promise<boolean> {
  let message: EmergencyAlertMessage
  try {
    message = parseEmergencyAlertMessage(record.body)
  } catch {
    return false
  }

  let claim: Claim | null
  try {
    claim = await dependencies.claim(message)
  } catch {
    return false
  }
  if (!claim) return true

  if (!bindingMatches(claim, message)) {
    return persistFailure(
      claim,
      new Error('Emergency alert binding mismatch.'),
      dependencies as EmergencyAlertPublisherDependencies<Claim, unknown>,
    )
  }

  let context: Context
  try {
    context = await dependencies.loadContext(claim)
  } catch (error) {
    return staleLease(error)
  }

  try {
    await dependencies.publish({
      claim,
      context,
      idempotencyKey: claim.alertId,
    })
  } catch (error) {
    return persistFailure(
      claim,
      error,
      dependencies as EmergencyAlertPublisherDependencies<Claim, unknown>,
    )
  }

  try {
    await dependencies.markSent(claim)
    return true
  } catch (error) {
    // Provider delivery uses alertId as its idempotency key. Uncertain database
    // persistence must retry SQS; verified suppression is safe to acknowledge.
    return staleLease(error)
  }
}

export async function processEmergencyAlertSqsEvent<
  Claim extends ClaimedEmergencyAlertWork,
  Context,
>(
  event: SQSEvent,
  dependencies: EmergencyAlertPublisherDependencies<Claim, Context>,
): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = []
  for (const record of event.Records) {
    if (!(await processRecord(record, dependencies))) {
      batchItemFailures.push({ itemIdentifier: record.messageId })
    }
  }
  return { batchItemFailures }
}
