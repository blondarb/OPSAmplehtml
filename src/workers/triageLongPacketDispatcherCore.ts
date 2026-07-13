import type { LongPacketWorkKind } from './triageLongPacketMessage'
import { serializeLongPacketWorkMessage } from './triageLongPacketMessage'

export interface DispatchableLongPacketWork {
  kind: LongPacketWorkKind
  jobId: string
}

export interface LongPacketQueueBatchEntry {
  id: string
  body: string
}

export interface LongPacketQueueBatchResult {
  failedEntryIds: string[]
}

export interface LongPacketDispatcherDependencies {
  listDispatchableWork: (
    limit: number,
  ) => Promise<DispatchableLongPacketWork[]>
  sendBatch: (
    entries: LongPacketQueueBatchEntry[],
  ) => Promise<LongPacketQueueBatchResult>
}

export interface LongPacketDispatchSummary {
  discovered: number
  enqueued: number
  batchCount: number
}

const SQS_BATCH_LIMIT = 10

export class LongPacketDispatchError extends Error {
  readonly name = 'LongPacketDispatchError'
}

function boundedLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000) {
    throw new LongPacketDispatchError('Invalid dispatcher work limit.')
  }
  return value
}

export async function dispatchLongPacketWork(
  dependencies: LongPacketDispatcherDependencies,
  limit = 500,
): Promise<LongPacketDispatchSummary> {
  const work = await dependencies.listDispatchableWork(boundedLimit(limit))
  const unique = new Map<string, DispatchableLongPacketWork>()
  for (const item of work) {
    const key = `${item.kind}:${item.jobId.toLowerCase()}`
    if (!unique.has(key)) unique.set(key, item)
  }
  const pending = [...unique.values()]
  let enqueued = 0
  let batchCount = 0

  for (let offset = 0; offset < pending.length; offset += SQS_BATCH_LIMIT) {
    const batch = pending.slice(offset, offset + SQS_BATCH_LIMIT)
    const entries = batch.map((item, index) => ({
      id: `work-${offset + index}`,
      body: serializeLongPacketWorkMessage(item),
    }))
    const result = await dependencies.sendBatch(entries)
    batchCount += 1

    const failed = new Set(result.failedEntryIds)
    if (
      failed.size > 0 ||
      [...failed].some((entryId) => !entries.some((entry) => entry.id === entryId))
    ) {
      throw new LongPacketDispatchError(
        'The durable work queue accepted only part of a batch.',
      )
    }
    enqueued += entries.length
  }

  return {
    discovered: pending.length,
    enqueued,
    batchCount,
  }
}
