/**
 * POST /api/ai/historian/sim/import — ingest a batch eval report into
 * historian_sim_runs so the /rnd/historian/simulator dashboard can show it.
 *
 * Body: the HistorianEvalReport JSON the batch harness already writes
 * (qa/historian-eval/results/<date>/historian-eval-report.json), either as
 * the raw report or wrapped as { report, batchLabel? }.
 *
 * One report → one batch_id → one row per persona case. This is the bridge
 * that was missing: the harness's --fixtures mode only wrote report files to
 * disk, never the DB, so the cloud dashboard had no data source. Keeping the
 * ingest as a separate endpoint (rather than wiring persistence into the
 * tested CLI) avoids destabilizing the eval harness.
 *
 * Transcripts: fixture personas are synthetic (no PHI). We reconstruct the
 * synthetic transcript from the persona id via buildPersonaTranscript when the
 * persona fixture files are available at runtime; otherwise transcript is left
 * null (best-effort — the scored differential, ground truth, agreement, and
 * cost are the primary payload).
 *
 * INTERNAL R&D endpoint over synthetic data. Add auth before real data.
 */

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

interface RunResultLike {
  result?: unknown
  costUsd?: number | null
  modelId?: string | null
}
interface CaseLike {
  caseId: string
  source?: 'fixture' | 'session'
  syndrome?: string | null
  chiefComplaint?: string | null
  turnCount?: number
  insufficientTranscript?: boolean
  finalDifferential?: RunResultLike
  thoroughness?: RunResultLike
  independentDdx?: RunResultLike
  agreement?: RunResultLike
  groundTruth?: unknown
}
interface ReportLike {
  cases?: CaseLike[]
  generatedAt?: string
  mode?: string
}

function sumCost(...runs: (RunResultLike | undefined)[]): number {
  return runs.reduce((s, r) => s + (typeof r?.costUsd === 'number' ? r.costUsd : 0), 0)
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const report: ReportLike = (body.report ?? body) as ReportLike
    const batchLabel: string | null =
      typeof body.batchLabel === 'string' ? body.batchLabel : report.generatedAt ?? null

    if (!Array.isArray(report.cases) || report.cases.length === 0) {
      return NextResponse.json({ error: 'Report has no cases to import.' }, { status: 400 })
    }

    // Best-effort synthetic transcript reconstruction (no PHI — role-played
    // personas). Never fatal: a missing fixture file just yields a null
    // transcript for that case.
    let buildPersonaTranscript: ((f: string) => { transcript: unknown }) | null = null
    try {
      const mod = await import('@/lib/historian/eval/personaFixtures')
      buildPersonaTranscript = mod.buildPersonaTranscript
    } catch {
      buildPersonaTranscript = null
    }

    const { getPool } = await import('@/lib/db')
    const pool = await getPool()

    const batchId = randomUUID()
    let inserted = 0

    for (const c of report.cases) {
      if (!c || typeof c.caseId !== 'string') continue
      const personaId = c.caseId.replace(/\.json$/, '')

      let transcript: unknown = null
      if (c.source !== 'session' && buildPersonaTranscript) {
        try {
          transcript = buildPersonaTranscript(c.caseId).transcript
        } catch {
          transcript = null
        }
      }

      const models = {
        final: c.finalDifferential?.modelId ?? null,
        thoroughness: c.thoroughness?.modelId ?? null,
        independent: c.independentDdx?.modelId ?? null,
        agreement: c.agreement?.modelId ?? null,
      }
      const costUsd = sumCost(c.finalDifferential, c.thoroughness, c.independentDdx, c.agreement)

      await pool.query(
        `INSERT INTO historian_sim_runs
          (batch_id, batch_label, persona_id, persona_label, syndrome, chief_complaint,
           turn_count, transcript, final_differential, independent_ddx, agreement,
           thoroughness, ground_truth, cost_usd, models, insufficient)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          batchId,
          batchLabel,
          personaId,
          null,
          c.syndrome ?? null,
          c.chiefComplaint ?? null,
          c.turnCount ?? 0,
          transcript != null ? JSON.stringify(transcript) : null,
          c.finalDifferential?.result != null ? JSON.stringify(c.finalDifferential.result) : null,
          c.independentDdx?.result != null ? JSON.stringify(c.independentDdx.result) : null,
          c.agreement?.result != null ? JSON.stringify(c.agreement.result) : null,
          c.thoroughness?.result != null ? JSON.stringify(c.thoroughness.result) : null,
          c.groundTruth != null ? JSON.stringify(c.groundTruth) : null,
          costUsd || null,
          JSON.stringify(models),
          c.insufficientTranscript === true,
        ],
      )
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
