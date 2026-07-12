import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  getPoolMock,
  queryMock,
  loadSchedulingMock,
  invokeClinicalMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  loadSchedulingMock: vi.fn(),
  invokeClinicalMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/triage/schedulingAuthorization', () => ({
  loadSchedulingAuthorization: loadSchedulingMock,
}))
vi.mock('@/lib/bedrock', () => ({
  invokeBedrockClinicalJSON: invokeClinicalMock,
  retrieveFromKB: vi.fn(),
}))

import { POST } from '../route'

function request(overrides: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/ai/historian/localizer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'consult-1',
      sessionType: 'new_patient',
      transcript: [
        { role: 'user', text: 'The symptom began yesterday.', timestamp: 1 },
      ],
      ...overrides,
    }),
  })
}

describe('Historian localizer scope lock', () => {
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
      rows: [{ id: 'consult-1', triage_session_id: 'triage-1' }],
    })
    loadSchedulingMock.mockResolvedValue({
      authorization: null,
      decision: { allowed: false, reason: 'workflow_not_decision_ready' },
    })
  })

  it('rejects an unauthenticated caller before transcript processing', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await POST(request())

    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
    expect(invokeClinicalMock).not.toHaveBeenCalled()
  })

  it('rejects referral clarification before any clinical generation', async () => {
    const response = await POST(
      request({ sessionType: 'referral_clarification' }),
    )

    expect(response.status).toBe(409)
    expect(invokeClinicalMock).not.toHaveBeenCalled()
  })

  it('cannot bypass a server-side hold by claiming a general session type', async () => {
    const response = await POST(request({ sessionType: 'new_patient' }))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Localizer is blocked by triage safety state',
      reason: 'workflow_not_decision_ready',
    })
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      ['consult-1', 'tenant-1'],
    )
    expect(invokeClinicalMock).not.toHaveBeenCalled()
  })
})
