import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, getPoolMock, queryMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { GET, POST } from '../route'

function saveTools(overrides: Record<string, unknown> = {}) {
  return POST(
    new Request('http://localhost/api/patient/tools', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        patient_id: 'patient-1',
        tenant_id: 'attacker-tenant',
        body_map_markers: [
          {
            region: 'hand_left',
            symptom_type: 'tremor',
            severity: 'mild',
            laterality: 'left',
          },
        ],
        ...overrides,
      }),
    }) as never,
  )
}

describe('patient tools clinical boundary', () => {
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
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM patients')) return { rows: [{ id: 'patient-1' }] }
      if (sql.includes('FROM neurology_consults')) {
        return { rows: [{ id: 'consult-1', patient_id: 'patient-1' }] }
      }
      if (sql.includes('INSERT INTO')) return { rows: [{ id: 'tool-1' }] }
      return { rows: [] }
    })
  })

  it('rejects an unauthenticated tools write before database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await saveTools()

    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('rejects unbound tools data without a patient or consult', async () => {
    const response = await saveTools({ patient_id: null, consult_id: null })

    expect(response.status).toBe(400)
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('rejects a supplied patient outside the membership tenant', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })

    const response = await saveTools()

    expect(response.status).toBe(404)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      ['patient-1', 'tenant-1'],
    )
    expect(queryMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a consult whose patient conflicts with the supplied patient', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'patient-1' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'consult-1', patient_id: 'patient-2' }],
      })

    const response = await saveTools({ consult_id: 'consult-1' })

    expect(response.status).toBe(409)
    expect(queryMock).toHaveBeenCalledTimes(2)
  })

  it('writes only after tenant-validating the patient binding', async () => {
    const response = await saveTools()

    expect(response.status).toBe(200)
    expect(queryMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('tenant_id = $2'),
      ['patient-1', 'tenant-1'],
    )
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO patient_body_map_markers'),
      expect.arrayContaining(['patient-1']),
    )
  })

  it('rejects an unauthenticated tools read before database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await GET(
      new Request('http://localhost/api/patient/tools?patient_id=patient-1') as never,
    )

    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('rejects a cross-tenant patient tools read before fetching tool rows', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: true,
      context: {
        userId: 'viewer-1',
        email: 'viewer@example.test',
        tenantId: 'tenant-1',
        role: 'viewer',
      },
    })
    queryMock.mockResolvedValueOnce({ rows: [] })

    const response = await GET(
      new Request('http://localhost/api/patient/tools?patient_id=patient-2') as never,
    )

    expect(response.status).toBe(404)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      ['patient-2', 'tenant-1'],
    )
    expect(queryMock).toHaveBeenCalledTimes(1)
  })
})
