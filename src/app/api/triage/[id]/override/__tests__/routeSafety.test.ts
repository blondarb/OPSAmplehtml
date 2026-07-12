import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, recordEscalationMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  recordEscalationMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/triage/clinicianEscalation', () => ({
  recordClinicianTierEscalation: recordEscalationMock,
}))

import { POST } from '../route'

function callPost(newTier = 'urgent') {
  return POST(
    new Request('http://localhost/api/triage/triage-1/override', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        new_tier: newTier,
        override_reason: 'Red flag not captured by model',
      }),
    }),
    { params: Promise.resolve({ id: 'triage-1' }) },
  )
}

describe('clinician triage escalation route', () => {
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
    recordEscalationMock.mockResolvedValue({ ok: true })
  })

  it('rejects unauthenticated mutation before persistence', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await callPost()

    expect(response.status).toBe(401)
    expect(recordEscalationMock).not.toHaveBeenCalled()
  })

  it('uses authoritative tenant and actor identity for an escalation', async () => {
    const response = await callPost('emergent')

    expect(response.status).toBe(200)
    expect(recordEscalationMock).toHaveBeenCalledWith({
      triageSessionId: 'triage-1',
      tenantId: 'tenant-1',
      actorUserId: 'clinician-1',
      actorRole: 'clinician',
      newTier: 'emergent',
      reason: 'Red flag not captured by model',
    })
  })

  it('rejects a downgrade that bypasses closed-loop review', async () => {
    recordEscalationMock.mockResolvedValueOnce({
      ok: false,
      reason: 'downgrade_requires_closed_loop_review',
    })

    const response = await callPost('routine')

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      reason: 'downgrade_requires_closed_loop_review',
    })
  })
})
