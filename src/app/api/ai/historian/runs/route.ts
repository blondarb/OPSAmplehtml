/**
 * GET /api/ai/historian/runs  — R&D "runs dashboard" data source.
 *
 * Reads every historian session (newest first) with EVERYTHING the dashboard
 * needs in one shot, so /rnd/historian can render the full picture:
 *   - the core session row (structured_output, narrative_summary, red_flags,
 *     transcript, duration, question_count, completion status)
 *   - the joined patient (name / mrn) when linked
 *   - the Localizer differential + reasoning. Persisted two ways (see
 *     api/ai/historian/localizer/route.ts): the neurology_consults
 *     localizer_* columns for consult-linked sessions, and — regardless of
 *     consult linkage — historian_localizer_results, keyed by session id
 *     (migration 064). The consult value wins via COALESCE when both
 *     exist; historian_localizer_results fills in standalone sessions
 *     that never got a consult row. historian_localizer_results may not
 *     exist yet (migration 064 applied manually, not on deploy) — the
 *     query fails open to the consult-only columns on Postgres 42P01.
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

// withLocalizerResults selects whether the historian_localizer_results join
// (migration 064) is included. When true, the consult's localizer_* value
// wins over the session-keyed table via COALESCE (a linked consult with a
// live localizer run is the more authoritative source); the session-keyed
// table only fills in when the consult has none — e.g. a standalone
// /patient/historian session with no consult row at all. The caller retries
// with withLocalizerResults=false on Postgres 42P01 if the table doesn't
// exist yet (see queryRunsWithLocalizerFallback below).
function selectColumns(withLocalizerResults: boolean): string {
  const localizerColumns = withLocalizerResults
    ? `
  COALESCE(nc."localizer_differential", hlr."differential") AS localizer_differential,
  COALESCE(nc."localizer_excluded",     hlr."excluded")     AS localizer_excluded,
  COALESCE(nc."localizer_questions",    hlr."questions")    AS localizer_questions,
  COALESCE(nc."localizer_hypothesis",   hlr."hypothesis")   AS localizer_hypothesis,
  COALESCE(nc."localizer_kb_sources",   hlr."kb_sources")   AS localizer_kb_sources,
  COALESCE(nc."localizer_last_run_at",  hlr."last_run_at")  AS localizer_last_run_at,
  COALESCE(nc."localizer_run_count",    hlr."run_count")    AS localizer_run_count`
    : `
  nc."localizer_differential" AS localizer_differential,
  nc."localizer_excluded"     AS localizer_excluded,
  nc."localizer_questions"    AS localizer_questions,
  nc."localizer_hypothesis"   AS localizer_hypothesis,
  nc."localizer_kb_sources"   AS localizer_kb_sources,
  nc."localizer_last_run_at"  AS localizer_last_run_at,
  nc."localizer_run_count"    AS localizer_run_count`

  return `
  hs.*,
  CASE WHEN p."id" IS NOT NULL THEN json_build_object(
    'id', p."id", 'first_name', p."first_name", 'last_name', p."last_name", 'mrn', p."mrn"
  ) ELSE NULL END AS patient,
  nc."id"                     AS consult_id,${localizerColumns}
`
}

function localizerJoin(withLocalizerResults: boolean): string {
  return withLocalizerResults
    ? `LEFT JOIN "neurology_consults" nc ON nc."historian_session_id" = hs."id"
      LEFT JOIN "historian_localizer_results" hlr ON hlr."session_id" = hs."id"::text`
    : `LEFT JOIN "neurology_consults" nc ON nc."historian_session_id" = hs."id"`
}

// historian_localizer_results (migration 064) is applied manually by Steve
// with psql, never automatically on deploy — so the join above may 404 as
// Postgres 42P01 (undefined_table) in any environment where it hasn't run
// yet. Retry once with the join dropped rather than failing the whole
// dashboard; any other error still propagates.
async function queryRunsWithLocalizerFallback(
  pool: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  buildSql: (withLocalizerResults: boolean) => string,
  values: unknown[],
): Promise<{ rows: Record<string, unknown>[] }> {
  try {
    return await pool.query(buildSql(true), values)
  } catch (err: unknown) {
    if ((err as { code?: string } | undefined)?.code === '42P01') {
      console.info(
        '[historian/runs] historian_localizer_results not available yet (migration 064 not applied) — falling back to consult-only localizer columns',
      )
      return await pool.query(buildSql(false), values)
    }
    throw err
  }
}

function normaliseRow(row: Record<string, unknown>): Record<string, any> {
  return {
    ...row,
    structured_output: coerceJson(row.structured_output),
    red_flags: coerceJson(row.red_flags) ?? [],
    transcript: coerceJson(row.transcript) ?? [],
    localizer_differential: coerceJson(row.localizer_differential) ?? [],
    localizer_excluded: coerceJson(row.localizer_excluded) ?? [],
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
      const buildSql = (withLocalizerResults: boolean) => `
        SELECT ${selectColumns(withLocalizerResults)}
        FROM "historian_sessions" hs
        LEFT JOIN "patients" p ON p."id" = hs."patient_id"
        ${localizerJoin(withLocalizerResults)}
        WHERE hs."id" = $1
        LIMIT 1
      `
      const { rows } = await queryRunsWithLocalizerFallback(pool, buildSql, [id])
      if (rows.length === 0) {
        return NextResponse.json({ error: 'Run not found' }, { status: 404 })
      }
      const run = normaliseRow(rows[0])

      // Attach the on-demand review artifacts (physician summary + lean
      // thoroughness, both keyed by session id in historian_evaluations) and
      // the human review feedback. Each in its own try/catch: these tables may
      // not exist yet (migrations 058/065), which must not break the run fetch.
      try {
        const { rows: evalRows } = await pool.query(
          `SELECT DISTINCT ON (evaluator) evaluator, result, created_at
           FROM historian_evaluations
           WHERE session_id = $1 AND evaluator IN ('physician_summary', 'thoroughness_lean')
           ORDER BY evaluator, created_at DESC`,
          [id],
        )
        for (const r of evalRows) {
          if (r.evaluator === 'physician_summary') run.physician_summary = coerceJson(r.result)
          if (r.evaluator === 'thoroughness_lean') run.thoroughness = coerceJson(r.result)
        }
      } catch (err: any) {
        if (err?.code !== '42P01') console.error('[runs] evaluations join failed (non-fatal):', err?.message || err)
      }

      try {
        const { rows: fbRows } = await pool.query(
          `SELECT section, verdict, notes, reviewer, updated_at
           FROM historian_review_feedback
           WHERE session_id = $1
           ORDER BY updated_at DESC`,
          [id],
        )
        run.review_feedback = fbRows
      } catch (err: any) {
        run.review_feedback = []
        if (err?.code !== '42P01') console.error('[runs] feedback join failed (non-fatal):', err?.message || err)
      }

      return NextResponse.json({ run })
    }

    const conditions: string[] = []
    const values: unknown[] = []
    if (tenant) {
      values.push(tenant)
      conditions.push(`hs."tenant_id" = $${values.length}`)
    }
    values.push(limit)

    const buildSql = (withLocalizerResults: boolean) => `
      SELECT ${selectColumns(withLocalizerResults)}
      FROM "historian_sessions" hs
      LEFT JOIN "patients" p ON p."id" = hs."patient_id"
      ${localizerJoin(withLocalizerResults)}
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY hs."created_at" DESC
      LIMIT $${values.length}
    `
    const { rows } = await queryRunsWithLocalizerFallback(pool, buildSql, values)
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
