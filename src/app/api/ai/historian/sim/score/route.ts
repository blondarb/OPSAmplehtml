/**
 * POST /api/ai/historian/sim/score — score a finished LIVE simulator
 * conversation and persist it.
 *
 * Body: { persona, transcript: {role,text}[], batchId?, batchLabel? }
 * Runs the same evaluator pipeline as the batch harness (Sonnet final
 * differential, thoroughness, independent 2nd-opinion ddx, agreement,
 * ground-truth scoring) against the LIVE transcript the browser just produced,
 * then writes one historian_sim_runs row (with the live transcript, not the
 * scripted fixture one).
 *
 * Separate from the per-turn endpoints so the (multi-Bedrock-call) scoring
 * happens in one bounded request after the conversation is done. Synthetic
 * only. Incurs Bedrock cost.
 */

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const personaRaw: unknown = body?.persona
    if (typeof personaRaw !== 'string' || !personaRaw.trim()) {
      return NextResponse.json({ error: 'persona is required' }, { status: 400 })
    }
    const persona = personaRaw.replace(/\.json$/, '').trim()

    const rawTranscript = Array.isArray(body?.transcript) ? body.transcript : []
    if (rawTranscript.length === 0) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 })
    }
    // Normalise to HistorianTranscriptEntry (add synthetic timestamp/seq).
    const transcript: HistorianTranscriptEntry[] = rawTranscript
      .filter((t: any) => t && (t.role === 'assistant' || t.role === 'user') && typeof t.text === 'string')
      .map((t: any, i: number) => ({ role: t.role, text: t.text, timestamp: i, seq: i + 1 }))

    const { buildPersonaTranscript } = await import('@/lib/historian/eval/personaFixtures')
    let expectedDDx: any[] = []
    let chiefComplaint: string | null = null
    try {
      const fixture = buildPersonaTranscript(persona)
      expectedDDx = fixture.expectedDDx
      chiefComplaint = fixture.chiefComplaint || null
    } catch {
      return NextResponse.json({ error: `Unknown persona "${persona}".` }, { status: 400 })
    }

    const { runHydratedCase } = await import('@/lib/historian/eval/cli')
    const outcome = await runHydratedCase(
      {
        caseId: persona,
        source: 'fixture',
        transcript,
        chiefComplaint,
        narrativeSummary: null,
        syndrome: persona,
        structuredOutput: null,
        expectedDDx,
      },
      { live: true, persist: false },
    )

    const batchId: string = typeof body?.batchId === 'string' && body.batchId ? body.batchId : randomUUID()
    const batchLabel: string | null =
      typeof body?.batchLabel === 'string' && body.batchLabel
        ? body.batchLabel
        : `Live ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`

    const { getPool } = await import('@/lib/db')
    const pool = await getPool()
    const { persistSimCase } = await import('@/lib/historian/eval/persistSimRun')
    await persistSimCase(pool, batchId, batchLabel, outcome as any, transcript)

    const gt: any = (outcome as any).groundTruth
    return NextResponse.json({
      batchId,
      persona,
      ok: Boolean((outcome as any).finalDifferential?.ok),
      top1Hit: gt?.pipeline?.top1Hit ?? null,
    })
  } catch (error: any) {
    const pgCode = (error as { code?: string })?.code
    if (pgCode === '42P01') {
      return NextResponse.json(
        { error: 'historian_sim_runs table not present — apply migration 059 first.' },
        { status: 503 },
      )
    }
    console.error('Historian sim score error:', error)
    return NextResponse.json({ error: error?.message || 'Scoring failed' }, { status: 500 })
  }
}
