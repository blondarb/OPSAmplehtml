import type { QueryConfig } from 'pg'
import type { SQSEvent, SQSBatchResponse, Context } from 'aws-lambda'
import { getPool } from '@/lib/db'
import { runFinalDifferential } from '@/lib/historian/eval/finalDifferential'
import { runThoroughnessJudge } from '@/lib/historian/eval/thoroughnessJudge'
import { runIndependentDdxAndAgreement } from '@/lib/historian/eval/independentDdx'
import { processHistorianEvalSqsEvent, type HistorianEvalWorkerDependencies } from './historianEvalWorkerCore'

export function createHistorianEvalWorkerHandler(deps: HistorianEvalWorkerDependencies) {
  return (event: SQSEvent) => processHistorianEvalSqsEvent(event, deps)
}

export async function handler(event: SQSEvent, context: Context): Promise<SQSBatchResponse> {
  context.callbackWaitsForEmptyEventLoop = false
  return createHistorianEvalWorkerHandler({
    loadSession: async (id) => {
      const pool = await getPool()
      const { rows } = await pool.query({
        text: 'SELECT id, transcript, referral_reason, structured_output, narrative_summary, final_differential FROM historian_sessions WHERE id = $1',
        values: [id], query_timeout: 10_000,
      } as QueryConfig & { query_timeout: number })
      return rows[0] ?? null
    },
    runFinalDifferential, runThoroughnessJudge, runIndependentDdxAndAgreement,
    persistError: async (id, error) => {
      const pool = await getPool()
      await pool.query({
        // A delayed/duplicate delivery must not replace a completed differential.
        text: "UPDATE historian_sessions SET final_differential = $1 WHERE id = $2 AND (final_differential->>'status' IS DISTINCT FROM 'ok')",
        values: [JSON.stringify(error), id], query_timeout: 10_000,
      } as QueryConfig & { query_timeout: number })
    },
    log: (event, errorClass) => console.info(JSON.stringify({ event, error_class: errorClass })),
  })(event)
}
