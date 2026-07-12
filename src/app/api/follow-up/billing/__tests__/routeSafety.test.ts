import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, getPoolMock, queryMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { GET, POST } from '../route'

function billingPost(overrides: Record<string, unknown> = {}) {
  return POST(
    new Request('http://localhost/api/follow-up/billing', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'entry-1',
        session_id: 'session-1',
        patient_id: 'attacker-patient',
        patient_name: 'Attacker supplied name',
        service_date: '2026-07-11',
        billing_month: '2026-07',
        program: 'ccm',
        cpt_code: '99490',
        cpt_rate: 999999,
        prep_minutes: 2,
        call_minutes: 10,
        documentation_minutes: 5,
        coordination_minutes: 5,
        billing_status: 'ready_to_bill',
        reviewed_by: 'attacker-reviewer',
        ...overrides,
      }),
    }),
  )
}

describe('follow-up billing safety boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'clinician-1',
        email: 'clinician@example.test',
        tenantId: 'tenant-1',
        role: 'clinician',
      },
    })
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock.mockResolvedValue({ rows: [] })
  })

  it('rejects unauthenticated billing reads before database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await GET(
      new Request('http://localhost/api/follow-up/billing?month=2026-07'),
    )

    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('tenant-scopes billing reads through the authoritative follow-up session', async () => {
    const response = await GET(
      new Request('http://localhost/api/follow-up/billing?month=2026-07'),
    )

    expect(response.status).toBe(200)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('JOIN followup_sessions'),
      ['tenant-1', '2026-07'],
    )
  })

  it('rejects unauthenticated billing writes before parsing or database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await billingPost()

    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('atomically binds updates to a tenant-owned session and server reviewer identity', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'entry-1',
          session_id: 'session-1',
          patient_id: 'patient-1',
          patient_name: 'Authoritative Patient',
          billing_status: 'ready_to_bill',
        },
      ],
    })

    const response = await billingPost()

    expect(response.status).toBe(200)
    const [sql, values] = queryMock.mock.calls[0]
    expect(sql).toContain('JOIN followup_sessions')
    expect(sql).toContain('fs.tenant_id')
    expect(values).toContain('tenant-1')
    expect(values).toContain('clinician-1')
    expect(values).not.toContain('attacker-patient')
    expect(values).not.toContain('Attacker supplied name')
    expect(values).not.toContain('attacker-reviewer')
    expect(values).not.toContain(999999)
  })

  it('rejects invalid time, status, and date inputs before writes', async () => {
    const response = await billingPost({
      prep_minutes: 10000,
      billing_status: 'paid_without_review',
      service_date: 'not-a-date',
    })

    expect(response.status).toBe(400)
    expect(queryMock).not.toHaveBeenCalled()
  })
})
