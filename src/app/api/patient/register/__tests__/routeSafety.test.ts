import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, rpcMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db-query', () => ({ rpc: rpcMock }))

import { POST } from '../route'

function registerPatient(overrides: Record<string, unknown> = {}) {
  return POST(
    new Request('http://localhost/api/patient/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        first_name: 'Synthetic',
        last_name: 'Patient',
        referral_reason: 'Synthetic chronic tremor.',
        tenant_id: 'attacker-tenant',
        ...overrides,
      }),
    }),
  )
}

describe('patient registration clinical boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'scheduler-1',
        email: 'scheduler@example.test',
        tenantId: 'tenant-1',
        role: 'scheduler',
      },
    })
    rpcMock.mockResolvedValue({ data: 'patient-1', error: null })
  })

  it('rejects an unauthenticated registration before database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await registerPatient()

    expect(response.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('uses the membership tenant instead of a body-supplied tenant', async () => {
    const response = await registerPatient()

    expect(response.status).toBe(200)
    expect(authorizeMock).toHaveBeenCalledWith({
      action: 'patient.register',
      allowedRoles: ['scheduler', 'clinician', 'admin'],
    })
    expect(rpcMock).toHaveBeenCalledWith(
      'portal_register_patient',
      expect.objectContaining({ p_tenant_id: 'tenant-1' }),
    )
  })

  it('does not expose database error details', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'secret schema and SQL details' },
    })

    const response = await registerPatient()

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to register patient' })
  })
})
