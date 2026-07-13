/**
 * Clara voice test — feedback route.
 *
 * Human (thumbs up/down) review of individual Clara triage decisions,
 * persisted to `clara_test_feedback` (migrations/049). POST records one
 * verdict; GET lists recent feedback (optionally scoped to one session) for
 * the results/review UI. R&D-only, synthetic data — never PHI.
 *
 * Gated the same way as the other /api/ai/clara/* routes: this sits outside
 * middleware's Cognito check, so it independently re-verifies the Clara
 * test-gate cookie (see src/lib/clara/testGate.ts).
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { from } from '@/lib/db-query'
import { CLARA_GATE_COOKIE, verifyGateToken } from '@/lib/clara/testGate'
import { validConsultTypes } from '@/lib/clara/claraRulebook'

interface FeedbackRequestBody {
  sessionId?: string | null
  turnIndex?: number | null
  consultType?: string
  urgencyLevel?: string
  statLevel?: number | null
  confidence?: number
  rationale?: string
  redFlags?: string[]
  gate0Fired?: boolean
  routingTarget?: string
  verdict?: string
  reason?: string
  correctedConsultType?: string | null
  createdBy?: string
}

/** True for a Postgres "relation does not exist" error (undefined_table). */
function isUndefinedTableError(error: { code?: string; message: string } | null): boolean {
  return error?.code === '42P01' || /relation .* does not exist/i.test(error?.message || '')
}

const PENDING_MIGRATION_MESSAGE =
  'clara_test_feedback table not found — apply migrations/049_clara_test_feedback.sql before using this route.'

async function requireGate(): Promise<NextResponse | null> {
  const cookieStore = await cookies()
  if (!verifyGateToken(cookieStore.get(CLARA_GATE_COOKIE)?.value)) {
    return NextResponse.json({ error: 'Not authorized for the Clara test surface.' }, { status: 401 })
  }
  return null
}

export async function POST(request: Request) {
  try {
    const gateError = await requireGate()
    if (gateError) return gateError

    const body: FeedbackRequestBody = await request.json().catch(() => ({}))

    const verdict = body.verdict
    if (verdict !== 'up' && verdict !== 'down') {
      return NextResponse.json({ error: "verdict must be 'up' or 'down'" }, { status: 400 })
    }

    if (
      body.correctedConsultType &&
      !validConsultTypes.has(body.correctedConsultType as never)
    ) {
      return NextResponse.json(
        { error: `correctedConsultType must be one of: ${[...validConsultTypes].join(', ')}` },
        { status: 400 },
      )
    }

    const toJSON = (v: unknown) => (v != null ? JSON.stringify(v) : null)

    const { data, error } = await from('clara_test_feedback')
      .insert({
        session_id: body.sessionId || null,
        turn_index: typeof body.turnIndex === 'number' ? body.turnIndex : null,
        consult_type: body.consultType || null,
        urgency_level: body.urgencyLevel || null,
        stat_level: typeof body.statLevel === 'number' ? body.statLevel : null,
        confidence: typeof body.confidence === 'number' ? body.confidence : null,
        rationale: body.rationale || null,
        red_flags: toJSON(body.redFlags || []),
        gate0_fired: body.gate0Fired || false,
        routing_target: body.routingTarget || null,
        verdict,
        reason: body.reason || null,
        corrected_consult_type: body.correctedConsultType || null,
        created_by: body.createdBy || null,
      })
      .select()
      .single()

    if (error) {
      console.error('[clara/feedback] insert error:', error)
      if (isUndefinedTableError(error)) {
        return NextResponse.json({ error: PENDING_MIGRATION_MESSAGE, pendingMigration: '049' }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ feedback: data })
  } catch (error: unknown) {
    console.error('[clara/feedback] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to record Clara feedback' },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  try {
    const gateError = await requireGate()
    if (gateError) return gateError

    const url = new URL(request.url)
    const sessionId = url.searchParams.get('sessionId')
    const limitParam = Number(url.searchParams.get('limit'))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 200

    let query = from('clara_test_feedback').select('*').order('created_at', { ascending: false }).limit(limit)
    if (sessionId) {
      query = query.eq('session_id', sessionId)
    }

    const { data, error } = await query

    if (error) {
      console.error('[clara/feedback] list error:', error)
      if (isUndefinedTableError(error)) {
        return NextResponse.json({ error: PENDING_MIGRATION_MESSAGE, pendingMigration: '049', feedback: [] }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ feedback: data || [] })
  } catch (error: unknown) {
    console.error('[clara/feedback] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list Clara feedback' },
      { status: 500 },
    )
  }
}
