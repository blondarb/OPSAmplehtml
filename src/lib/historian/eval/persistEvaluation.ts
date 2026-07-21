/**
 * Pure persistence layer for AI Historian evaluator outputs
 * (historian_evaluations, migration 058 — Historian Validation Suite Task
 * 3). Given a fully-computed result + provenance + token usage, inserts
 * exactly one row. Never throws — callers (thoroughnessJudge.ts's
 * runThoroughnessJudge, and later Task 4's independent-scorer/agreement
 * evaluators) call this from a fire-and-forget pipeline that must never
 * fail or delay the historian save response.
 *
 * Uses a raw parameterized pool.query (not the from() query builder) so
 * the JSONB columns (inference_params, result) are explicitly
 * JSON.stringify'd at the call site — the same db-query.ts auto-stringify-
 * object-but-not-array gotcha documented across this codebase (save/
 * route.ts, finalDifferential.ts) doesn't apply to a raw pool.query call at
 * all (node-postgres has no such gotcha for parameterized queries), but a
 * JSONB column still needs its JS object serialized to text before it can
 * be bound as a query parameter.
 *
 * Postgres error-code handling mirrors the established Task 1/2 precedent
 * (finalDifferential.ts's runFinalDifferential, save/route.ts's integrity
 * cross-check): 42P01 (relation does not exist — migration 058 not yet
 * applied) logs once at console.info quiet level, never as an error; any
 * other DB error logs at console.error. No patient/transcript text is ever
 * passed to console.* here — only session id, evaluator name, and the
 * driver's own error message.
 */

import { computeCostUsd } from './constants'

export interface PersistEvaluationInput {
  sessionId: string
  evaluator: 'thoroughness' | 'independent_ddx' | 'agreement'
  modelId: string
  promptVersion: string
  rubricVersion?: string | null
  inferenceParams: Record<string, unknown>
  /** The full evaluator result object — persisted as JSONB. Legitimately contains clinical evidence text (turn quotes, rubric citations); this is an audit record, not a log line. */
  result: unknown
  usage: { inputTokens?: number; outputTokens?: number }
  latencyMs: number
}

export async function persistEvaluation(input: PersistEvaluationInput): Promise<void> {
  const costUsd = computeCostUsd(input.modelId, input.usage)

  try {
    const { getPool } = await import('@/lib/db')
    const pool = await getPool()
    await pool.query(
      `INSERT INTO historian_evaluations
        (session_id, evaluator, model_id, prompt_version, rubric_version, inference_params, result, cost_usd, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.sessionId,
        input.evaluator,
        input.modelId,
        input.promptVersion,
        input.rubricVersion ?? null,
        JSON.stringify(input.inferenceParams ?? {}),
        JSON.stringify(input.result),
        costUsd,
        input.latencyMs,
      ],
    )
  } catch (err: unknown) {
    const pgCode = (err as { code?: string } | undefined)?.code
    if (pgCode === '42P01') {
      // historian_evaluations doesn't exist yet — expected and benign
      // until the rollout task applies migration 058.
      console.info(
        '[historian/eval] historian_evaluations table not present yet (migration 058 not applied) — skipping persist for session',
        input.sessionId,
        input.evaluator,
      )
    } else {
      console.error(
        '[historian/eval] failed to persist evaluation (non-fatal) for session',
        input.sessionId,
        input.evaluator,
        err,
      )
    }
  }
}
