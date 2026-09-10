/**
 * POST /api/ai/historian/sim/score/start — kick off async scoring for one
 * simulator run and return 202 immediately.
 *
 * Body: { persona, transcript: {role,text}[], batchId, batchLabel? }
 * Returns: 202 { jobId, status: 'pending' }
 *
 * The durable 202+poll shape (see /api/triage): insert a 'pending' job row,
 * fire the full scoring pipeline in the background (runInBackground, bounded by
 * maxDuration below — NOT the ~30s gateway, which only limits time-to-response),
 * and return at once. The client polls /sim/score/status until 'complete'.
 *
 * If the jobs table isn't there yet (migration 066 not applied), returns 501
 * with code 'not_enabled' so the client falls back to the legacy staged scoring
 * (differential -> summary -> thoroughness -> finalize), which still works.
 * Synthetic only.
 */

import { NextResponse } from 'next/server'
import { requireSimUser } from '@/lib/historian/simAuth'
import { runInBackground } from '@/lib/triage/asyncRunner'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

// The background scoring (2 Sonnet calls + a Haiku pass + ground-truth) runs
// AFTER the 202, so it needs Lambda headroom well past the gateway. Matches
// triage's ceiling; it's a bound, not a target.
export const maxDuration = 300

export async function POST(request: Request) {
  const denied = await requireSimUser()
  if (denied) return denied

  try {
    const body = await request.json().catch(() => null)
    const persona = typeof body?.persona === 'string' ? body.persona.replace(/\.json$/, '').trim() : ''
    const raw = Array.isArray(body?.transcript) ? body.transcript : []
    const batchId = typeof body?.batchId === 'string' && body.batchId.trim() ? body.batchId.trim() : null
    const batchLabel = typeof body?.batchLabel === 'string' ? body.batchLabel : null

    if (!persona) return NextResponse.json({ error: 'persona is required' }, { status: 400 })
    if (raw.length === 0) return NextResponse.json({ error: 'transcript is required' }, { status: 400 })
    if (!batchId) return NextResponse.json({ error: 'batchId is required' }, { status: 400 })

    const transcript: HistorianTranscriptEntry[] = raw
      .filter((t: any) => t && (t.role === 'assistant' || t.role === 'user') && typeof t.text === 'string')
      .map((t: any, i: number) => ({ role: t.role, text: t.text, timestamp: i, seq: i + 1 }))

    const jobId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `simjob-${Date.now()}`

    const { getPool } = await import('@/lib/db')
    const pool = await getPool()

    try {
      await pool.query(
        `INSERT INTO historian_sim_score_jobs (id, status, persona, batch_id, batch_label)
         VALUES ($1, 'pending', $2, $3, $4)`,
        [jobId, persona, batchId, batchLabel],
      )
    } catch (err: any) {
      if (err?.code === '42P01') {
        // Table not applied yet — tell the client to use the legacy staged path.
        return NextResponse.json(
          { error: 'sim async scoring not enabled (migration 066 pending)', code: 'not_enabled' },
          { status: 501 },
        )
      }
      throw err
    }

    const { runSimScoringJob } = await import('@/lib/historian/sim/runSimScoringJob')
    runInBackground(() => runSimScoringJob({ pool, jobId, persona, transcript, batchId, batchLabel }))

    return NextResponse.json({ jobId, status: 'pending' }, { status: 202 })
  } catch (error: any) {
    console.error('Historian sim score/start error:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'Failed to start scoring' }, { status: 500 })
  }
}
