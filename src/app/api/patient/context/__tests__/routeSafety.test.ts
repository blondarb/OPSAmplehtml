import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, getPoolMock, queryMock, rpcMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/db-query', () => ({ rpc: rpcMock }))

import { GET } from '../route'

function callGet(patientId = 'patient-1') {
  return GET(
    new Request(
      `http://localhost/api/patient/context?patient_id=${patientId}`,
    ),
  )
}

describe('patient context route safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'viewer-1',
        email: 'viewer@example.test',
        tenantId: 'tenant-1',
        role: 'viewer',
      },
    })
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock.mockResolvedValue({ rows: [{ id: 'patient-1' }] })
    rpcMock.mockResolvedValue({
      data: [{ patient_name: 'Synthetic Patient' }],
      error: null,
    })
  })

  it('rejects unauthenticated access before resolving patient context', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await callGet()

    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects a patient ID outside the authoritative tenant', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })

    const response = await callGet('other-tenant-patient')

    expect(response.status).toBe(404)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      ['other-tenant-patient', 'tenant-1'],
    )
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
