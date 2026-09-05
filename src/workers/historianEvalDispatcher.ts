import type { QueryConfig } from 'pg'
import { SendMessageBatchCommand, SQSClient } from '@aws-sdk/client-sqs'
import { getPool } from '@/lib/db'
import { dispatchHistorianEvaluations, type HistorianEvalDispatcherDependencies } from './historianEvalDispatcherCore'

export function createHistorianEvalDispatcherHandler(deps: HistorianEvalDispatcherDependencies) {
  return async () => {
    try {
      const summary = await dispatchHistorianEvaluations(deps)
      console.info(JSON.stringify({ event: 'historian_eval_dispatch_completed', ...summary }))
      return summary
    } catch {
      console.error(JSON.stringify({ event: 'historian_eval_dispatch_failed' }))
      throw new Error('Historian evaluation dispatch failed')
    }
  }
}

export async function handler() {
  const queueUrl = process.env.HISTORIAN_EVAL_QUEUE_URL?.trim()
  if (!queueUrl) throw new Error('Historian evaluation queue is not configured')
  const pool = await getPool()
  const sqs = new SQSClient({ region: process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-east-2' })
  return createHistorianEvalDispatcherHandler({
    query: (text, values) => pool.query({ text, values, query_timeout: 10_000 } as QueryConfig & { query_timeout: number }),
    now: () => new Date(),
    sendMessages: async (entries) => {
      const response = await sqs.send(new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: entries.map(({ id, body }) => ({ Id: id, MessageBody: body })),
      }), { abortSignal: AbortSignal.timeout(15_000) })
      // Count an entry as accepted only when SQS explicitly confirms it.
      return { failedEntryIds: entries.filter((entry) => !response.Successful?.some((s) => s.Id === entry.id)).map((entry) => entry.id) }
    },
  })()
}
