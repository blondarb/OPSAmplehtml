import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  fromMock,
  selectMock,
  eqTenantMock,
  ilikeFirstMock,
  ilikeLastMock,
  eqDobMock,
  limitMock,
  maybeSingleMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  eqTenantMock: vi.fn(),
  ilikeFirstMock: vi.fn(),
  ilikeLastMock: vi.fn(),
  eqDobMock: vi.fn(),
  limitMock: vi.fn(),
  maybeSingleMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))

import { GET } from '../route'

function lookup(query: string) {
  return GET(new Request(`http://localhost/api/patient/lookup?${query}`))
}

describe('patient lookup clinical boundary', () => {
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
    maybeSingleMock.mockResolvedValue({
      data: {
        id: 'patient-1',
        first_name: 'Synthetic',
        last_name: 'Patient',
      },
      error: null,
    })
    limitMock.mockReturnValue({ maybeSingle: maybeSingleMock })
    eqDobMock.mockReturnValue({ limit: limitMock })
    ilikeLastMock.mockReturnValue({ eq: eqDobMock, limit: limitMock })
    ilikeFirstMock.mockReturnValue({
      ilike: ilikeLastMock,
      eq: eqDobMock,
      limit: limitMock,
    })
    eqTenantMock.mockReturnValue({ ilike: ilikeFirstMock })
    selectMock.mockReturnValue({ eq: eqTenantMock })
    fromMock.mockReturnValue({ select: selectMock })
  })

  it('rejects an unauthenticated patient lookup before database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await lookup(
      'name=Synthetic+Patient&dob=1990-01-15&tenant_id=attacker-tenant',
    )

    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('uses the membership tenant instead of a query-supplied tenant', async () => {
    const response = await lookup(
      'name=Synthetic+Patient&dob=1990-01-15&tenant_id=attacker-tenant',
    )

    expect(response.status).toBe(200)
    expect(eqTenantMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(eqTenantMock).not.toHaveBeenCalledWith(
      'tenant_id',
      'attacker-tenant',
    )
  })

  it('rejects oversized names before database access', async () => {
    const response = await lookup(`name=${'A'.repeat(201)}`)

    expect(response.status).toBe(400)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('rejects malformed dates of birth before database access', async () => {
    const response = await lookup('name=Synthetic+Patient&dob=not-a-date')

    expect(response.status).toBe(400)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('rejects ILIKE wildcard characters instead of returning an arbitrary patient', async () => {
    const response = await lookup('name=%25')

    expect(response.status).toBe(400)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('rejects impossible calendar dates before database access', async () => {
    const response = await lookup('name=Synthetic+Patient&dob=1990-99-99')

    expect(response.status).toBe(400)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('fails closed when the lookup store is unavailable', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'secret schema and SQL details' },
    })

    const response = await lookup('name=Synthetic+Patient')

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Patient lookup unavailable' })
  })
})
