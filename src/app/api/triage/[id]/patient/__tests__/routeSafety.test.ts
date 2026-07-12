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

import { PATCH } from '../route'

function callPatch(patientId = 'patient-1') {
  void patientId
  return PATCH()
}

describe('triage patient-link route safety', () => {
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
    queryMock.mockResolvedValue({
      rows: [{
        session_found: true,
        patient_found: true,
        consult_bound: false,
        consult_matches: false,
        updated: true,
      }],
      rowCount: 1,
    })
  })

  it('rejects an unauthenticated caller before any database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await callPatch()

    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('rejects every caller-selected patient binding without parsing or database access', async () => {
    const response = await callPatch()
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      error: expect.stringContaining('verified referral identity workflow'),
      reason: 'unverified_patient_binding_not_allowed',
    })
    expect(getPoolMock).not.toHaveBeenCalled()
    expect(queryMock).not.toHaveBeenCalled()
  })
})
