import { SendMessageBatchCommand, SQSClient } from '@aws-sdk/client-sqs'
import { getPool } from '@/lib/db'
import {
  buildHistorianEvalMessage,
  HistorianEvalJobService,
} from '@/lib/historian/eval/durableJobs'

const DEFAULT_LIMIT = 500

function requiredQueueUrl(): string {
  const value = process.env.HISTORIAN_EVAL_QUEUE_URL?.trim()
  if (!value) throw new Error('Historian evaluation queue is not configured.')
  return value
}

export async function dispatchHistorianEvalJobs(input: {
  service: HistorianEvalJobService
  sendBatch: (entries: Array<{ id: string; body: string }>) => Promise<Set<string>>
  limit?: number
}): Promise<{ discovered: number; enqueued: number; batchCount: number }> {
  const jobIds = await input.service.listDispatchableJobIds(input.limit ?? DEFAULT_LIMIT)
  let enqueued = 0
  let batchCount = 0
  for (let offset = 0; offset < jobIds.length; offset += 10) {
    const batch = jobIds.slice(offset, offset + 10).map((jobId, index) => ({
      id: `${offset + index}`,
      body: JSON.stringify(buildHistorianEvalMessage(jobId)),
    }))
    const failed = await input.sendBatch(batch)
    enqueued += batch.length - failed.size
    batchCount += 1
  }
  return { discovered: jobIds.length, enqueued, batchCount }
}

export async function handler() {
  const queueUrl = requiredQueueUrl()
  const sqs = new SQSClient({ region: process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-east-2' })
  const summary = await dispatchHistorianEvalJobs({
    service: new HistorianEvalJobService(await getPool()),
    sendBatch: async (entries) => {
      const response = await sqs.send(
        new SendMessageBatchCommand({
          QueueUrl: queueUrl,
          Entries: entries.map((entry) => ({ Id: entry.id, MessageBody: entry.body })),
        }),
      )
      return new Set((response.Failed ?? []).flatMap((failure) => failure.Id ? [failure.Id] : []))
    },
  })
  // Counts only: never log job/session/tenant identifiers or clinical text.
  console.info(JSON.stringify({ event: 'historian_eval_dispatch_completed', ...summary }))
  return summary
}
