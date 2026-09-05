import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock } = vi.hoisted(() => ({ authorizeMock: vi.fn() }))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
  clinicalAccessDeniedMessage: () => 'Access denied',
}))

import { GET } from '../route'

describe('billing export route safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue({ ok: true, context: { tenantId: 'tenant-a', userId: 'clinician-1', email: 'clinician@example.test', role: 'clinician' } })
  })

  it('rejects unauthenticated export requests', async () => {
    authorizeMock.mockResolvedValueOnce({ ok: false, status: 401, reason: 'unauthenticated' })
    expect((await GET()).status).toBe(401)
  })

  it('fails closed until billing records have a verified tenant scope', async () => {
    const response = await GET()
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ code: 'BILLING_TENANT_SCOPE_UNAVAILABLE' })
  })
})
