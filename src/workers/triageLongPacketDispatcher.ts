import {
  SendMessageBatchCommand,
  SQSClient,
} from '@aws-sdk/client-sqs'

import { getPool } from '@/lib/db'
import { createPostgresLongPacketDurableWorkService } from '@/lib/triage/longPacketDurableWork'
import {
  dispatchLongPacketWork,
  type LongPacketDispatchSummary,
  type LongPacketDispatcherDependencies,
} from './triageLongPacketDispatcherCore'

const DEFAULT_DISPATCH_LIMIT = 500

function requiredQueueUrl(): string {
  const value = process.env.TRIAGE_LONG_PACKET_QUEUE_URL?.trim()
  if (!value) throw new Error('Durable work queue is not configured.')
  return value
}

function configuredLimit(): number {
  const raw = process.env.TRIAGE_LONG_PACKET_DISPATCH_LIMIT
  if (!raw) return DEFAULT_DISPATCH_LIMIT
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1_000) {
    throw new Error('Durable work dispatch limit is invalid.')
  }
  return parsed
}

export function createTriageLongPacketDispatcherHandler(
  dependencies: LongPacketDispatcherDependencies,
  limit = DEFAULT_DISPATCH_LIMIT,
) {
  return async (): Promise<LongPacketDispatchSummary> => {
    const summary = await dispatchLongPacketWork(dependencies, limit)
    // Never log job IDs, tenant identifiers, clinical text, or queue bodies.
    console.info(
      JSON.stringify({
        event: 'triage_long_packet_dispatch_completed',
        discovered: summary.discovered,
        enqueued: summary.enqueued,
        batch_count: summary.batchCount,
      }),
    )
    return summary
  }
}

export async function handler(): Promise<LongPacketDispatchSummary> {
  const queueUrl = requiredQueueUrl()
  const service = createPostgresLongPacketDurableWorkService(await getPool())
  const sqs = new SQSClient({
    region: process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-east-2',
  })

  return createTriageLongPacketDispatcherHandler(
    {
      listDispatchableWork: (limit) => service.listDispatchableJobRefs(limit),
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
