import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeClinicalAccessMock, queryMock, getPoolMock } = vi.hoisted(() => ({
  authorizeClinicalAccessMock: vi.fn(),
  queryMock: vi.fn(),
  getPoolMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeClinicalAccessMock,
  clinicalAccessDeniedMessage: () => 'Access denied.',
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { POST } from '@/app/api/ai/historian/evaluations/retry/route'

describe('historian differential retry route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ query: queryMock })
  })

  it('requires clinician/admin clinical access', async () => {
    authorizeClinicalAccessMock.mockResolvedValueOnce({ ok: false, status: 403, reason: 'forbidden' })
    const response = await POST(new Request('https://example.test/api/ai/historian/evaluations/retry', {
      method: 'POST', body: JSON.stringify({ sessionId: 'session-1' }),
    }))
    expect(response.status).toBe(403)
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('requeues only a failed job in the active clinician tenant', async () => {
    authorizeClinicalAccessMock.mockResolvedValueOnce({
      ok: true,
      context: { userId: 'clinician-1', tenantId: 'tenant-a', role: 'clinician' },
    })
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'job-1' }], rowCount: 1 })
    const response = await POST(new Request('https://example.test/api/ai/historian/evaluations/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1', tenantId: 'attacker-tenant' }),
    }))
    expect(response.status).toBe(200)
    expect(queryMock.mock.calls[0][0]).toContain("AND status = 'failed'")
    expect(queryMock.mock.calls[0][1]).toEqual(['session-1', 'tenant-a'])
  })
})
