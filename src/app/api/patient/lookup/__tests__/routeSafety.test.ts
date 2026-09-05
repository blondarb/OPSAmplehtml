import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, getPoolMock, queryMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(), getPoolMock: vi.fn(), queryMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({ authorizeClinicalAccess: authorizeMock, clinicalAccessDeniedMessage: () => 'Access denied' }))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { GET } from '../route'

describe('patient lookup route safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue({ ok: true, context: { tenantId: 'tenant-a', userId: 'clinician-1', email: 'clinician@example.test', role: 'clinician' } })
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock.mockResolvedValue({ rows: [] })
  })

  it('rejects unauthenticated requests before database access', async () => {
    authorizeMock.mockResolvedValueOnce({ ok: false, status: 401, reason: 'unauthenticated' })
    expect((await GET(new Request('http://localhost/api/patient/lookup?name=Synthetic+Name&dob=2000-01-01'))).status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('fails closed when authorization is unavailable before database access', async () => {
    authorizeMock.mockResolvedValueOnce({ ok: false, status: 503, reason: 'authorization_unavailable' })
    expect((await GET(new Request('http://localhost/api/patient/lookup?name=Synthetic+Name&dob=2000-01-01'))).status).toBe(503)
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('rejects conflicting caller tenant without database access', async () => {
    expect((await GET(new Request('http://localhost/api/patient/lookup?name=Synthetic+Name&dob=2000-01-01&tenant_id=tenant-b'))).status).toBe(403)
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it.each(['Synthetic', 'Synthetic Name', 'Synthetic Name&dob=2000-02-30'])('requires a full name and valid ISO calendar date: %s', async (name) => {
    const url = name.includes('&dob=')
      ? `http://localhost/api/patient/lookup?name=${encodeURIComponent(name.split('&')[0])}&${name.split('&')[1]}`
      : `http://localhost/api/patient/lookup?name=${encodeURIComponent(name)}`
    expect((await GET(new Request(url))).status).toBe(400)
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('uses exact tenant-bound full-name and DOB matching with a duplicate count', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'patient-a', first_name: 'Synthetic', last_name: 'Name', match_count: 1 }] })
    const response = await GET(new Request('http://localhost/api/patient/lookup?name=Synthetic%20Name&dob=2000-01-01'))
    expect(response.status).toBe(200)
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("LOWER(CONCAT_WS(' ', first_name, last_name)) = LOWER($2)"), ['tenant-a', 'Synthetic Name', '2000-01-01'])
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('LIMIT 2'), expect.any(Array))
    await expect(response.json()).resolves.toMatchObject({ patient_id: 'patient-a' })
  })

  it('does not choose an arbitrary patient when duplicates exist', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'patient-a', match_count: 2 }, { id: 'patient-b', match_count: 2 }] })
    const response = await GET(new Request('http://localhost/api/patient/lookup?name=Synthetic%20Name&dob=2000-01-01'))
    await expect(response.json()).resolves.toMatchObject({ patient_id: null })
  })
})
