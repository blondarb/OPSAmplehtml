import type { SQSEvent, SQSBatchResponse, SQSRecord } from 'aws-lambda'

import {
  parseLongPacketWorkMessage,
  type LongPacketWorkKind,
  type LongPacketWorkMessage,
} from './triageLongPacketMessage'

export interface ClaimedLongPacketWork {
  jobId: string
  kind: LongPacketWorkKind
  leaseToken: string
  attemptCount: number
}

export interface LongPacketWorkerDependencies<
  Claim extends ClaimedLongPacketWork = ClaimedLongPacketWork,
> {
  claim: (message: LongPacketWorkMessage) => Promise<Claim | null>
  executeChunk: (claim: Claim) => Promise<unknown>
  executeFinalizer: (claim: Claim) => Promise<unknown>
  complete: (claim: Claim, result: unknown) => Promise<void>
  fail: (claim: Claim, error: unknown, nextRetryAt: Date) => Promise<void>
  now?: () => Date
}

function nextRetryAt(attemptCount: number, now: Date): Date {
  const normalizedAttempt = Number.isSafeInteger(attemptCount)
    ? Math.max(1, Math.min(attemptCount, 10))
    : 1
  const delayMs = Math.min(15 * 60_000, 30_000 * 2 ** (normalizedAttempt - 1))
  return new Date(now.getTime() + delayMs)
}

async function processRecord<Claim extends ClaimedLongPacketWork>(
  record: SQSRecord,
  dependencies: LongPacketWorkerDependencies<Claim>,
): Promise<boolean> {
  let message: LongPacketWorkMessage
  try {
    message = parseLongPacketWorkMessage(record.body)
  } catch {
    return false
  }

  let claim: Claim | null
  try {
    claim = await dependencies.claim(message)
  } catch {
    return false
  }

  // A duplicate delivery for complete, actively leased, not-yet-retryable, or
  // terminal work is safe to acknowledge. The database lifecycle is the source
  // of truth, and the scheduled sweep recovers expired work.
  if (!claim) return true

  if (claim.jobId.toLowerCase() !== message.job_id || claim.kind !== message.kind) {
    try {
      await dependencies.fail(
        claim,
        new Error('Durable work binding mismatch.'),
        nextRetryAt(claim.attemptCount, (dependencies.now ?? (() => new Date()))()),
      )
      return true
    } catch {
      return false
    }
  }

  try {
    const result =
      claim.kind === 'chunk'
        ? await dependencies.executeChunk(claim)
        : await dependencies.executeFinalizer(claim)
    await dependencies.complete(claim, result)
    return true
  } catch (error) {
    try {
      await dependencies.fail(
        claim,
        error,
        nextRetryAt(claim.attemptCount, (dependencies.now ?? (() => new Date()))()),
      )
      return true
    } catch {
      // If failure persistence is uncertain, leave the SQS message unacknowledged.
      // A later delivery or lease-expiry sweep will reconcile it.
      return false
    }
  }
}

export async function processLongPacketSqsEvent<
  Claim extends ClaimedLongPacketWork,
>(
  event: SQSEvent,
  dependencies: LongPacketWorkerDependencies<Claim>,
): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = []

  for (const record of event.Records) {
    if (!(await processRecord(record, dependencies))) {
      batchItemFailures.push({ itemIdentifier: record.messageId })
    }
  }

  return { batchItemFailures }
}
