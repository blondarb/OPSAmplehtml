/**
 * POST /api/ai/historian/review/summary — on-demand physician summary for a
 * REAL interview on the /rnd/historian dashboard.
 *
 * Body: { sessionId }
 * Returns: { physician_summary: SimPhysicianSummary }
 *
 * Generates the in-depth physician summary (one-liner + HPI + assessment +
 * workup) with the SAME generator the AI-to-AI simulator uses, so the live
 * dashboard renders it with the identical panel. Persisted to
 * historian_evaluations (evaluator='physician_summary') so it survives a reload
 * and is re-readable without regenerating.
 *
 * On-demand (a reviewer clicks "Generate review") — real patient history only
 * runs through Bedrock when a human chooses to review it. Cognito-gated. A
 * single Bedrock call, so it fits the ~30s Amplify gateway. PHI: never logs
 * transcript text.
 */

import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { BEDROCK_MODEL } from '@/lib/bedrock'

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
      return NextResponse.json({ error: 'transcript too short to summarize' }, { status: 422 })
    }

    const started = Date.now()
    const { generateSimPhysicianSummary } = await import('@/lib/historian/sim/simPhysicianSummary')
    const physicianSummary = await generateSimPhysicianSummary(
      input.transcript,
      input.differential,
      input.chiefComplaint,
    )

    // Persist (non-fatal) so a reload re-reads it without regenerating.
    try {
      const { persistEvaluation } = await import('@/lib/historian/eval/persistEvaluation')
      await persistEvaluation({
        sessionId,
        evaluator: 'physician_summary',
        modelId: BEDROCK_MODEL,
        promptVersion: 'review-summary-v1',
        inferenceParams: { temperature: 0 },
        result: physicianSummary,
        usage: {},
        latencyMs: Date.now() - started,
      })
    } catch (err) {
      console.error('[review/summary] persist failed (non-fatal) for session', sessionId, err)
    }

    return NextResponse.json({ physician_summary: physicianSummary })
  } catch (error: any) {
    console.error('Historian review/summary error:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'Summary failed' }, { status: 500 })
  }
}
