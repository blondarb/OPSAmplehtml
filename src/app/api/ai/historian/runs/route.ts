/**
 * GET /api/ai/historian/runs  — R&D "runs dashboard" data source.
 *
 * Reads every historian session (newest first) with EVERYTHING the dashboard
 * needs in one shot, so /rnd/historian can render the full picture:
 *   - the core session row (structured_output, narrative_summary, red_flags,
 *     transcript, duration, question_count, completion status)
 *   - the joined patient (name / mrn) when linked
 *   - the Localizer differential + reasoning, joined from neurology_consults
 *     (localizer_* columns), which is where the differential is persisted for
 *     consult-linked sessions (see api/ai/historian/localizer/route.ts).
 *
 * Query params:
 *   ?id=<uuid>    — return a single run (full detail incl. transcript)
 *   ?tenant_id=x  — restrict to one tenant (default: all tenants — this is an
 *                   internal R&D surface and "show me all the data" is the point)
 *   ?limit=N      — cap rows (default 200)
 *
 * NOTE: this is an internal R&D endpoint over pre-production (non-real) data.
 * It is deliberately not tenant-scoped by default. Add auth/tenant scoping
 * before it ever sees real PHI.
 */

import { NextResponse } from 'next/server'

// jsonb columns come back parsed from node-postgres, but localizer_* may have
// been written to text columns via JSON.stringify — normalise both to objects.
function coerceJson<T>(v: unknown): T | null {
  if (v == null) return null
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T
    } catch {
      return null
    }
  }
  return v as T
}

const SELECT_COLUMNS = `
  hs.*,
  CASE WHEN p."id" IS NOT NULL THEN json_build_object(
    'id', p."id", 'first_name', p."first_name", 'last_name', p."last_name", 'mrn', p."mrn"
  ) ELSE NULL END AS patient,
  nc."id"                     AS consult_id,
  nc."localizer_differential" AS localizer_differential,
  nc."localizer_questions"    AS localizer_questions,
  nc."localizer_hypothesis"   AS localizer_hypothesis,
  nc."localizer_kb_sources"   AS localizer_kb_sources,
  nc."localizer_last_run_at"  AS localizer_last_run_at,
  nc."localizer_run_count"    AS localizer_run_count
`

function normaliseRow(row: Record<string, unknown>): Record<string, any> {
  return {
    ...row,
    structured_output: coerceJson(row.structured_output),
    red_flags: coerceJson(row.red_flags) ?? [],
    transcript: coerceJson(row.transcript) ?? [],
    localizer_differential: coerceJson(row.localizer_differential) ?? [],
    localizer_questions: coerceJson(row.localizer_questions) ?? [],
    localizer_kb_sources: coerceJson(row.localizer_kb_sources) ?? [],
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const tenant = searchParams.get('tenant_id')
    const limit = Math.min(Number(searchParams.get('limit')) || 200, 1000)

    const { getPool } = await import('@/lib/db')
    const pool = await getPool()

    if (id) {
      const sql = `
        SELECT ${SELECT_COLUMNS}
        FROM "historian_sessions" hs
        LEFT JOIN "patients" p ON p."id" = hs."patient_id"
        LEFT JOIN "neurology_consults" nc ON nc."historian_session_id" = hs."id"
        WHERE hs."id" = $1
        LIMIT 1
      `
      const { rows } = await pool.query(sql, [id])
      if (rows.length === 0) {
        return NextResponse.json({ error: 'Run not found' }, { status: 404 })
      }
      return NextResponse.json({ run: normaliseRow(rows[0]) })
    }

    const conditions: string[] = []
    const values: unknown[] = []
    if (tenant) {
      values.push(tenant)
      conditions.push(`hs."tenant_id" = $${values.length}`)
    }
    values.push(limit)

    const sql = `
      SELECT ${SELECT_COLUMNS}
      FROM "historian_sessions" hs
      LEFT JOIN "patients" p ON p."id" = hs."patient_id"
      LEFT JOIN "neurology_consults" nc ON nc."historian_session_id" = hs."id"
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY hs."created_at" DESC
      LIMIT $${values.length}
    `
    const { rows } = await pool.query(sql, values)
    const runs = (rows || []).map(normaliseRow)

    // Aggregate metrics — computed here so the dashboard renders instantly.
    const total = runs.length
    const completed = runs.filter((r) => r.interview_completion_status === 'complete').length
    const endedEarly = runs.filter((r) => r.interview_completion_status === 'ended_early').length
    const withRedFlags = runs.filter((r) => Array.isArray(r.red_flags) && r.red_flags.length > 0).length
    const withDifferential = runs.filter(
      (r) =>
        (Array.isArray(r.localizer_differential) && r.localizer_differential.length > 0) ||
        (Array.isArray(r.final_differential?.differential) && r.final_differential.differential.length > 0),
    ).length
    const escalated = runs.filter((r) => r.safety_escalated).length

    const qCounts = runs.map((r) => Number(r.question_count) || 0)
    const durations = runs.map((r) => Number(r.duration_seconds) || 0)
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

    // Question-count histogram (buckets of 5) — makes the "cuts off ~Q14"
    // pattern visible as data instead of anecdote.
    const histogram: Record<string, number> = {}
    for (const q of qCounts) {
      const lo = Math.floor(q / 5) * 5
      const key = `${lo}-${lo + 4}`
      histogram[key] = (histogram[key] || 0) + 1
    }

    return NextResponse.json({
      runs,
      metrics: {
        total,
        completed,
        ended_early: endedEarly,
        completion_rate: total ? Math.round((completed / total) * 100) : 0,
        with_red_flags: withRedFlags,
        with_differential: withDifferential,
        safety_escalated: escalated,
        avg_question_count: Math.round(avg(qCounts) * 10) / 10,
        max_question_count: qCounts.length ? Math.max(...qCounts) : 0,
        avg_duration_seconds: Math.round(avg(durations)),
        question_count_histogram: histogram,
      },
    })
  } catch (error: any) {
    console.error('Historian runs API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch historian runs' },
      { status: 500 },
    )
  }
}
