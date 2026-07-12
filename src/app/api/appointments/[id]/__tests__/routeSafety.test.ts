import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  getPoolMock,
  queryMock,
  fromMock,
  updateMock,
  eqIdMock,
  eqTenantMock,
  selectMock,
  singleMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  fromMock: vi.fn(),
  updateMock: vi.fn(),
  eqIdMock: vi.fn(),
  eqTenantMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))

import { DELETE, GET, PATCH } from '../route'

const context = { params: Promise.resolve({ id: 'appointment-1' }) }

describe('appointment item safety boundary', () => {
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
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock.mockResolvedValue({ rows: [{ id: 'appointment-1' }] })
    singleMock.mockResolvedValue({ data: { id: 'appointment-1' }, error: null })
    selectMock.mockReturnValue({ single: singleMock })
    eqTenantMock.mockReturnValue({ select: selectMock })
    eqIdMock.mockReturnValue({ eq: eqTenantMock })
    updateMock.mockReturnValue({ eq: eqIdMock })
    fromMock.mockReturnValue({ update: updateMock })
  })

  it('rejects anonymous item reads before database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await GET(
      new Request('http://localhost/api/appointments/appointment-1') as never,
      context,
    )

    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('tenant-scopes appointment and joined patient reads', async () => {
    const response = await GET(
      new Request('http://localhost/api/appointments/appointment-1') as never,
      context,
    )

    expect(response.status).toBe(200)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('a."tenant_id" = $2'),
      ['appointment-1', 'tenant-1'],
    )
  })

  it('tenant-scopes appointment updates', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/appointments/appointment-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appointmentTime: '10:00' }),
      }) as never,
      context,
    )

    expect(response.status).toBe(200)
    expect(eqIdMock).toHaveBeenCalledWith('id', 'appointment-1')
    expect(eqTenantMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
  })

  it('rejects converting a generic appointment into a new consult', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/appointments/appointment-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appointmentType: 'new_consult' }),
      }) as never,
      context,
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      reason: 'triage_authorization_required',
    })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('tenant-scopes appointment cancellation', async () => {
    const response = await DELETE(
      new Request('http://localhost/api/appointments/appointment-1', {
        method: 'DELETE',
      }) as never,
      context,
    )

    expect(response.status).toBe(200)
    expect(eqIdMock).toHaveBeenCalledWith('id', 'appointment-1')
    expect(eqTenantMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
  })
})
