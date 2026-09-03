/**
 * Historian simulator — on-demand run.
 *
 *   GET  /api/ai/historian/sim/run   → { personas: string[] }  (available fixtures)
 *   POST /api/ai/historian/sim/run   → run ONE persona through the evaluators
 *        body: { persona: string, batchId?: string, batchLabel?: string }
 *        → { batchId, persona, ok, top1Hit, costUsd }
 *
 * ONE persona per request by design: a whole 5-persona batch's Bedrock calls
 * would blow the serverless request budget, so the dashboard button fires
 * these sequentially (one per persona) and shows progress. Each request runs
 * the same evaluators the batch harness does (Sonnet final differential,
 * thoroughness judge, independent 2nd-opinion ddx, agreement, ground-truth
 * scoring) against the persona's fixture transcript, then writes one
 * historian_sim_runs row via persistSimCase.
 *
 * SCOPE: this scores the persona's SCRIPTED transcript — it is not yet the
 * live belief/personality-driven conversation (that needs the synthetic
 * Realtime driver + a durable async job; tracked as a follow-up). Belief +
 * personality still surface on the row (from the persona fixture) for context.
 *
 * Synthetic data only. Internal R&D. Bedrock cost is incurred per run.
 */

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

// Bedrock evaluators can be slow; give the request real headroom.
export const maxDuration = 300

export async function GET() {
  try {
    const { listPersonaFiles } = await import('@/lib/historian/eval/personaFixtures')
    const personas = listPersonaFiles().map((f) => f.replace(/\.json$/, ''))
    return NextResponse.json({ personas })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to list personas', personas: [] },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const personaRaw: unknown = body?.persona
    if (typeof personaRaw !== 'string' || !personaRaw.trim()) {
      return NextResponse.json({ error: 'persona is required' }, { status: 400 })
    }
    const persona = personaRaw.replace(/\.json$/, '').trim()

    const { listPersonaFiles } = await import('@/lib/historian/eval/personaFixtures')
    const available = listPersonaFiles().map((f) => f.replace(/\.json$/, ''))
    if (!available.includes(persona)) {
      return NextResponse.json(
        { error: `Unknown persona "${persona}".`, available },
        { status: 400 },
      )
    }

    const batchId: string = typeof body?.batchId === 'string' && body.batchId ? body.batchId : randomUUID()
    const batchLabel: string | null =
      typeof body?.batchLabel === 'string' && body.batchLabel
        ? body.batchLabel
        : `On-demand ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`

    // Run the persona through the full evaluator pipeline (reuses the tested
    // batch runner). persist:false — we persist to historian_sim_runs here.
    const { DEFAULT_HISTORIAN_EVAL_CASE_RUNNER } = await import('@/lib/historian/eval/cli')
    const outcome = await DEFAULT_HISTORIAN_EVAL_CASE_RUNNER(
      { kind: 'fixture', personaFile: persona },
      { live: true, persist: false },
    )

    const { getPool } = await import('@/lib/db')
    const pool = await getPool()
    const { persistSimCase } = await import('@/lib/historian/eval/persistSimRun')
    await persistSimCase(pool, batchId, batchLabel, outcome as any)

    const gt: any = (outcome as any).groundTruth
    return NextResponse.json({
      batchId,
      persona,
      ok: Boolean((outcome as any).finalDifferential?.ok),
      top1Hit: gt?.pipeline?.top1Hit ?? null,
      costUsd:
        (Number((outcome as any).finalDifferential?.costUsd) || 0) +
        (Number((outcome as any).thoroughness?.costUsd) || 0),
    })
  } catch (error: any) {
    const pgCode = (error as { code?: string })?.code
    if (pgCode === '42P01') {
      return NextResponse.json(
        { error: 'historian_sim_runs table not present — apply migration 059 first.' },
        { status: 503 },
      )
    }
    console.error('Historian sim run API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to run simulator persona' },
      { status: 500 },
    )
  }
}
