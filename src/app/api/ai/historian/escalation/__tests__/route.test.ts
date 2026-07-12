import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  authorizeClinicalAccessMock,
  detectRedFlagsMock,
  fromMock,
  getPoolMock,
  getTenantServerMock,
  getUserMock,
  notifyIncompleteNotesMock,
  queryMock,
  resolveEscalationTierMock,
} = vi.hoisted(() => ({
  authorizeClinicalAccessMock: vi.fn(),
  detectRedFlagsMock: vi.fn(),
  fromMock: vi.fn(),
  getPoolMock: vi.fn(),
  getTenantServerMock: vi.fn(),
  getUserMock: vi.fn(),
  notifyIncompleteNotesMock: vi.fn(),
  queryMock: vi.fn(),
  resolveEscalationTierMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeClinicalAccessMock,
}))
vi.mock('@/lib/cognito/server', () => ({ getUser: getUserMock }))
vi.mock('@/lib/consult/red-flags/red-flag-detector', () => ({
  detectRedFlags: detectRedFlagsMock,
  resolveEscalationTier: resolveEscalationTierMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/notifications', () => ({
  notifyIncompleteNotes: notifyIncompleteNotesMock,
}))
vi.mock('@/lib/tenant', () => ({ getTenantServer: getTenantServerMock }))

import { GET, POST } from '../route'

const retiredBody = {
  error: 'Legacy historian escalation API has been superseded',
  reason: 'legacy_historian_escalation_superseded',
}

function expectNoDependencyAccess() {
  for (const dependency of [
    authorizeClinicalAccessMock,
    detectRedFlagsMock,
    fromMock,
    getPoolMock,
    getTenantServerMock,
    getUserMock,
    notifyIncompleteNotesMock,
    queryMock,
    resolveEscalationTierMock,
  ]) {
    expect(dependency).not.toHaveBeenCalled()
  }
}

describe('/api/ai/historian/escalation retirement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ query: queryMock })
  })

  it('retires POST before parsing malformed input or accessing clinical dependencies', async () => {
    const request = new NextRequest('http://localhost/api/ai/historian/escalation', {
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

  it('retires GET before reading query data or accessing clinical dependencies', async () => {
    const request = new NextRequest(
      'http://localhost/api/ai/historian/escalation?consult_id=synthetic-consult',
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
})
