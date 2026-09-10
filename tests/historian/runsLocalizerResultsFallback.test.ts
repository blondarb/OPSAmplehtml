import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Covers the historian_localizer_results join added to
 * src/app/api/ai/historian/runs/route.ts so the R&D runs dashboard shows
 * live-localizer signal for standalone /patient/historian sessions (no
 * neurology_consults row), not just consult-linked ones (see migration
 * 064 and localizerSessionPersistence.test.ts for the write side).
 *
 * historian_localizer_results is applied manually by Steve with psql, not
 * automatically on deploy, so the join must fail open: a Postgres 42P01
 * (undefined_table) on the joined query retries once with the join
 * dropped, and any other error still surfaces as a 500 without retrying.
 */
const { queryMock, getPoolMock } = vi.hoisted(() => {
  const queryMock = vi.fn()
  const getPoolMock = vi.fn(async () => ({ query: queryMock }))
  return { queryMock, getPoolMock }
})

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { GET } from '@/app/api/ai/historian/runs/route'

const SAMPLE_ROW = {
  id: 'session-1',
  structured_output: null,
  red_flags: null,
  transcript: null,
  interview_completion_status: 'complete',
  question_count: 5,
  duration_seconds: 100,
  safety_escalated: false,
  final_differential: null,
  patient: null,
  consult_id: null,
  localizer_differential: JSON.stringify([{ diagnosis: 'Synthetic diagnosis' }]),
  localizer_excluded: '[]',
  localizer_questions: '[]',
  localizer_hypothesis: null,
  localizer_kb_sources: '[]',
  localizer_last_run_at: null,
  localizer_run_count: 1,
}

const undefinedTableError = () =>
  Object.assign(new Error('relation "historian_localizer_results" does not exist'), { code: '42P01' })

function req(url: string) {
  return new Request(url)
}

beforeEach(() => {
  queryMock.mockReset()
  getPoolMock.mockClear()
})

describe('runs route — historian_localizer_results join fallback', () => {
  it('includes the hlr join and COALESCE columns on the happy path', async () => {
    queryMock.mockResolvedValueOnce({ rows: [SAMPLE_ROW] })

    const res = await GET(req('http://historian.test/api/ai/historian/runs'))
    expect(res.status).toBe(200)

    expect(queryMock).toHaveBeenCalledTimes(1)
    const sql = queryMock.mock.calls[0][0]
    expect(sql).toContain('LEFT JOIN "historian_localizer_results" hlr ON hlr."session_id" = hs."id"::text')
    expect(sql).toContain('COALESCE(nc."localizer_differential", hlr."differential") AS localizer_differential')
    expect(sql).toContain('COALESCE(nc."localizer_run_count",    hlr."run_count")    AS localizer_run_count')
  })

  it('falls back to the consult-only query on 42P01 for the list endpoint and returns the same shape', async () => {
    queryMock
      .mockRejectedValueOnce(undefinedTableError())
      .mockResolvedValueOnce({ rows: [SAMPLE_ROW] })

    const res = await GET(req('http://historian.test/api/ai/historian/runs'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.runs).toHaveLength(1)
    expect(body.runs[0].localizer_differential).toEqual([{ diagnosis: 'Synthetic diagnosis' }])
    expect(body.metrics.with_differential).toBe(1)

    expect(queryMock).toHaveBeenCalledTimes(2)
    expect(queryMock.mock.calls[0][0]).toContain('historian_localizer_results')
    expect(queryMock.mock.calls[1][0]).not.toContain('historian_localizer_results')
    // The rest of the query (consult join, filters) is unchanged on fallback.
    expect(queryMock.mock.calls[1][0]).toContain('LEFT JOIN "neurology_consults" nc')
  })

  it('falls back on 42P01 for the single-run (?id=) endpoint too, with the same shape', async () => {
    queryMock
      .mockRejectedValueOnce(undefinedTableError())
      .mockResolvedValueOnce({ rows: [SAMPLE_ROW] })
      // The ?id= path additionally attaches the on-demand review artifacts:
      // one query for historian_evaluations (physician_summary +
      // thoroughness_lean) and one for historian_review_feedback. Both are
      // best-effort — return empty here.
      .mockResolvedValue({ rows: [] })

    const res = await GET(req('http://historian.test/api/ai/historian/runs?id=session-1'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.run.id).toBe('session-1')
    expect(body.run.localizer_differential).toEqual([{ diagnosis: 'Synthetic diagnosis' }])
    // 4 = localizer(with hlr → 42P01) + localizer(fallback) + evaluations + feedback.
    expect(queryMock).toHaveBeenCalledTimes(4)
    expect(queryMock.mock.calls[1][1]).toEqual(['session-1'])
  })

  it('propagates a non-42P01 error as a 500 without retrying', async () => {
    queryMock.mockRejectedValueOnce(Object.assign(new Error('connection terminated unexpectedly'), { code: '57P01' }))

    const res = await GET(req('http://historian.test/api/ai/historian/runs'))
    expect(res.status).toBe(500)
    expect(queryMock).toHaveBeenCalledTimes(1)
  })
})
