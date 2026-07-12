import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'

const { getUserMock, getPoolMock, queryMock, getTenantMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  getTenantMock: vi.fn(),
}))

vi.mock('@/lib/cognito/server', () => ({ getUser: getUserMock }))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/tenant', () => ({ getTenantServer: getTenantMock }))

describe('authorizeClinicalAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getTenantMock.mockReturnValue('tenant-1')
    getPoolMock.mockResolvedValue({ query: queryMock })
    getUserMock.mockResolvedValue({ id: 'user-1', email: 'clinician@example.test' })
    queryMock.mockResolvedValue({
      rows: [
        {
          user_id: 'user-1',
          tenant_id: 'tenant-1',
          role: 'clinician',
        },
      ],
    })
  })

  it('returns 401 before database access when there is no verified user', async () => {
    getUserMock.mockResolvedValueOnce(null)

    await expect(
      authorizeClinicalAccess({
        action: 'consult.read',
        allowedRoles: ['clinician', 'admin'],
      }),
    ).resolves.toEqual({ ok: false, status: 401, reason: 'unauthenticated' })
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('returns authoritative tenant and server-managed role', async () => {
    await expect(
      authorizeClinicalAccess({
        action: 'consult.read',
        allowedRoles: ['clinician', 'admin'],
      }),
    ).resolves.toEqual({
      ok: true,
      context: {
        userId: 'user-1',
        email: 'clinician@example.test',
        tenantId: 'tenant-1',
        role: 'clinician',
      },
    })
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('clinical_access_memberships'),
      ['user-1', 'tenant-1'],
    )
  })

  it('rejects an authenticated user without an allowed active membership', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ user_id: 'user-1', tenant_id: 'tenant-1', role: 'viewer' }],
    })

    await expect(
      authorizeClinicalAccess({
        action: 'triage.schedule',
        allowedRoles: ['scheduler', 'clinician', 'admin'],
      }),
    ).resolves.toEqual({ ok: false, status: 403, reason: 'forbidden' })
  })

  it('fails closed when the membership store is unavailable', async () => {
    queryMock.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(
      authorizeClinicalAccess({
        action: 'historian.start',
        allowedRoles: ['clinician', 'admin'],
      }),
    ).resolves.toEqual({
      ok: false,
      status: 503,
      reason: 'authorization_unavailable',
    })
  })
})
