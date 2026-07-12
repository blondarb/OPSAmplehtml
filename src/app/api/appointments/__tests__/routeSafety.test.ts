import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  getPoolMock,
  queryMock,
  fromMock,
  insertMock,
  selectMock,
  singleMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))

import { GET, POST } from '../route'

function createAppointment(overrides: Record<string, unknown> = {}) {
  return POST(
    new Request('http://localhost/api/appointments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        patientId: 'patient-1',
        appointmentDate: '2026-07-20',
        appointmentTime: '09:00',
        appointmentType: 'follow-up',
        ...overrides,
      }),
    }) as never,
  )
}

describe('appointments collection safety boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ENABLE_DEMO_APPOINTMENT_FALLBACK
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
    queryMock.mockResolvedValue({ rows: [] })
    singleMock.mockResolvedValue({
      data: { id: 'appointment-1' },
      error: null,
    })
    selectMock.mockReturnValue({ single: singleMock })
    insertMock.mockReturnValue({ select: selectMock })
    fromMock.mockReturnValue({ insert: insertMock })
  })

  it('rejects anonymous appointment reads before database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await GET(
      new Request('http://localhost/api/appointments?date=2026-07-20') as never,
    )

    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('tenant-scopes reads and does not inject demo patients into empty clinical results', async () => {
    const response = await GET(
      new Request('http://localhost/api/appointments?date=2026-07-20') as never,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ appointments: [] })
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('a."tenant_id"'),
      expect.arrayContaining(['tenant-1']),
    )
  })

  it('rejects direct new-consult creation so referral triage cannot be bypassed', async () => {
    const response = await createAppointment({ appointmentType: 'new-consult' })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      reason: 'triage_authorization_required',
    })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('rejects a patient outside the authoritative tenant', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })

    const response = await createAppointment()

    expect(response.status).toBe(404)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      ['patient-1', 'tenant-1'],
    )
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('creates tenant-bound follow-up appointments for a tenant-bound patient', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'patient-1' }] })

    const response = await createAppointment()

    expect(response.status).toBe(201)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        patient_id: 'patient-1',
        appointment_type: 'follow-up',
        created_by: 'scheduler-1',
      }),
    )
  })
})
