import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  authorizeClinicalAccessMock,
  fromMock,
  getPoolMock,
  getTenantServerMock,
  getUserMock,
  notifyIncompleteNotesMock,
  queryMock,
} = vi.hoisted(() => ({
  authorizeClinicalAccessMock: vi.fn(),
  fromMock: vi.fn(),
  getPoolMock: vi.fn(),
  getTenantServerMock: vi.fn(),
  getUserMock: vi.fn(),
  notifyIncompleteNotesMock: vi.fn(),
  queryMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeClinicalAccessMock,
}))
vi.mock('@/lib/cognito/server', () => ({ getUser: getUserMock }))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/notifications', () => ({
  notifyIncompleteNotes: notifyIncompleteNotesMock,
}))
vi.mock('@/lib/tenant', () => ({ getTenantServer: getTenantServerMock }))

import { GET } from '../route'

describe('GET /api/incomplete-docs retirement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ query: queryMock })
  })

  it('retires before request parsing, data access, or notification side effects', async () => {
    const request = new NextRequest(
      'http://localhost/api/incomplete-docs?tenant_id=synthetic-tenant',
      { headers: { authorization: 'Bearer synthetic-credential' } },
    )
    const jsonSpy = vi.spyOn(request, 'json')

    const response = await (
      GET as unknown as (request: NextRequest) => Promise<Response>
    )(request)

    expect(response.status).toBe(410)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      error: 'Legacy incomplete documentation scan is no longer available',
      reason: 'legacy_incomplete_docs_retired',
    })
    expect(jsonSpy).not.toHaveBeenCalled()
    for (const dependency of [
      authorizeClinicalAccessMock,
      fromMock,
      getPoolMock,
      getTenantServerMock,
      getUserMock,
      notifyIncompleteNotesMock,
      queryMock,
    ]) {
      expect(dependency).not.toHaveBeenCalled()
    }
  })
})
