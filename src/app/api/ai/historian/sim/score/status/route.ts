/**
 * GET /api/ai/historian/sim/score/status?jobId=<id> — poll an async sim scoring
 * job started by POST /sim/score/start.
 *
 * Returns { status: 'pending' | 'complete' | 'error', error?, top1Hit?, top3Hit? }.
 * A fast DB read only (no Bedrock), so it never approaches the gateway. On a
 * missing jobs table (migration 066 not applied) returns 501 { status:
 * 'not_enabled' } so the client falls back to the legacy staged scoring.
 * Synthetic only.
 */

import { NextResponse } from 'next/server'
import { requireSimUser } from '@/lib/historian/simAuth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const denied = await requireSimUser()
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const jobId = (searchParams.get('jobId') || '').trim()
  if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 })

  try {
    const { getPool } = await import('@/lib/db')
    const pool = await getPool()
    const { rows } = await pool.query(
      `SELECT status, error, top1_hit, top3_hit FROM historian_sim_score_jobs WHERE id = $1`,
      [jobId],
    )
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'job not found' }, { status: 404 })
    }
    const row = rows[0]
    return NextResponse.json({
      status: row.status,
      error: row.error ?? null,
      top1Hit: row.top1_hit ?? null,
      top3Hit: row.top3_hit ?? null,
    })
  } catch (err: any) {
    if (err?.code === '42P01') {
      return NextResponse.json({ status: 'not_enabled' }, { status: 501 })
    }
    console.error('Historian sim score/status error:', err?.message || err)
    return NextResponse.json({ error: 'Failed to read job status' }, { status: 500 })
  }
}
