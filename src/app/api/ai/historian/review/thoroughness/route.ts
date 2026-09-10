/**
 * POST /api/ai/historian/review/thoroughness — on-demand thoroughness score for
 * a REAL interview on the /rnd/historian dashboard.
 *
 * Body: { sessionId }
 * Returns: { thoroughness: { result, modelId, costUsd } }
 *
 * Uses the LEAN Haiku judge (generateSimThoroughness) — the same one the
 * simulator uses — so the live dashboard renders it with the identical panel
 * and the single call fits the ~30s Amplify gateway. Persisted to
 * historian_evaluations under evaluator='thoroughness_lean' (distinct from the
 * async production 'thoroughness' rows /save writes fire-and-forget).
 *
 * On-demand + Cognito-gated. PHI: never logs transcript text.
 */

import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'

export const maxDuration = 120

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const body = await request.json().catch(() => null)
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
    if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })

    const { getPool } = await import('@/lib/db')
    const pool = await getPool()

    const { loadSessionForReview } = await import('@/lib/historian/review/loadSession')
    const input = await loadSessionForReview(pool, sessionId)
    if (!input) return NextResponse.json({ error: 'session not found' }, { status: 404 })
    if (input.transcript.length < 2) {
      return NextResponse.json({ error: 'transcript too short to score' }, { status: 422 })
    }

    const started = Date.now()
    const { generateSimThoroughness } = await import('@/lib/historian/sim/simThoroughness')
    const { result, modelId, costUsd } = await generateSimThoroughness(input.transcript, input.chiefComplaint)

    try {
      const { persistEvaluation } = await import('@/lib/historian/eval/persistEvaluation')
      await persistEvaluation({
        sessionId,
        evaluator: 'thoroughness_lean',
        modelId,
        promptVersion: 'review-thoroughness-lean-v1',
        inferenceParams: { temperature: 0 },
        result,
        usage: {},
        latencyMs: Date.now() - started,
      })
    } catch (err) {
      console.error('[review/thoroughness] persist failed (non-fatal) for session', sessionId, err)
    }

    return NextResponse.json({ thoroughness: { result, modelId, costUsd } })
  } catch (error: any) {
    console.error('Historian review/thoroughness error:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'Thoroughness failed' }, { status: 500 })
  }
}
