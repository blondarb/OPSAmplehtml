import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, fromMock } = vi.hoisted(() => ({ authorizeMock: vi.fn(), fromMock: vi.fn() }))

vi.mock('@/lib/auth/clinicalAccess', () => ({ authorizeClinicalAccess: authorizeMock, clinicalAccessDeniedMessage: () => 'Access denied' }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))

import { GET, POST } from '../route'

function chain(result: { data: unknown; error: unknown }) {
  const value = { ...result, select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), insert: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() }
  value.select.mockReturnValue(value); value.eq.mockReturnValue(value); value.order.mockReturnValue(value); value.limit.mockReturnValue(value); value.insert.mockReturnValue(value)
  value.single.mockResolvedValue(result); value.maybeSingle.mockResolvedValue(result)
  return value
}

describe('provider thread route safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue({ ok: true, context: { tenantId: 'tenant-a', userId: 'clinician-1', email: 'clinician@example.test', role: 'clinician' } })
  })

  it('rejects unauthenticated list requests before database access', async () => {
    authorizeMock.mockResolvedValueOnce({ ok: false, status: 401, reason: 'unauthenticated' })
    expect((await GET()).status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('lists only tenant threads where the caller is a participant', async () => {
    const threads = chain({ data: [{ id: 'allowed', participants: ['clinician-1'] }, { id: 'other', participants: ['other-user'] }, { id: 'malformed', participants: null }], error: null })
    fromMock.mockReturnValue(threads)
    const response = await GET()
    await expect(response.json()).resolves.toEqual({ threads: [{ id: 'allowed', participants: ['clinician-1'] }] })
    expect(threads.eq).toHaveBeenCalledWith('tenant_id', 'tenant-a')
  })

  it('rejects a forged participant list that omits the authenticated caller', async () => {
    const response = await POST(new Request('http://localhost/api/provider-messages/threads', { method: 'POST', body: JSON.stringify({ participants: ['spoofed-user'] }) }))
    expect(response.status).toBe(403)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('checks a patient-bound thread belongs to the authenticated tenant before insert', async () => {
    const patient = chain({ data: null, error: null })
    fromMock.mockReturnValue(patient)
    const response = await POST(new Request('http://localhost/api/provider-messages/threads', { method: 'POST', body: JSON.stringify({ patient_id: 'patient-b', participants: ['clinician-1'] }) }))
    expect(response.status).toBe(404)
    expect(patient.eq).toHaveBeenCalledWith('tenant_id', 'tenant-a')
    expect(fromMock).toHaveBeenCalledTimes(1)
  })
})
