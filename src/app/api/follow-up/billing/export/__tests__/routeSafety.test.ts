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

import { GET } from '../route'

function request(query = 'month=2026-07&format=csv') {
  return new Request(`http://localhost/api/follow-up/billing/export?${query}`)
}

describe('follow-up billing export safety boundary', () => {
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
    queryMock.mockResolvedValue({
      rows: [
        {
          patient_name: '=HYPERLINK("https://attacker.invalid")',
          service_date: '2026-07-11',
          program: 'ccm',
          cpt_code: '99490',
          cpt_rate: 37.07,
          prep_minutes: 2,
          call_minutes: 10,
          documentation_minutes: 5,
          coordination_minutes: 5,
          total_minutes: 22,
          meets_threshold: true,
          billing_status: 'ready_to_bill',
          reviewed_by: 'clinician-1',
          notes: '+CMD',
        },
      ],
    })
  })

  it('rejects unauthenticated export before database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('tenant-scopes export rows and neutralizes spreadsheet formulas', async () => {
    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('JOIN followup_sessions'),
      ['tenant-1', '2026-07'],
    )
    const csv = await response.text()
    expect(csv).toContain("'=HYPERLINK")
    expect(csv).toContain("'+CMD")
    expect(csv).not.toContain('\n=HYPERLINK')
  })

  it('rejects invalid month and format values before database access', async () => {
    const response = await GET(request('month=2026-99%0d%0aX-Test%3Ayes&format=html'))

    expect(response.status).toBe(400)
    expect(getPoolMock).not.toHaveBeenCalled()
  })
})
