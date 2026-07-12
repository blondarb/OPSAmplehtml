import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, getPoolMock, queryMock, loadSchedulingMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  loadSchedulingMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/triage/schedulingAuthorization', () => ({
  loadSchedulingAuthorization: loadSchedulingMock,
}))

import { GET, POST } from '../route'

function postStep(consultId = 'consult-1') {
  return POST(
    new Request('http://localhost/api/ai/historian/scales?action=step', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scale_id: 'midas',
        consult_id: consultId,
      }),
    }) as never,
  )
}

describe('Historian scales route safety', () => {
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
      rows: [
        {
          id: 'consult-1',
          patient_id: 'patient-1',
          triage_session_id: 'triage-1',
        },
      ],
    })
    loadSchedulingMock.mockResolvedValue({
      authorization: {},
      decision: { allowed: true },
    })
  })

  it('rejects unauthenticated writes before parsing or database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await postStep()

    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('rejects a consult binding outside the authoritative tenant', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })

    const response = await postStep('other-tenant-consult')

    expect(response.status).toBe(404)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      ['other-tenant-consult', 'tenant-1'],
    )
  })

  it('fails closed when a consult-bound scale write has no triage authorization', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'consult-1',
          patient_id: 'patient-1',
          triage_session_id: null,
        },
      ],
    })

    const response = await postStep()
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.reason).toBe('triage_authorization_missing')
    expect(loadSchedulingMock).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated scale-result reads', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await GET(
      new Request(
        'http://localhost/api/ai/historian/scales?consult_id=consult-1',
      ) as never,
    )

    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
  })
})
