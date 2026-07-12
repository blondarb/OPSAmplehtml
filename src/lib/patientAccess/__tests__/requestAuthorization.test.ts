import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  cookiesMock,
  authorizeSessionMock,
  loadKeysMock,
  getPoolMock,
  createRepositoryMock,
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  authorizeSessionMock: vi.fn(),
  loadKeysMock: vi.fn(),
  getPoolMock: vi.fn(),
  createRepositoryMock: vi.fn(),
}))

vi.mock('next/headers', () => ({ cookies: cookiesMock }))
vi.mock('@/lib/patientAccess/service', () => ({
  authorizePatientSession: authorizeSessionMock,
  PatientAccessServiceError: class PatientAccessServiceError extends Error {
    constructor(public code: string) {
      super(code)
    }
  },
}))
vi.mock('@/lib/patientAccess/capability', async () => {
  const actual = await vi.importActual('@/lib/patientAccess/capability')
  return { ...actual, loadPatientAccessKeyRing: loadKeysMock }
})
vi.mock('@/lib/patientAccess/postgresRepository', () => ({
  createPostgresPatientAccessRepository: createRepositoryMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { authorizePatientRequest } from '../requestAuthorization'

describe('patient request authorization helper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cookiesMock.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: 'session.header.payload.signature' }),
    })
    loadKeysMock.mockReturnValue({ activeKid: 'current', keys: new Map() })
    getPoolMock.mockResolvedValue({})
    createRepositoryMock.mockReturnValue({})
    authorizeSessionMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      patient_id: '11111111-1111-4111-8111-111111111111',
      consult_id: '22222222-2222-4222-8222-222222222222',
      scopes: ['patient:historian:start'],
    })
  })

  it('fails before configuration or DB access when the HttpOnly session is absent', async () => {
    cookiesMock.mockResolvedValueOnce({ get: vi.fn().mockReturnValue(undefined) })

    await expect(
      authorizePatientRequest({
        expectedTenantId: 'tenant-1',
        requiredScopes: ['patient:historian:start'],
      }),
    ).resolves.toEqual({
      ok: false,
      status: 401,
      reason: 'missing_patient_session',
    })
    expect(loadKeysMock).not.toHaveBeenCalled()
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('binds cookie authorization to tenant, patient, consult, scope, and DB lifecycle', async () => {
    const result = await authorizePatientRequest({
      expectedTenantId: 'tenant-1',
      expectedPatientId: '11111111-1111-4111-8111-111111111111',
      expectedConsultId: '22222222-2222-4222-8222-222222222222',
      requiredScopes: ['patient:historian:start'],
    })

    expect(result).toMatchObject({ ok: true })
    expect(authorizeSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'session.header.payload.signature',
        expectedTenantId: 'tenant-1',
        expectedPatientId: '11111111-1111-4111-8111-111111111111',
        expectedConsultId: '22222222-2222-4222-8222-222222222222',
        requiredScopes: ['patient:historian:start'],
      }),
      expect.objectContaining({ repository: {}, keys: expect.anything() }),
    )
  })

  it('derives the tenant from the signed session when no caller binding is available', async () => {
    const result = await authorizePatientRequest({
      requiredScopes: ['patient:historian:start'],
    })

    expect(result).toMatchObject({
      ok: true,
      context: { tenantId: 'tenant-1' },
    })
    expect(authorizeSessionMock).toHaveBeenCalledWith(
      {
        token: 'session.header.payload.signature',
        requiredScopes: ['patient:historian:start'],
      },
      expect.objectContaining({ repository: {}, keys: expect.anything() }),
    )
  })

  it.each([
    ['scope_denied', 403, 'scope_denied'],
    ['binding_invalid', 403, 'binding_mismatch'],
    ['expired', 401, 'invalid_patient_session'],
    ['revoked', 401, 'invalid_patient_session'],
    ['unknown_capability', 401, 'invalid_patient_session'],
  ] as const)('maps %s without exposing tokens', async (code, status, reason) => {
    const ServiceError = (await import('@/lib/patientAccess/service'))
      .PatientAccessServiceError
    authorizeSessionMock.mockRejectedValueOnce(new ServiceError(code))

    const result = await authorizePatientRequest({
      expectedTenantId: 'tenant-1',
      requiredScopes: ['patient:historian:start'],
    })

    expect(result).toEqual({ ok: false, status, reason })
    expect(JSON.stringify(result)).not.toContain('session.header.payload.signature')
  })

  it('fails closed when secrets or lifecycle storage are unavailable', async () => {
    loadKeysMock.mockImplementationOnce(() => {
      throw new Error('missing secret')
    })

    await expect(
      authorizePatientRequest({
        expectedTenantId: 'tenant-1',
        requiredScopes: ['patient:historian:start'],
      }),
    ).resolves.toEqual({
      ok: false,
      status: 503,
      reason: 'authorization_unavailable',
    })
  })

  it('fails closed when the server cookie store is unavailable', async () => {
    cookiesMock.mockRejectedValueOnce(new Error('request context unavailable'))

    await expect(
      authorizePatientRequest({
        expectedTenantId: 'tenant-1',
        requiredScopes: ['patient:historian:start'],
      }),
    ).resolves.toEqual({
      ok: false,
      status: 503,
      reason: 'authorization_unavailable',
    })
    expect(getPoolMock).not.toHaveBeenCalled()
  })
})
