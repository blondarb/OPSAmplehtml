import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  issueMock,
  loadKeysMock,
  getPoolMock,
  createRepositoryMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  issueMock: vi.fn(),
  loadKeysMock: vi.fn(),
  getPoolMock: vi.fn(),
  createRepositoryMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/patientAccess/service', () => ({
  issuePatientInvite: issueMock,
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

import { POST } from '../route'

const PATIENT_ID = '11111111-1111-4111-8111-111111111111'
const CONSULT_ID = '22222222-2222-4222-8222-222222222222'

function request(body: Record<string, unknown>) {
  return new Request('https://app.example.test/api/patient-access/capabilities', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('patient capability issuance route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'clinician-1',
        email: 'clinician@example.test',
        tenantId: 'tenant-1',
        role: 'clinician',
      },
    })
    loadKeysMock.mockReturnValue({ activeKid: 'current', keys: new Map() })
    getPoolMock.mockResolvedValue({})
    createRepositoryMock.mockReturnValue({})
    issueMock.mockResolvedValue({
      token: 'header.payload.signature',
      claims: {
        exp: 2_000_003_600,
        jti: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    })
  })

  it('requires clinician or administrator authorization before secret or DB access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await POST(
      request({
        patient_id: PATIENT_ID,
        scopes: ['patient:historian:start'],
      }),
    )

    expect(response.status).toBe(401)
    expect(loadKeysMock).not.toHaveBeenCalled()
    expect(getPoolMock).not.toHaveBeenCalled()
    expect(issueMock).not.toHaveBeenCalled()
  })

  it('uses the authenticated tenant and returns a fragment-exchange token once', async () => {
    const response = await POST(
      request({
        tenant_id: 'attacker-tenant',
        patient_id: PATIENT_ID,
        consult_id: CONSULT_ID,
        scopes: ['patient:historian:start', 'patient:historian:save'],
        ttl_seconds: 3600,
      }),
    )

    expect(response.status).toBe(201)
    expect(issueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        patientId: PATIENT_ID,
        consultId: CONSULT_ID,
        actorUserId: 'clinician-1',
        actorRole: 'clinician',
      }),
      expect.objectContaining({ repository: {}, keys: expect.anything() }),
    )
    const json = await response.json()
    expect(json).toEqual({
      capability_token: 'header.payload.signature',
      expires_at: 2_000_003_600,
      exchange: {
        transport: 'url_fragment',
        fragment_parameter: 'capability',
        method: 'POST',
        endpoint: '/api/patient-access/redeem',
      },
    })
    expect(JSON.stringify(json)).not.toContain('?capability=')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('rejects unknown scopes and malformed identifiers before persistence', async () => {
    const response = await POST(
      request({
        patient_id: 'not-a-uuid',
        scopes: ['patient:everything'],
      }),
    )

    expect(response.status).toBe(400)
    expect(issueMock).not.toHaveBeenCalled()
  })

  it('rejects oversized issuance bodies before secret or DB access', async () => {
    const response = await POST(
      new Request('https://app.example.test/api/patient-access/capabilities', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filler: 'x'.repeat(20_000) }),
      }),
    )

    expect(response.status).toBe(413)
    expect(loadKeysMock).not.toHaveBeenCalled()
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('fails closed without signing configuration and does not disclose configuration detail', async () => {
    loadKeysMock.mockImplementationOnce(() => {
      throw new Error('PATIENT_ACCESS_SIGNING_KEYS_JSON missing')
    })

    const response = await POST(
      request({
        patient_id: PATIENT_ID,
        scopes: ['patient:historian:start'],
      }),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'Patient access issuance unavailable',
    })
  })
})
