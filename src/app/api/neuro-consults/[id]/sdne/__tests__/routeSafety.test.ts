import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  getConsultMock,
  markRequestedMock,
  linkSdneMock,
  loadSchedulingMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getConsultMock: vi.fn(),
  markRequestedMock: vi.fn(),
  linkSdneMock: vi.fn(),
  loadSchedulingMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/consult/pipeline', () => ({
  getConsult: getConsultMock,
  markSDNERequested: markRequestedMock,
  linkSDNEToConsult: linkSdneMock,
}))
vi.mock('@/lib/triage/schedulingAuthorization', () => ({
  loadSchedulingAuthorization: loadSchedulingMock,
}))

import { GET, POST } from '../route'

function postRequest(action: 'request' | 'link' = 'request') {
  const body =
    action === 'request'
      ? { action }
      : {
          action,
          sdne_session_id: 'sdne-1',
          session_flag: 'normal',
          domain_flags: {},
          detected_patterns: [],
        }
  return POST(
    new Request('http://localhost/api/neuro-consults/consult-1/sdne', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id: 'consult-1' }) },
  )
}

function getRequest() {
  return GET(
    new Request('http://localhost/api/neuro-consults/consult-1/sdne') as never,
    { params: Promise.resolve({ id: 'consult-1' }) },
  )
}

describe('SDNE consult route safety', () => {
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
      triage_session_id: 'triage-1',
    })
    loadSchedulingMock.mockResolvedValue({
      authorization: {},
      decision: { allowed: true },
    })
    markRequestedMock.mockResolvedValue(true)
    linkSdneMock.mockResolvedValue(true)
  })

  it('rejects unauthenticated writes before reading the consult', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await postRequest()

    expect(response.status).toBe(401)
    expect(getConsultMock).not.toHaveBeenCalled()
  })

  it('blocks SDNE workflow while triage safety is unresolved', async () => {
    loadSchedulingMock.mockResolvedValueOnce({
      authorization: null,
      decision: { allowed: false, reason: 'care_pathway_not_outpatient' },
    })

    const response = await postRequest('link')

    expect(response.status).toBe(409)
    expect(markRequestedMock).not.toHaveBeenCalled()
    expect(linkSdneMock).not.toHaveBeenCalled()
  })

  it('tenant-scopes an authorized SDNE transition', async () => {
    const response = await postRequest('link')

    expect(response.status).toBe(200)
    expect(getConsultMock).toHaveBeenCalledWith('consult-1', 'tenant-1')
    expect(loadSchedulingMock).toHaveBeenCalledWith('triage-1', 'tenant-1')
    expect(linkSdneMock).toHaveBeenCalledWith(
      'consult-1',
      'sdne-1',
      'normal',
      {},
      [],
      'tenant-1',
    )
  })

  it('tenant-scopes authorized SDNE reads', async () => {
    const response = await getRequest()

    expect(response.status).toBe(200)
    expect(getConsultMock).toHaveBeenCalledWith('consult-1', 'tenant-1')
  })
})
