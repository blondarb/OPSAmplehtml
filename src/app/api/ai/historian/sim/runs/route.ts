/**
 * GET /api/ai/historian/sim/runs — data source for the /rnd/historian/simulator
 * dashboard.
 *
 * Reads historian_sim_runs (migration 059) — synthetic persona runs against
 * Henry, scored against each persona's hidden ground-truth diagnosis.
 *
 * Query params:
 *   ?id=<uuid>     — one run, full detail (transcript, scored ddx, etc.)
 *   ?batch=<uuid>  — restrict to one batch (default: the latest batch)
 *   ?all=true      — every run across all batches (newest first)
 *
 * Also returns batch-level accuracy aggregates (the scientific payoff: did
 * Henry's differential catch the true diagnosis — top-1 / top-3 hit rate).
 *
 * Synthetic data only. Add auth/tenant scoping before real patient data.
 */

import { NextResponse } from 'next/server'
import { requireSimUser } from '@/lib/historian/simAuth'

function coerceJson<T>(v: unknown): T | null {
  if (v == null) return null
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T
    } catch {
      return null
    }
  }
  return v as T
}

const JSON_COLUMNS = [
  'transcript',
  'final_differential',
  'independent_ddx',
  'agreement',
  'thoroughness',
  'ground_truth',
  'patient_belief',
  'personality',
  'models',
] as const

function normaliseRow(row: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...row }
  for (const col of JSON_COLUMNS) out[col] = coerceJson(row[col])
  if (row.cost_usd != null) out.cost_usd = Number(row.cost_usd)
  return out
}

const SELECT = `id, batch_id, batch_label, persona_id, persona_label, syndrome,
  chief_complaint, turn_count, transcript, final_differential, independent_ddx,
  agreement, thoroughness, ground_truth, patient_belief, personality, cost_usd,
  models, insufficient, created_at`

export async function GET(request: Request) {
  const denied = await requireSimUser()
  if (denied) return denied

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const batch = searchParams.get('batch')
    const all = searchParams.get('all') === 'true'

    const { getPool } = await import('@/lib/db')
    const pool = await getPool()

    if (id) {
      const { rows } = await pool.query(
        `SELECT ${SELECT} FROM historian_sim_runs WHERE id = $1 LIMIT 1`,
        [id],
      )
      if (rows.length === 0) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
      return NextResponse.json({ run: normaliseRow(rows[0]) })
    }

    // Resolve which batch to show. Default = the most recent batch.
    let batchId = batch
    if (!batchId && !all) {
      const { rows } = await pool.query(
        `SELECT batch_id FROM historian_sim_runs ORDER BY created_at DESC LIMIT 1`,
      )
      batchId = rows[0]?.batch_id ?? null
    }

    const where = all ? '' : batchId ? 'WHERE batch_id = $1' : 'WHERE 1 = 0'
    const values = !all && batchId ? [batchId] : []
    const { rows } = await pool.query(
      `SELECT ${SELECT} FROM historian_sim_runs ${where} ORDER BY created_at DESC, persona_id ASC LIMIT 500`,
      values,
    )
    const runs = rows.map(normaliseRow)

    // Also surface the list of batches so the UI can offer a picker.
    const { rows: batchRows } = await pool.query(
      `SELECT batch_id, MAX(batch_label) AS batch_label, COUNT(*)::int AS n, MAX(created_at) AS created_at
       FROM historian_sim_runs GROUP BY batch_id ORDER BY MAX(created_at) DESC LIMIT 50`,
    )

    // Accuracy aggregates over the shown runs — the headline: did Henry's
    // differential include the persona's true diagnosis?
    const scored = runs.filter((r: any) => r.ground_truth && !r.insufficient)
    const hit = (r: any, k: 'top1Hit' | 'top3Hit') =>
      r.ground_truth?.pipeline && r.ground_truth.pipeline[k] === true
    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
    const thoroughnessVals = runs
      .map((r: any) => r.thoroughness?.overall)
      .filter((v: unknown): v is number => typeof v === 'number')
    const totalCost = runs.reduce((s: number, r: any) => s + (Number(r.cost_usd) || 0), 0)

    const metrics = {
      total: runs.length,
      scored: scored.length,
      top1_hit_rate: pct(scored.filter((r: any) => hit(r, 'top1Hit')).length, scored.length),
      top3_hit_rate: pct(scored.filter((r: any) => hit(r, 'top3Hit')).length, scored.length),
      avg_thoroughness: thoroughnessVals.length
        ? Math.round((thoroughnessVals.reduce((a: number, b: number) => a + b, 0) / thoroughnessVals.length) * 10) / 10
        : null,
      total_cost_usd: Math.round(totalCost * 10000) / 10000,
    }

    return NextResponse.json({ runs, metrics, batches: batchRows, batchId: all ? null : batchId })
  } catch (error: any) {
    console.error('Historian sim runs API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch simulator runs' },
      { status: 500 },
    )
  }
}
