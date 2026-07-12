import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, loadMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  loadMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/triage/emergencyActionRead', () => ({
  loadEmergencyActions: loadMock,
}))

import { GET } from '../route'

const context = { params: Promise.resolve({ id: 'triage-1' }) }

describe('emergency actions read route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'clinician-1',
        tenantId: 'tenant-1',
        role: 'clinician',
      },
    })
    loadMock.mockResolvedValue({ ok: true, actions: [] })
  })

  it('rejects unauthenticated access before reading actions', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await GET(new Request('http://localhost'), context)

    expect(response.status).toBe(401)
    expect(loadMock).not.toHaveBeenCalled()
  })

  it('derives the tenant from clinical access', async () => {
    const response = await GET(new Request('http://localhost'), context)

    expect(response.status).toBe(200)
    expect(authorizeMock).toHaveBeenCalledWith({
      action: 'triage.read',
      allowedRoles: ['clinician', 'admin'],
    })
    expect(loadMock).toHaveBeenCalledWith('triage-1', 'tenant-1')
  })

  it('maps missing sessions and database failures without leaking details', async () => {
    loadMock.mockResolvedValueOnce({
      ok: false,
      reason: 'triage_session_not_found',
    })
    const missing = await GET(new Request('http://localhost'), context)
    expect(missing.status).toBe(404)

    loadMock.mockResolvedValueOnce({
      ok: false,
      reason: 'persistence_failed',
    })
    const failed = await GET(new Request('http://localhost'), context)
    expect(failed.status).toBe(503)
    expect(await failed.json()).toEqual({
      error: 'Emergency actions are temporarily unavailable',
      reason: 'persistence_failed',
    })
  })
})
