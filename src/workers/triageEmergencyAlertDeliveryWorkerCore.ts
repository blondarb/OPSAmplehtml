import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda'

import type {
  CriticalUiDeliveryClaimResult,
  CriticalUiDeliveryFailureOutcome,
  CriticalUiDeliveryOutcome,
} from '@/lib/triage/emergencyAlertNotificationDelivery'
import {
  parseEmergencyAlertMessage,
  type EmergencyAlertMessage,
} from './triageEmergencyAlertMessage'

export interface ClaimedEmergencyAlertDelivery {
  alertId: string
  actionId: string
  severity: 'emergency'
  level: 0 | 1 | 2 | 3
  leaseToken: string
  attemptCount: number
  tenantId: string
  triageSessionId: string
  ownerTeam: string
  ownerUserId: string | null
}

export interface EmergencyAlertDeliveryDependencies<
  Claim extends ClaimedEmergencyAlertDelivery = ClaimedEmergencyAlertDelivery,
> {
  claim: (message: EmergencyAlertMessage) => Promise<
    | { kind: 'claimed'; claim: Claim }
    | Exclude<CriticalUiDeliveryClaimResult, { kind: 'claimed' }>
  >
  deliver: (claim: Claim) => Promise<CriticalUiDeliveryOutcome>
  fail: (
    claim: Claim,
    error: unknown,
    nextRetryAt: Date,
  ) => Promise<CriticalUiDeliveryFailureOutcome>
  defer?: (record: SQSRecord, retryAfterSeconds: number) => Promise<void>
  terminalFailure?: () => void | Promise<void>
  now?: () => Date
}

export function emergencyAlertDeliveryNextRetryAt(
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

function bindingMatches(
  claim: ClaimedEmergencyAlertDelivery,
  message: EmergencyAlertMessage,
) {
  return (
    claim.alertId.toLowerCase() === message.alert_id &&
    claim.actionId.toLowerCase() === message.action_id &&
    claim.severity === message.severity &&
    claim.level === message.level
  )
}

async function emitTerminalFailure<Claim extends ClaimedEmergencyAlertDelivery>(
  dependencies: EmergencyAlertDeliveryDependencies<Claim>,
): Promise<boolean> {
  try {
    await dependencies.terminalFailure?.()
    return true
  } catch {
    // Retry the queue record so an observability failure cannot hide a
    // terminal database state.
    return false
  }
}

async function persistFailure<Claim extends ClaimedEmergencyAlertDelivery>(
  record: SQSRecord,
  claim: Claim,
  cause: unknown,
  dependencies: EmergencyAlertDeliveryDependencies<Claim>,
): Promise<boolean> {
  try {
    const observedAt = (dependencies.now ?? (() => new Date()))()
    const nextRetryAt = emergencyAlertDeliveryNextRetryAt(
      claim.attemptCount,
      observedAt,
    )
    const outcome = await dependencies.fail(
      claim,
      cause,
      nextRetryAt,
    )
    if (outcome.status === 'failed') {
      await dependencies.defer?.(
        record,
        Math.max(
          1,
          Math.ceil(
            (nextRetryAt.getTime() - observedAt.getTime()) / 1_000,
          ),
        ),
      )
      return false
    }
    if (outcome.status === 'terminal_failure') {
      return emitTerminalFailure(dependencies)
    }
    return true
  } catch {
    return false
  }
}

async function processRecord<Claim extends ClaimedEmergencyAlertDelivery>(
  record: SQSRecord,
  dependencies: EmergencyAlertDeliveryDependencies<Claim>,
): Promise<boolean> {
  let message: EmergencyAlertMessage
  try {
    message = parseEmergencyAlertMessage(record.body)
  } catch {
    return false
  }

  let claimResult: Awaited<ReturnType<typeof dependencies.claim>>
  try {
    claimResult = await dependencies.claim(message)
  } catch {
    return false
  }
  if (claimResult.kind === 'retry') {
    try {
      await dependencies.defer?.(record, claimResult.retryAfterSeconds)
    } catch {
      // The default queue visibility remains the safe fallback.
    }
    return false
  }
  if (claimResult.kind === 'acknowledge') {
    if (claimResult.outcome === 'terminal_failure') {
      return emitTerminalFailure(dependencies)
    }
    return true
  }

  const claim = claimResult.claim
  if (!bindingMatches(claim, message)) {
    return persistFailure(
      record,
      claim,
      new Error('Emergency alert critical-UI binding mismatch.'),
      dependencies,
    )
  }

  try {
    const outcome = await dependencies.deliver(claim)
    if (outcome.status === 'terminal_failure') {
      return emitTerminalFailure(dependencies)
    }
    return true
  } catch (cause) {
    return persistFailure(record, claim, cause, dependencies)
  }
}

export async function processEmergencyAlertDeliverySqsEvent<
  Claim extends ClaimedEmergencyAlertDelivery,
>(
  event: SQSEvent,
  dependencies: EmergencyAlertDeliveryDependencies<Claim>,
): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = []
  for (const [index, record] of event.Records.entries()) {
    if (!(await processRecord(record, dependencies))) {
      // The delivery queue is FIFO. Stop at the first failure and return every
      // later record unprocessed so Lambda cannot acknowledge a later reminder
      // ahead of an earlier alert in the same batch.
      batchItemFailures.push(
        ...event.Records.slice(index).map((unprocessed) => ({
          itemIdentifier: unprocessed.messageId,
        })),
      )
      break
    }
  }
  return { batchItemFailures }
}
