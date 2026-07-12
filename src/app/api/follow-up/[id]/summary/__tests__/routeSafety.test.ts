import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, fromMock, selectMock, firstEqMock, tenantEqMock, singleMock } =
  vi.hoisted(() => ({
    authorizeMock: vi.fn(),
    fromMock: vi.fn(),
    selectMock: vi.fn(),
    firstEqMock: vi.fn(),
    tenantEqMock: vi.fn(),
    singleMock: vi.fn(),
  }))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))

import { GET } from '../route'

function callGet(id = 'session-1') {
  return GET(new Request(`http://localhost/api/follow-up/${id}/summary`), {
    params: Promise.resolve({ id }),
  })
}

describe('follow-up summary safety boundary', () => {
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
    singleMock.mockResolvedValue({
      data: { id: 'session-1', post_call_summary: 'Authoritative summary' },
      error: null,
    })
    tenantEqMock.mockReturnValue({ single: singleMock })
    firstEqMock.mockReturnValue({ eq: tenantEqMock })
    selectMock.mockReturnValue({ eq: firstEqMock })
    fromMock.mockReturnValue({ select: selectMock })
  })

  it('rejects unauthenticated summary access before database reads', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await callGet()

    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('reads a summary only from the caller tenant', async () => {
    const response = await callGet()

    expect(response.status).toBe(200)
    expect(firstEqMock).toHaveBeenCalledWith('id', 'session-1')
    expect(tenantEqMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
  })
})
