import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  authorizeClinicalAccessMock,
  fromMock,
  getPoolMock,
  getTenantServerMock,
  getUserMock,
  getWearablePoolMock,
  isDemoEndpointsEnabledMock,
} = vi.hoisted(() => ({
  authorizeClinicalAccessMock: vi.fn(),
  fromMock: vi.fn(),
  getPoolMock: vi.fn(),
  getTenantServerMock: vi.fn(),
  getUserMock: vi.fn(),
  getWearablePoolMock: vi.fn(),
  isDemoEndpointsEnabledMock: vi.fn(),
}))

vi.mock('@/lib/appMode', () => ({
  isDemoEndpointsEnabled: isDemoEndpointsEnabledMock,
}))
vi.mock('@/lib/cognito/server', () => ({ getUser: getUserMock }))
vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeClinicalAccessMock,
}))
vi.mock('@/lib/tenant', () => ({ getTenantServer: getTenantServerMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/db', () => ({
  getPool: getPoolMock,
  getWearablePool: getWearablePoolMock,
}))

import { POST } from '../route'

const dbChain: Record<string, ReturnType<typeof vi.fn>> = {}
for (const method of ['delete', 'eq']) {
  dbChain[method] = vi.fn(() => dbChain)
}

describe('POST /api/admin/reset-demo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('DEMO_ENDPOINTS_ENABLED', 'true')
    vi.stubEnv('ADMIN_RESET_SECRET', 'synthetic-admin-secret')
    isDemoEndpointsEnabledMock.mockReturnValue(true)
    fromMock.mockReturnValue(dbChain)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is permanently retired before request parsing or dependency access', async () => {
    const request = new NextRequest('http://localhost/api/admin/reset-demo', {
      method: 'POST',
      headers: {
        authorization: 'Bearer synthetic-credential',
        'content-type': 'application/json',
        'x-admin-secret': 'synthetic-admin-secret',
      },
      body: JSON.stringify({ tenant_id: 'synthetic-demo-tenant' }),
    })
    const jsonSpy = vi.spyOn(request, 'json')

    const response = await (
      POST as unknown as (request: NextRequest) => Promise<Response>
    )(request)

    expect(response.status).toBe(410)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      error: 'Demo reset is no longer available',
      reason: 'destructive_demo_reset_retired',
    })
    expect(jsonSpy).not.toHaveBeenCalled()
    expect(isDemoEndpointsEnabledMock).not.toHaveBeenCalled()
    expect(getUserMock).not.toHaveBeenCalled()
    expect(authorizeClinicalAccessMock).not.toHaveBeenCalled()
    expect(getTenantServerMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
    expect(getPoolMock).not.toHaveBeenCalled()
    expect(getWearablePoolMock).not.toHaveBeenCalled()
  })
})
