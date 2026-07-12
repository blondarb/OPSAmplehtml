import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

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

import { POST } from '../route'

function request(visitId: unknown = 'visit-1') {
  return new NextRequest('http://localhost/api/follow-up/from-visit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ visitId }),
  })
}

const completedVisit = {
  visit_id: 'visit-1',
  patient_id: 'patient-1',
  visit_date: '2026-07-10',
  visit_type: 'follow-up',
  chief_complaint: ['Tremor'],
  visit_status: 'completed',
  first_name: 'Synthetic',
  last_name: 'Patient',
  date_of_birth: '1970-01-01',
  gender: 'female',
  assessment: 'Neurological follow-up',
  plan: 'Continue clinician-directed plan',
  ai_summary: 'Authoritative completed visit summary',
  medications: [],
}

describe('follow-up creation from visit safety boundary', () => {
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
    queryMock.mockResolvedValue({ rows: [completedVisit] })
    singleMock.mockResolvedValue({ data: { id: 'session-1' }, error: null })
    selectMock.mockReturnValue({ single: singleMock })
    insertMock.mockReturnValue({ select: selectMock })
    fromMock.mockReturnValue({ insert: insertMock })
  })

  it('rejects unauthenticated creation before reading visit data', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await POST(request())

    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('scopes the authoritative visit, patient, and note lookup to the caller tenant', async () => {
    const response = await POST(request())

    expect(response.status).toBe(201)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringMatching(/v\."tenant_id"\s*=\s*\$2/),
      ['visit-1', 'tenant-1'],
    )
    expect(queryMock.mock.calls[0][0]).toContain('p."tenant_id" = v."tenant_id"')
    expect(queryMock.mock.calls[0][0]).toContain('cn."tenant_id" = v."tenant_id"')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        patient_id: 'patient-1',
        visit_id: 'visit-1',
        medications: '[]',
        transcript: '[]',
      }),
    )
  })

  it('rejects follow-up creation before the source visit is completed', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ ...completedVisit, visit_status: 'in_progress' }],
    })

    const response = await POST(request())

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      reason: 'source_visit_not_completed',
    })
    expect(fromMock).not.toHaveBeenCalled()
  })
})
