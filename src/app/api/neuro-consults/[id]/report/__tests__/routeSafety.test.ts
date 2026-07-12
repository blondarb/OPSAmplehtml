import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appendAssessmentAndPlanMock,
  authorizeMock,
  buildConsultReportMock,
  generateAssessmentAndPlanMock,
  getConsultMock,
  getPoolMock,
  queryMock,
} = vi.hoisted(() => ({
  appendAssessmentAndPlanMock: vi.fn(),
  authorizeMock: vi.fn(),
  buildConsultReportMock: vi.fn(),
  generateAssessmentAndPlanMock: vi.fn(),
  getConsultMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/consult/pipeline', () => ({ getConsult: getConsultMock }))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/consult/report', () => ({
  appendAssessmentAndPlan: appendAssessmentAndPlanMock,
  buildConsultReport: buildConsultReportMock,
  generateAssessmentAndPlan: generateAssessmentAndPlanMock,
}))

import { GET, POST } from '../route'

const context = { params: Promise.resolve({ id: 'consult-1' }) }
const access = {
  ok: true as const,
  context: {
    userId: 'clinician-1',
    email: 'clinician@example.test',
    tenantId: 'tenant-1',
    role: 'clinician' as const,
  },
}
const safeTriageState = {
  care_pathway: 'expedited_outpatient',
  data_quality: 'sufficient',
  coverage_status: 'complete',
  review_requirement: 'none',
  workflow_status: 'decision_ready',
  scheduling_locked: false,
  reviewed_at: new Date('2026-07-11T09:00:00.000Z'),
  reviewed_by: 'reviewer-1',
  final_care_pathway: 'expedited_outpatient',
  final_triage_tier: 'urgent',
  open_critical_clarifications: 0,
  open_emergency_actions: 0,
  reviewer_authorized: true,
}

describe('consult report access and safety finalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue(access)
    getConsultMock.mockResolvedValue({
      id: 'consult-1',
      tenant_id: 'tenant-1',
      triage_session_id: 'triage-1',
      historian_structured_output: null,
    })
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('reviewer_authorized')) {
        return { rows: [safeTriageState], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO consult_reports')) {
        return { rows: [{ id: 'report-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM consult_reports')) {
        return {
          rows: [
            {
              id: 'report-1',
              report_data: { generated_at: '2026-07-11T09:05:00.000Z' },
            },
          ],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 0 }
    })
    buildConsultReportMock.mockReturnValue({
      generated_at: '2026-07-11T09:05:00.000Z',
    })
    generateAssessmentAndPlanMock.mockResolvedValue({
      assessment: '',
      plan: '',
    })
    appendAssessmentAndPlanMock.mockImplementation((report) => report)
  })

  it('rejects an unauthorized report mutation before consult or database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await POST(new Request('http://localhost') as never, context)

    expect(response.status).toBe(401)
    expect(getConsultMock).not.toHaveBeenCalled()
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it.each([
    {
      state: {
        ...safeTriageState,
        care_pathway: 'emergency_now',
        final_care_pathway: 'emergency_now',
        workflow_status: 'emergency_hold',
        scheduling_locked: true,
        review_requirement: 'emergency_action',
      },
      reason: 'emergency hold',
    },
    {
      state: { ...safeTriageState, final_triage_tier: 'emergent' },
      reason: 'emergent final tier',
    },
    {
      state: { ...safeTriageState, reviewer_authorized: false },
      reason: 'revoked reviewer',
    },
    {
      state: { ...safeTriageState, open_emergency_actions: 1 },
      reason: 'open emergency action',
    },
    {
      state: { ...safeTriageState, final_triage_tier: 'routine' },
      reason: 'tier and care-path mismatch',
    },
  ])('blocks report completion for $reason', async ({ state }) => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('reviewer_authorized')) {
        return { rows: [state], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    })

    const response = await POST(new Request('http://localhost') as never, context)

    expect(response.status).toBe(409)
    expect(buildConsultReportMock).not.toHaveBeenCalled()
    expect(generateAssessmentAndPlanMock).not.toHaveBeenCalled()
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO consult_reports'),
      ),
    ).toBe(false)
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE neurology_consults'),
      ),
    ).toBe(false)
  })

  it('tenant-scopes report persistence and consult completion after safe final review', async () => {
    const response = await POST(new Request('http://localhost') as never, context)
    const payload = await response.clone().json()

    expect(response.status, JSON.stringify(payload)).toBe(200)
    expect(getConsultMock).toHaveBeenCalledWith('consult-1', 'tenant-1')

    const finalizeCall = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO consult_reports'),
    )
    expect(String(finalizeCall?.[0])).toContain('tenant_id = $2')
    expect(String(finalizeCall?.[0])).toContain('UPDATE neurology_consults')
    expect(String(finalizeCall?.[0])).toContain(
      "ts.final_care_pathway = 'expedited_outpatient'",
    )
    expect(String(finalizeCall?.[0])).toContain(
      "ts.final_care_pathway = 'routine_outpatient'",
    )
    expect(finalizeCall?.[1]).toEqual([
      'consult-1',
      'tenant-1',
      'draft',
      JSON.stringify({ generated_at: '2026-07-11T09:05:00.000Z' }),
      '2026-07-11T09:05:00.000Z',
    ])
  })

  it('tenant-scopes report reads and rejects unauthorized callers', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: 'forbidden',
    })
    const denied = await GET(new Request('http://localhost') as never, context)
    expect(denied.status).toBe(403)
    expect(getConsultMock).not.toHaveBeenCalled()

    authorizeMock.mockResolvedValueOnce(access)
    const allowed = await GET(new Request('http://localhost') as never, context)
    expect(allowed.status).toBe(200)
    expect(getConsultMock).toHaveBeenCalledWith('consult-1', 'tenant-1')
    const reportRead = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('FROM consult_reports'),
    )
    expect(String(reportRead?.[0])).toContain('tenant_id = $2')
    expect(reportRead?.[1]).toEqual(['consult-1', 'tenant-1'])
  })

  it('sanitizes internal report failures', async () => {
    getConsultMock.mockRejectedValueOnce(
      new Error('postgres://internal-user:secret@db.example.test'),
    )

    const response = await POST(new Request('http://localhost') as never, context)
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'Failed to generate consult report' })
    expect(JSON.stringify(payload)).not.toContain('secret')
  })
})
