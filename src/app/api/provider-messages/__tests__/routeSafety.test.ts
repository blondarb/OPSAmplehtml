import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, fromMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
  clinicalAccessDeniedMessage: () => 'Access denied',
}))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))

import { GET, POST } from '../route'

function chain(result: { data: unknown; error: unknown }) {
  const value = {
    ...result,
    select: vi.fn(), eq: vi.fn(), order: vi.fn(), insert: vi.fn(), update: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(),
  }
  value.select.mockReturnValue(value)
  value.eq.mockReturnValue(value)
  value.order.mockReturnValue(value)
  value.insert.mockReturnValue(value)
  value.update.mockReturnValue(value)
  value.single.mockResolvedValue(result)
  value.maybeSingle.mockResolvedValue(result)
  return value
}

describe('provider messages route safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue({ ok: true, context: { tenantId: 'tenant-a', userId: 'clinician-1', email: 'clinician@example.test', role: 'clinician' } })
  })

  it('rejects unauthenticated reads before querying a thread', async () => {
    authorizeMock.mockResolvedValueOnce({ ok: false, status: 401, reason: 'unauthenticated' })
    const response = await GET(new Request('http://localhost/api/provider-messages?thread_id=thread-1'))
    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('does not read messages from a thread outside the authenticated tenant', async () => {
    const threadQuery = chain({ data: null, error: null })
    fromMock.mockReturnValue(threadQuery)
    const response = await GET(new Request('http://localhost/api/provider-messages?thread_id=thread-b'))
    expect(response.status).toBe(404)
    expect(threadQuery.eq).toHaveBeenCalledWith('tenant_id', 'tenant-a')
    expect(fromMock).toHaveBeenCalledTimes(1)
  })

  it('derives message sender identity and tenant from clinical access', async () => {
    const threadQuery = chain({ data: { id: 'thread-a', participants: ['clinician-1'] }, error: null })
    const messageQuery = chain({ data: { id: 'message-1' }, error: null })
    const updateQuery = chain({ data: null, error: null })
    fromMock.mockReturnValueOnce(threadQuery).mockReturnValueOnce(messageQuery).mockReturnValueOnce(updateQuery)

    const response = await POST(new Request('http://localhost/api/provider-messages', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ thread_id: 'thread-a', sender_id: 'spoofed-user', sender_name: 'Spoofed Name', body: 'Synthetic message' }),
    }))

    expect(response.status).toBe(201)
    expect(messageQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: 'tenant-a', sender_id: 'clinician-1', sender_name: 'clinician@example.test',
    }))
    expect(messageQuery.insert).not.toHaveBeenCalledWith(expect.objectContaining({ sender_id: 'spoofed-user' }))
    expect(updateQuery.eq).toHaveBeenCalledWith('tenant_id', 'tenant-a')
  })

  it('denies a tenant-owned thread when the caller is not a participant', async () => {
    const threadQuery = chain({ data: { id: 'thread-a', participants: ['another-user'] }, error: null })
    fromMock.mockReturnValue(threadQuery)
    const response = await GET(new Request('http://localhost/api/provider-messages?thread_id=thread-a'))
    expect(response.status).toBe(404)
    expect(fromMock).toHaveBeenCalledTimes(1)
  })
})
