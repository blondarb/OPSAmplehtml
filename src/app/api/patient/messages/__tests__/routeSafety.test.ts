import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  getPoolMock,
  queryMock,
  fromMock,
  insertMock,
  insertSelectMock,
  insertSingleMock,
  readSelectMock,
  readEqMock,
  readOrderMock,
  readLimitMock,
  notifyPatientMessageMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  insertSelectMock: vi.fn(),
  insertSingleMock: vi.fn(),
  readSelectMock: vi.fn(),
  readEqMock: vi.fn(),
  readOrderMock: vi.fn(),
  readLimitMock: vi.fn(),
  notifyPatientMessageMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/notifications', () => ({
  notifyPatientMessage: notifyPatientMessageMock,
}))

import { GET, POST } from '../route'

function sendMessage(overrides: Record<string, unknown> = {}) {
  return POST(
    new Request('http://localhost/api/patient/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        patient_name: 'Synthetic Patient',
        patient_id: 'patient-1',
        subject: 'Question',
        body: 'Synthetic non-urgent message.',
        tenant_id: 'attacker-tenant',
        ...overrides,
      }),
    }),
  )
}

describe('patient messages clinical boundary', () => {
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
    queryMock.mockResolvedValue({ rows: [{ id: 'patient-1' }] })
    insertSingleMock.mockResolvedValue({
      data: { id: 'message-1', patient_id: 'patient-1' },
      error: null,
    })
    insertSelectMock.mockReturnValue({ single: insertSingleMock })
    insertMock.mockReturnValue({ select: insertSelectMock })
    readLimitMock.mockResolvedValue({ data: [], error: null })
    readOrderMock.mockReturnValue({ limit: readLimitMock })
    readEqMock.mockReturnValue({ order: readOrderMock })
    readSelectMock.mockReturnValue({ eq: readEqMock })
    fromMock.mockReturnValue({ insert: insertMock, select: readSelectMock })
    notifyPatientMessageMock.mockResolvedValue({ id: 'notification-1' })
  })

  it('rejects an unauthenticated message before database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await sendMessage()

    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('rejects a supplied patient outside the membership tenant', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })

    const response = await sendMessage()

    expect(response.status).toBe(404)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      ['patient-1', 'tenant-1'],
    )
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('tenant-binds the message and its notification', async () => {
    const response = await sendMessage()

    expect(response.status).toBe(201)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        patient_id: 'patient-1',
      }),
    )
    expect(notifyPatientMessageMock).toHaveBeenCalledWith(
      'message-1',
      'Synthetic Patient',
      'Question',
      'patient-1',
      'tenant-1',
    )
  })

  it('rejects an unauthenticated message-list read', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await GET()

    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('tenant-scopes authorized message-list reads', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(authorizeMock).toHaveBeenCalledWith({
      action: 'patient.message_read',
      allowedRoles: ['viewer', 'scheduler', 'clinician', 'admin'],
    })
    expect(readEqMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
  })

  it('does not expose database error details', async () => {
    insertSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'secret schema and SQL details' },
    })

    const response = await sendMessage()

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to save message' })
  })
})
