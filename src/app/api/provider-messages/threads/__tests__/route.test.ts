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

import { GET, POST } from '../route'

const retiredBody = {
  error: 'Legacy provider messaging API is no longer available',
  reason: 'legacy_provider_messaging_retired',
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

describe('/api/provider-messages/threads retirement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retires GET before accessing authentication, tenant, or data dependencies', async () => {
    const request = new NextRequest('http://localhost/api/provider-messages/threads', {
      headers: { authorization: 'Bearer synthetic-credential' },
    })
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

  it('retires POST before parsing malformed input or accessing clinical dependencies', async () => {
    const request = new NextRequest('http://localhost/api/provider-messages/threads', {
      method: 'POST',
      headers: {
        authorization: 'Bearer synthetic-credential',
        'content-type': 'application/json',
      },
      body: '{malformed-synthetic-json',
    })
    const jsonSpy = vi.spyOn(request, 'json')

    const response = await (
      POST as unknown as (request: NextRequest) => Promise<Response>
    )(request)

    expect(response.status).toBe(410)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual(retiredBody)
    expect(jsonSpy).not.toHaveBeenCalled()
    expectNoDependencyAccess()
  })
})
