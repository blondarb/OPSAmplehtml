import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  getPoolMock,
  queryMock,
  fromMock,
  updateMock,
  inMock,
  eqMock,
  selectMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  fromMock: vi.fn(),
  updateMock: vi.fn(),
  inMock: vi.fn(),
  eqMock: vi.fn(),
  selectMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))

import { GET, PATCH, POST } from '../route'

describe('notifications safety boundary', () => {
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
    queryMock.mockResolvedValue({ rows: [{ id: 'patient-1' }] })
    selectMock.mockResolvedValue({ data: [{ id: 'notification-1' }], error: null })
    eqMock.mockReturnValue({ select: selectMock })
    inMock.mockReturnValue({ eq: eqMock })
    updateMock.mockReturnValue({ in: inMock })
    fromMock.mockReturnValue({ update: updateMock })
  })

  it('rejects unauthenticated notification reads before database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await GET(
      new Request('http://localhost/api/notifications') as never,
    )

    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('rejects unsupported notification state mutation', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/notifications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'notification-1', status: 'deleted' }),
      }) as never,
    )

    expect(response.status).toBe(400)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('tenant-scopes notification state mutation', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/notifications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'notification-1', status: 'read' }),
      }) as never,
    )

    expect(response.status).toBe(200)
    expect(inMock).toHaveBeenCalledWith('id', ['notification-1'])
    expect(eqMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
  })

  it('rejects notification creation for a patient outside the tenant', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })

    const response = await POST(
      new Request('http://localhost/api/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source_type: 'system',
          title: 'Synthetic notice',
          patient_id: 'other-patient',
        }),
      }) as never,
    )

    expect(response.status).toBe(404)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      ['other-patient', 'tenant-1'],
    )
    expect(fromMock).not.toHaveBeenCalled()
  })
})
