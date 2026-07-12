import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  getConsultMock,
  linkIntakeMock,
  loadSchedulingMock,
  fromMock,
  insertMock,
  selectMock,
  singleMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getConsultMock: vi.fn(),
  linkIntakeMock: vi.fn(),
  loadSchedulingMock: vi.fn(),
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/consult/pipeline', () => ({
  getConsult: getConsultMock,
  linkIntakeToConsult: linkIntakeMock,
}))
vi.mock('@/lib/triage/schedulingAuthorization', () => ({
  loadSchedulingAuthorization: loadSchedulingMock,
}))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))

import { POST } from '../route'

function callPost() {
  return POST(
    new Request('http://localhost/api/neuro-consults/consult-1/initiate-intake', {
      method: 'POST',
    }),
    { params: Promise.resolve({ id: 'consult-1' }) },
  )
}

describe('initiate-intake route safety', () => {
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
    getConsultMock.mockResolvedValue({
      id: 'consult-1',
      status: 'triage_complete',
      triage_session_id: 'triage-1',
      patient_id: 'patient-1',
    })
    loadSchedulingMock.mockResolvedValue({
      authorization: {},
      decision: { allowed: true },
    })
    singleMock.mockResolvedValue({ data: { id: 'intake-1' }, error: null })
    selectMock.mockReturnValue({ single: singleMock })
    insertMock.mockReturnValue({ select: selectMock })
    fromMock.mockReturnValue({ insert: insertMock })
    linkIntakeMock.mockResolvedValue(true)
  })

  it('rejects an unauthenticated caller before consult access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await callPost()

    expect(response.status).toBe(401)
    expect(getConsultMock).not.toHaveBeenCalled()
  })

  it('tenant-scopes the consult and safety authorization', async () => {
    const response = await callPost()

    expect(response.status).toBe(200)
    expect(getConsultMock).toHaveBeenCalledWith('consult-1', 'tenant-1')
    expect(loadSchedulingMock).toHaveBeenCalledWith('triage-1', 'tenant-1')
    expect(linkIntakeMock).toHaveBeenCalledWith(
      'consult-1',
      expect.any(String),
      'intake_in_progress',
      undefined,
      undefined,
      'tenant-1',
    )
  })

  it('does not start intake while any triage safety hold remains', async () => {
    loadSchedulingMock.mockResolvedValueOnce({
      authorization: null,
      decision: { allowed: false, reason: 'care_pathway_not_outpatient' },
    })

    const response = await callPost()

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Intake is blocked by triage safety state',
      reason: 'care_pathway_not_outpatient',
    })
    expect(fromMock).not.toHaveBeenCalled()
    expect(linkIntakeMock).not.toHaveBeenCalled()
  })
})
