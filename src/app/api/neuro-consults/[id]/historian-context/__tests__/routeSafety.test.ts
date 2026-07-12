import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, getConsultMock, buildContextMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getConsultMock: vi.fn(),
  buildContextMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/consult/pipeline', () => ({ getConsult: getConsultMock }))
vi.mock('@/lib/consult/contextBuilder', () => ({
  buildHistorianContextFromConsult: buildContextMock,
}))

import { GET } from '../route'

function callGet() {
  return GET(
    new Request('http://localhost/api/neuro-consults/consult-1/historian-context'),
    { params: Promise.resolve({ id: 'consult-1' }) },
  )
}

describe('consult historian-context route safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'viewer-1',
        email: 'viewer@example.test',
        tenantId: 'tenant-1',
        role: 'viewer',
      },
    })
    getConsultMock.mockResolvedValue({ id: 'consult-1', status: 'triage_complete' })
    buildContextMock.mockReturnValue({
      referralReason: 'synthetic referral',
      patientContext: 'synthetic context',
    })
  })

  it('rejects an unauthenticated caller before reading the consult', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await callGet()

    expect(response.status).toBe(401)
    expect(getConsultMock).not.toHaveBeenCalled()
  })

  it('reads the consult only within the authoritative tenant', async () => {
    const response = await callGet()

    expect(response.status).toBe(200)
    expect(getConsultMock).toHaveBeenCalledWith('consult-1', 'tenant-1')
  })
})
