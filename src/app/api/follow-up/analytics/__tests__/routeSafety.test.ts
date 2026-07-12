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

function request(query = 'from=2026-07-01T00:00:00.000Z&to=2026-07-11T00:00:00.000Z') {
  return new Request(`http://localhost/api/follow-up/analytics?${query}`)
}

describe('follow-up analytics safety boundary', () => {
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
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
  })

  it('rejects unauthenticated analytics access before database reads', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('tenant-scopes sessions, billing, and escalation analytics', async () => {
    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(queryMock).toHaveBeenCalledTimes(3)
    for (const call of queryMock.mock.calls) {
      expect(call[1][0]).toBe('tenant-1')
    }
    expect(queryMock.mock.calls[1][0]).toContain('JOIN followup_sessions')
    expect(queryMock.mock.calls[2][0]).toContain('JOIN followup_sessions')
  })

  it('rejects invalid or unbounded date ranges', async () => {
    const response = await GET(
      request('from=2020-01-01T00:00:00.000Z&to=2026-07-11T00:00:00.000Z'),
    )

    expect(response.status).toBe(400)
    expect(getPoolMock).not.toHaveBeenCalled()
  })
})
