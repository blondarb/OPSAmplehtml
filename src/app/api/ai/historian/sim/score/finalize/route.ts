/**
 * POST /api/ai/historian/sim/score/finalize — stage 2 of live scoring.
 *
 * Body: { persona, transcript: {role,text}[], differential, batchId?, batchLabel? }
 *   `differential` = the SimDifferential from /sim/score/differential.
 * Runs thoroughness + ground-truth scoring against the provided differential,
 * then persists one historian_sim_runs row (with the live transcript).
 * Returns: { batchId, ok, top1Hit }
 *
 * Split from the differential stage so each request stays under the ~30s
 * gateway timeout. Shares scoreAndPersistSimRun with the scripted /sim/run.
 * Synthetic only. Incurs Bedrock cost.
 */

import { NextResponse } from 'next/server'
import { requireSimUser } from '@/lib/historian/simAuth'
import { randomUUID } from 'crypto'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

export const maxDuration = 120

export async function POST(request: Request) {
  const denied = await requireSimUser()
  if (denied) return denied

  try {
    const body = await request.json().catch(() => null)
    const persona = typeof body?.persona === 'string' ? body.persona.replace(/\.json$/, '').trim() : ''
    const raw = Array.isArray(body?.transcript) ? body.transcript : []
    const differential = body?.differential ?? null
    if (!persona) return NextResponse.json({ error: 'persona is required' }, { status: 400 })
    if (raw.length === 0) return NextResponse.json({ error: 'transcript is required' }, { status: 400 })

    const transcript: HistorianTranscriptEntry[] = raw
      .filter((t: any) => t && (t.role === 'assistant' || t.role === 'user') && typeof t.text === 'string')
      .map((t: any, i: number) => ({ role: t.role, text: t.text, timestamp: i, seq: i + 1 }))

    const batchId: string = typeof body?.batchId === 'string' && body.batchId ? body.batchId : randomUUID()
    const batchLabel: string | null =
      typeof body?.batchLabel === 'string' && body.batchLabel
        ? body.batchLabel
        : `Live ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`

    const { getPool } = await import('@/lib/db')
    const pool = await getPool()
    const { scoreAndPersistSimRun } = await import('@/lib/historian/sim/scoreSimTranscript')
    const result = await scoreAndPersistSimRun({ pool, persona, transcript, differential, batchId, batchLabel })

    return NextResponse.json({ batchId, ok: result.ok, top1Hit: result.top1Hit })
  } catch (error: any) {
    const pgCode = (error as { code?: string })?.code
    if (pgCode === '42P01') {
      return NextResponse.json(
        { error: 'historian_sim_runs table not present — apply migration 059 first.' },
        { status: 503 },
      )
    }
    console.error('Historian sim score/finalize error:', error)
    return NextResponse.json({ error: error?.message || 'Finalize scoring failed' }, { status: 500 })
  }
}
