/**
 * POST /api/ai/historian/sim/import — ingest a batch eval report into
 * historian_sim_runs so the /rnd/historian/simulator dashboard can show it.
 *
 * Body: the HistorianEvalReport JSON the batch harness already writes
 * (qa/historian-eval/results/<date>/historian-eval-report.json), either as
 * the raw report or wrapped as { report, batchLabel? }.
 *
 * One report → one batch_id → one row per persona case (via persistSimCase,
 * shared with the on-demand /sim/run endpoint so the two ingest paths can't
 * drift). Keeping ingest separate from the tested CLI avoids destabilizing it.
 *
 * INTERNAL R&D endpoint over synthetic data. Add auth before real data.
 */

import { NextResponse } from 'next/server'
import { requireSimUser } from '@/lib/historian/simAuth'
import { randomUUID } from 'crypto'
import { persistSimCase, type SimCaseLike } from '@/lib/historian/eval/persistSimRun'

interface ReportLike {
  cases?: SimCaseLike[]
  generatedAt?: string
  mode?: string
}

export async function POST(request: Request) {
  const denied = await requireSimUser()
  if (denied) return denied

  try {
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const report: ReportLike = (body.report ?? body) as ReportLike
    const batchLabel: string | null =
      typeof body.batchLabel === 'string' ? body.batchLabel : report.generatedAt ?? null

    if (!Array.isArray(report.cases) || report.cases.length === 0) {
      return NextResponse.json({ error: 'Report has no cases to import.' }, { status: 400 })
    }

    const { getPool } = await import('@/lib/db')
    const pool = await getPool()

    const batchId = randomUUID()
    let inserted = 0
    for (const c of report.cases) {
      if (!c || typeof c.caseId !== 'string') continue
      await persistSimCase(pool, batchId, batchLabel, c)
      inserted++
    }

    return NextResponse.json({ inserted, batchId, batchLabel })
  } catch (error: any) {
    const pgCode = (error as { code?: string })?.code
    if (pgCode === '42P01') {
      return NextResponse.json(
        { error: 'historian_sim_runs table not present — apply migration 059 first.' },
        { status: 503 },
      )
    }
    console.error('Historian sim import API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to import simulator report' },
      { status: 500 },
    )
  }
}
