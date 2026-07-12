import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, rpcMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db-query', () => ({ rpc: rpcMock }))

import { GET } from '../route'

function listPatients() {
  return (GET as unknown as (request: Request) => Promise<Response>)(
    new Request(
      'http://localhost/api/patient/patients?tenant_id=attacker-tenant',
    ),
  )
}

describe('patient portal patient-list boundary', () => {
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
    rpcMock.mockResolvedValue({ data: [], error: null })
  })

  it('rejects an unauthenticated list read before database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await listPatients()

    expect(response.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('uses the membership tenant instead of a query-supplied tenant', async () => {
    const response = await listPatients()

    expect(response.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('get_patients_for_portal', {
      p_tenant_id: 'tenant-1',
    })
  })

  it('does not expose database error details', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'secret schema and SQL details' },
    })

    const response = await listPatients()

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to fetch patients' })
  })
})
