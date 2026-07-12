import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  fromMock,
  selectMock,
  eqTenantMock,
  orderMock,
  limitMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  eqTenantMock: vi.fn(),
  orderMock: vi.fn(),
  limitMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))

import { GET } from '../route'

describe('patient selector list clinical boundary', () => {
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
    limitMock.mockResolvedValue({ data: [], error: null })
    orderMock.mockReturnValue({ limit: limitMock })
    eqTenantMock.mockReturnValue({ order: orderMock })
    selectMock.mockReturnValue({ eq: eqTenantMock })
    fromMock.mockReturnValue({ select: selectMock })
  })

  it('rejects an unauthenticated selector read before database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await GET()

    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('tenant-scopes authorized selector reads', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(eqTenantMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
  })
})
