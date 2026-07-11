/**
 * Clara voice test — session logging route.
 *
 * Persists one test call to `clara_test_sessions` (migrations/048), mirroring
 * the insert pattern in src/app/api/ai/historian/save/route.ts (same
 * jsonb-array-must-be-pre-stringified gotcha — see CLAUDE.md "Known
 * Gotchas"). Field names mirror sevaro-voice-agent's
 * ConsultClassificationResult so that repo's eval harness can replay/score
 * sessions logged here. R&D-only, synthetic data — never PHI.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { from } from '@/lib/db-query'
import { CLARA_GATE_COOKIE, verifyGateToken } from '@/lib/clara/testGate'

interface LogRequestBody {
  test_label?: string
  turns?: unknown[]
  consultType?: string
  confidence?: number
  rationale?: string
  statLevel?: number | null
  redFlags?: string[]
  urgencyLevel?: string
  needsClarification?: boolean
  clarificationQuestions?: string[]
  routing?: unknown
  gate0Fired?: boolean
  durationSeconds?: number
  metadata?: unknown
}

/** True for a Postgres "relation does not exist" error (undefined_table). */
function isUndefinedTableError(error: { code?: string; message: string } | null): boolean {
  return error?.code === '42P01' || /relation .* does not exist/i.test(error?.message || '')
}

/**
 * GET /api/ai/clara/log — lists recent test sessions (most recent first),
 * for the /rnd/clara/results review page. Full rows including `turns`
 * (each turn's Gate 0 + classification, if any) so the review UI can render
 * decision cards without a second round-trip per session.
 */
export async function GET(request: Request) {
  try {
    const cookieStore = await cookies()
    if (!verifyGateToken(cookieStore.get(CLARA_GATE_COOKIE)?.value)) {
      return NextResponse.json({ error: 'Not authorized for the Clara test surface.' }, { status: 401 })
    }

    const url = new URL(request.url)
    const limitParam = Number(url.searchParams.get('limit'))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50

    const { data, error } = await from('clara_test_sessions').select('*').order('created_at', { ascending: false }).limit(limit)

    if (error) {
      console.error('[clara/log] list error:', error)
      if (isUndefinedTableError(error)) {
        return NextResponse.json(
          { error: 'clara_test_sessions table not found — apply migrations/048_clara_test_sessions.sql before using this route.', sessions: [] },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ sessions: data || [] })
  } catch (error: unknown) {
    console.error('[clara/log] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list Clara test sessions' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    if (!verifyGateToken(cookieStore.get(CLARA_GATE_COOKIE)?.value)) {
      return NextResponse.json({ error: 'Not authorized for the Clara test surface.' }, { status: 401 })
    }

    const body: LogRequestBody = await request.json().catch(() => ({}))
    const turns = Array.isArray(body.turns) ? body.turns : []

    // Pre-stringify jsonb fields — the shared query builder auto-stringifies
    // plain objects but passes arrays through raw (for text[] compat), which
    // breaks jsonb inserts of array-shaped columns. Same fix as
    // historian_sessions.transcript/red_flags.
    const toJSON = (v: unknown) => (v != null ? JSON.stringify(v) : null)

    const { data, error } = await from('clara_test_sessions')
      .insert({
        test_label: body.test_label || null,
        turns: toJSON(turns),
        consult_type: body.consultType || null,
        confidence: typeof body.confidence === 'number' ? body.confidence : null,
        rationale: body.rationale || null,
        stat_level: typeof body.statLevel === 'number' ? body.statLevel : null,
        red_flags: toJSON(body.redFlags || []),
        urgency_level: body.urgencyLevel || null,
        needs_clarification: body.needsClarification || false,
        clarification_questions: toJSON(body.clarificationQuestions || []),
        routing: toJSON(body.routing ?? null),
        gate0_fired: body.gate0Fired || false,
        duration_seconds: typeof body.durationSeconds === 'number' ? body.durationSeconds : null,
        turn_count: turns.length,
        metadata: toJSON(body.metadata ?? null),
      })
      .select()
      .single()

    if (error) {
      console.error('[clara/log] insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ session: data })
  } catch (error: unknown) {
    console.error('[clara/log] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to log Clara test session' },
      { status: 500 },
    )
  }
}
