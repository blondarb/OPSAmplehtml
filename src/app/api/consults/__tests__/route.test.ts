import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  authorizeClinicalAccessMock,
  fromMock,
  getTenantServerMock,
  getUserMock,
  notifyIncompleteNotesMock,
} = vi.hoisted(() => ({
  authorizeClinicalAccessMock: vi.fn(),
  fromMock: vi.fn(),
  getTenantServerMock: vi.fn(),
  getUserMock: vi.fn(),
  notifyIncompleteNotesMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeClinicalAccessMock,
}))
vi.mock('@/lib/cognito/server', () => ({ getUser: getUserMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/notifications', () => ({
  notifyIncompleteNotes: notifyIncompleteNotesMock,
}))
vi.mock('@/lib/tenant', () => ({ getTenantServer: getTenantServerMock }))

import { GET, PATCH, POST } from '../route'

const retiredBody = {
  error: 'Legacy provider consult API is no longer available',
  reason: 'legacy_provider_consults_retired',
}

function expectNoDependencyAccess() {
  for (const dependency of [
    authorizeClinicalAccessMock,
    fromMock,
    getTenantServerMock,
    getUserMock,
    notifyIncompleteNotesMock,
  ]) {
    expect(dependency).not.toHaveBeenCalled()
  }
}

describe('/api/consults retirement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retires GET before reading query data or accessing clinical dependencies', async () => {
    const request = new NextRequest(
      'http://localhost/api/consults?patient_id=synthetic-patient&user_id=synthetic-user',
      { headers: { authorization: 'Bearer synthetic-credential' } },
    )
    const jsonSpy = vi.spyOn(request, 'json')

    const response = await (
      GET as unknown as (request: NextRequest) => Promise<Response>
    )(request)

    expect(response.status).toBe(410)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual(retiredBody)
    expect(jsonSpy).not.toHaveBeenCalled()
    expectNoDependencyAccess()
  })

  for (const [method, handler] of [
    ['POST', POST],
    ['PATCH', PATCH],
  ] as const) {
    it(`retires ${method} before parsing malformed input or accessing clinical dependencies`, async () => {
      const request = new NextRequest('http://localhost/api/consults', {
        method,
        headers: {
          authorization: 'Bearer synthetic-credential',
          'content-type': 'application/json',
        },
        body: '{malformed-synthetic-json',
      })
      const jsonSpy = vi.spyOn(request, 'json')

      const response = await (
        handler as unknown as (request: NextRequest) => Promise<Response>
      )(request)

      expect(response.status).toBe(410)
      expect(response.headers.get('cache-control')).toBe('no-store')
      await expect(response.json()).resolves.toEqual(retiredBody)
      expect(jsonSpy).not.toHaveBeenCalled()
      expectNoDependencyAccess()
    })
  }
})
