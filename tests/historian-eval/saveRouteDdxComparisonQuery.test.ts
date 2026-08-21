import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Covers (1) the physician-only Cognito auth gate on GET
 * /api/ai/historian/save (review fix, 2026-07-21 — this endpoint returned
 * patient names, MRNs, full transcripts, and both differentials to ANY
 * caller, no auth check at all, despite already importing getUser) and (2)
 * the Historian Validation Suite Task 4 enrichment of the session-list
 * query: a LEFT JOIN LATERAL against historian_evaluations (migration 058)
 * pulls each session's latest independent_ddx/agreement rows alongside the
 * existing patient join. Unlike final_differential (a plain column on
 * historian_sessions, picked up for free by `SELECT hs.*` even before its
 * migration is applied), a JOIN against a table that doesn't exist yet is a
 * hard SQL error — so this suite also covers the fail-open fallback: try the
 * enriched query first, and on a 42P01 (relation does not exist — migration
 * 058 not applied), fall back to the base query so the session list keeps
 * working exactly as it did before Task 4.
 *
 * save/route.ts pulls in a wider dependency graph (cognito/server, tenant,
 * db-query, consult/pipeline, notifications, and all three eval modules) —
 * all mocked here, mirroring saveRouteIntegrityCheck.test.ts's pattern,
 * even though GET only actually exercises @/lib/cognito/server, @/lib/db,
 * and @/lib/tenant, since importing the route module evaluates every
 * top-level import regardless of which handler is invoked.
 */
const { queryMock, getPoolMock, authorizeClinicalAccessMock } = vi.hoisted(() => {
  const queryMock = vi.fn()
  const getPoolMock = vi.fn(async () => ({ query: queryMock }))
  const authorizeClinicalAccessMock = vi.fn()
  return { queryMock, getPoolMock, authorizeClinicalAccessMock }
})

const AUTHED_USER = { id: 'physician-1', email: 'physician@test.com' }

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/db-query', () => ({ from: vi.fn() }))
vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeClinicalAccessMock,
  clinicalAccessDeniedMessage: (reason: string) =>
    reason === 'unauthenticated' ? 'Please sign in to continue.' : 'Access denied.',
}))
vi.mock('@/lib/tenant', () => ({ getTenantServer: () => 'test-tenant' }))
vi.mock('@/lib/consult/pipeline', () => ({ linkHistorianToConsult: vi.fn() }))
vi.mock('@/lib/notifications', () => ({ notifyHistorianRedFlag: vi.fn() }))
vi.mock('@/lib/historian/eval/finalDifferential', () => ({ runFinalDifferential: vi.fn() }))
vi.mock('@/lib/historian/eval/thoroughnessJudge', () => ({ runThoroughnessJudge: vi.fn() }))
vi.mock('@/lib/historian/eval/independentDdx', () => ({ runIndependentDdxAndAgreement: vi.fn() }))

import { GET } from '@/app/api/ai/historian/save/route'

function getSessions() {
  const request = new Request('http://historian.test/api/ai/historian/save?tenant_id=test-tenant')
  return GET(request)
}

const SAMPLE_SESSION_ROW = {
  id: 'session-1',
  tenant_id: 'test-tenant',
  patient_name: 'Test Patient',
  patient: null,
  independent_ddx: { differential: [{ diagnosis: 'Migraine' }], summary: 's' },
  agreement: { top1Match: true, top3Overlap: 1, jaccardTop3: 1, matchedPairs: [], disagreements: [] },
}

describe('GET /api/ai/historian/save — auth gate', () => {
  beforeEach(() => {
    queryMock.mockReset()
    authorizeClinicalAccessMock.mockReset()
  })

  it('returns 401 and touches the database not at all when no user is authenticated', async () => {
    authorizeClinicalAccessMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const res = await getSessions()
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toMatch(/sign in/i)
    expect(getPoolMock).not.toHaveBeenCalled()
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('returns the enriched session list when a physician is authenticated', async () => {
    authorizeClinicalAccessMock.mockResolvedValueOnce({
      ok: true,
      context: { userId: AUTHED_USER.id, email: AUTHED_USER.email, tenantId: 'test-tenant', role: 'clinician' },
    })
    queryMock.mockResolvedValueOnce({ rows: [SAMPLE_SESSION_ROW] })

    const res = await getSessions()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.sessions[0].independent_ddx).toEqual(SAMPLE_SESSION_ROW.independent_ddx)
  })
})

describe('GET /api/ai/historian/save — independent_ddx/agreement enrichment', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    queryMock.mockReset()
    authorizeClinicalAccessMock.mockReset()
    authorizeClinicalAccessMock.mockResolvedValue({
      ok: true,
      context: { userId: AUTHED_USER.id, email: AUTHED_USER.email, tenantId: 'test-tenant', role: 'clinician' },
    })
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    infoSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('returns sessions enriched with independent_ddx/agreement when historian_evaluations exists', async () => {
    queryMock.mockResolvedValueOnce({ rows: [SAMPLE_SESSION_ROW] })

    const res = await getSessions()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(queryMock).toHaveBeenCalledTimes(1)
    expect(body.sessions[0].independent_ddx).toEqual(SAMPLE_SESSION_ROW.independent_ddx)
    expect(body.sessions[0].agreement).toEqual(SAMPLE_SESSION_ROW.agreement)

    const enrichedSql = queryMock.mock.calls[0][0] as string
    expect(enrichedSql).toContain('historian_evaluations')
    expect(enrichedSql).toContain('historian_eval_jobs')
    expect(enrichedSql).toContain('evaluation_status')
    expect(enrichedSql).toContain("evaluator = 'independent_ddx'")
    expect(enrichedSql).toContain("evaluator = 'agreement'")
  })

  it('falls back to the base query and still returns sessions when historian_evaluations does not exist yet (42P01)', async () => {
    queryMock.mockRejectedValueOnce(
      Object.assign(new Error('relation "historian_eval_jobs" does not exist'), { code: '42P01' }),
    )
    queryMock.mockRejectedValueOnce(
      Object.assign(new Error('relation "historian_evaluations" does not exist'), { code: '42P01' }),
    )
    const baseRow = { id: 'session-2', tenant_id: 'test-tenant', patient: null }
    queryMock.mockResolvedValueOnce({ rows: [baseRow] })

    const res = await getSessions()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(queryMock).toHaveBeenCalledTimes(3)
    expect(body.sessions).toEqual([baseRow])

    // The fallback query must NOT reference historian_evaluations at all.
    const fallbackSql = queryMock.mock.calls[2][0] as string
    expect(fallbackSql).not.toContain('historian_evaluations')

    expect(infoSpy).toHaveBeenCalledTimes(2)
    expect(infoSpy.mock.calls[1].join(' ')).toMatch(/migration 058 not applied/i)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('keeps evaluator results available when only the newer job table is missing', async () => {
    queryMock.mockRejectedValueOnce(
      Object.assign(new Error('relation "historian_eval_jobs" does not exist'), { code: '42P01' }),
    )
    queryMock.mockResolvedValueOnce({ rows: [SAMPLE_SESSION_ROW] })

    const res = await getSessions()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(queryMock).toHaveBeenCalledTimes(2)
    const legacyEnrichedSql = queryMock.mock.calls[1][0] as string
    expect(legacyEnrichedSql).toContain('historian_evaluations')
    expect(legacyEnrichedSql).not.toContain('historian_eval_jobs')
    expect(legacyEnrichedSql).not.toContain('job.status')
    expect(body.sessions[0].independent_ddx).toEqual(SAMPLE_SESSION_ROW.independent_ddx)
  })

  it('surfaces a genuine (non-42P01) DB error as a 500, without attempting the fallback query', async () => {
    queryMock.mockRejectedValueOnce(
      Object.assign(new Error('connection terminated unexpectedly'), { code: '57P01' }),
    )

    const res = await getSessions()
    expect(res.status).toBe(500)
    expect(queryMock).toHaveBeenCalledTimes(1)
  })
})
