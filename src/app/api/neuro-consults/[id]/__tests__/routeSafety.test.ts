import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET, PUT } from '../route'

const {
  authorizeMock,
  getConsultMock,
  loadAuthorizationMock,
  fromMock,
  updateMock,
  eqMock,
  isMock,
  selectMock,
  singleMock,
  maybeSingleMock,
  getPoolMock,
  queryMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getConsultMock: vi.fn(),
  loadAuthorizationMock: vi.fn(),
  fromMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn(),
  isMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/consult/pipeline', () => ({ getConsult: getConsultMock }))
vi.mock('@/lib/triage/historianAuthorization', () => ({
  loadHistorianAuthorization: loadAuthorizationMock,
}))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

const context = {
  params: Promise.resolve({ id: 'consult-1' }),
}

describe('neuro consult route clinical access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'user-1',
        email: 'clinician@example.test',
        tenantId: 'tenant-1',
        role: 'clinician',
      },
    })
    getConsultMock.mockResolvedValue({
      id: 'consult-1',
      tenant_id: 'tenant-1',
      patient_id: 'patient-a',
      triage_session_id: null,
      status: 'triage_complete',
    })
    singleMock.mockResolvedValue({
      data: { id: 'consult-1', notes: 'reviewed' },
      error: null,
    })
    maybeSingleMock.mockResolvedValue({
      data: { id: 'consult-1', patient_id: 'patient-b' },
      error: null,
    })
    selectMock.mockReturnValue({ single: singleMock })
    selectMock.mockReturnValue({
      single: singleMock,
      maybeSingle: maybeSingleMock,
    })
    eqMock.mockReturnValue({ eq: eqMock, is: isMock, select: selectMock })
    isMock.mockReturnValue({ eq: eqMock, is: isMock, select: selectMock })
    updateMock.mockReturnValue({ eq: eqMock, is: isMock })
    fromMock.mockReturnValue({ update: updateMock })
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock.mockResolvedValue({
      rows: [{ id: 'consult-1', tenant_id: 'tenant-1', patient_id: 'patient-b' }],
      rowCount: 1,
    })
  })

  it('rejects an unauthorized read before consult lookup', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await GET(new Request('http://localhost') as never, context)

    expect(response.status).toBe(401)
    expect(getConsultMock).not.toHaveBeenCalled()
  })

  it('scopes consult reads to the authoritative tenant', async () => {
    const response = await GET(new Request('http://localhost') as never, context)

    expect(response.status).toBe(200)
    expect(getConsultMock).toHaveBeenCalledWith('consult-1', 'tenant-1')
  })

  it('rejects an unauthorized mutation before reading the body', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: 'forbidden',
    })
    const request = new Request('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({ notes: 'spoofed' }),
    })

    const response = await PUT(request, context)

    expect(response.status).toBe(403)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('scopes consult updates to the authoritative tenant', async () => {
    const request = new Request('http://localhost', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notes: 'reviewed' }),
    })

    const response = await PUT(request, context)

    expect(response.status).toBe(200)
    expect(eqMock).toHaveBeenCalledWith('id', 'consult-1')
    expect(eqMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
  })

  it('rejects patient reassignment after a consult is linked to triage', async () => {
    getConsultMock.mockResolvedValueOnce({
      id: 'consult-1',
      tenant_id: 'tenant-1',
      patient_id: 'patient-a',
      triage_session_id: 'triage-1',
      status: 'triage_complete',
    })
    const request = new Request('http://localhost', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patient_id: 'patient-b' }),
    })

    const response = await PUT(request, context)

    expect(response.status).toBe(409)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('returns 409 when triage linkage wins the conditional patient reassignment race', async () => {
    getConsultMock.mockResolvedValueOnce({
      id: 'consult-1',
      tenant_id: 'tenant-1',
      patient_id: 'patient-a',
      triage_session_id: null,
      status: 'triage_complete',
    })
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    const request = new Request('http://localhost', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patient_id: 'patient-b' }),
    })

    const response = await PUT(request, context)

    expect(response.status).toBe(409)
    expect(String(queryMock.mock.calls[0][0])).toContain(
      'triage_session_id IS NULL',
    )
  })

  it.each([
    ['missing', 'patient-missing'],
    ['cross-tenant', 'patient-tenant-b'],
  ] as const)(
    'returns a non-leaking 409 for a %s target patient',
    async (_label, patientId) => {
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 })
      const request = new Request('http://localhost', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId }),
      })

      const response = await PUT(request, context)

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        reason: 'consult_patient_reassignment_conflict',
      })
      expect(String(queryMock.mock.calls[0][0])).toMatch(
        /FROM patients[\s\S]+tenant_id = \$2/,
      )
    },
  )

  it('atomically reassigns an unlinked consult to a same-tenant patient', async () => {
    const request = new Request('http://localhost', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patient_id: 'patient-b' }),
    })

    const response = await PUT(request, context)

    expect(response.status).toBe(200)
    expect(queryMock).toHaveBeenCalledOnce()
    const [sql, values] = queryMock.mock.calls[0]
    expect(String(sql)).toMatch(/WITH valid_patient AS MATERIALIZED/)
    expect(String(sql)).toMatch(/triage_session_id IS NULL/)
    expect(values).toEqual(
      expect.arrayContaining([
        'consult-1',
        'tenant-1',
        'patient-b',
        'patient-a',
      ]),
    )
  })

  it('allows an explicit null unassignment only while the consult remains unlinked', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'consult-1', tenant_id: 'tenant-1', patient_id: null }],
      rowCount: 1,
    })
    const request = new Request('http://localhost', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patient_id: null }),
    })

    const response = await PUT(request, context)

    expect(response.status).toBe(200)
    expect(queryMock.mock.calls[0][1][2]).toBeNull()
    expect(String(queryMock.mock.calls[0][0])).toContain(
      'triage_session_id IS NULL',
    )
  })
})
