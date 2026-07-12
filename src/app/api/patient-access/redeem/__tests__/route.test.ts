import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  redeemMock,
  loadKeysMock,
  getPoolMock,
  createRepositoryMock,
} = vi.hoisted(() => ({
  redeemMock: vi.fn(),
  loadKeysMock: vi.fn(),
  getPoolMock: vi.fn(),
  createRepositoryMock: vi.fn(),
}))

vi.mock('@/lib/patientAccess/service', () => ({
  redeemPatientInvite: redeemMock,
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

function request(body: string) {
  return new Request('https://app.example.test/api/patient-access/redeem', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://app.example.test',
    },
    body,
  })
}

describe('patient capability redemption route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadKeysMock.mockReturnValue({ activeKid: 'current', keys: new Map() })
    getPoolMock.mockResolvedValue({})
    createRepositoryMock.mockReturnValue({})
    redeemMock.mockResolvedValue({
      sessionToken: 'session.header.payload.signature',
      claims: { exp: 2_000_000_900 },
    })
  })

  it('accepts the invite only in a bounded POST body and creates a hardened cookie', async () => {
    const response = await POST(
      request(JSON.stringify({ capability_token: 'invite.header.payload.signature' })),
    )

    expect(response.status).toBe(200)
    expect(redeemMock).toHaveBeenCalledWith(
      { token: 'invite.header.payload.signature' },
      expect.objectContaining({ repository: {}, keys: expect.anything() }),
    )
    const json = await response.json()
    expect(json).toEqual({
      success: true,
      expires_at: 2_000_000_900,
      redirect_path: '/patient/historian',
    })
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('__Host-sevaro_patient_access=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=strict')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('invite.header.payload.signature')
    expect(JSON.stringify(json)).not.toContain('sessionToken')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('rejects oversized bodies before parsing or accessing secrets', async () => {
    const response = await POST(request('x'.repeat(9000)))

    expect(response.status).toBe(413)
    expect(loadKeysMock).not.toHaveBeenCalled()
    expect(redeemMock).not.toHaveBeenCalled()
  })

  it('reports replay without minting another cookie', async () => {
    const ServiceError = (await import('@/lib/patientAccess/service'))
      .PatientAccessServiceError
    redeemMock.mockRejectedValueOnce(new ServiceError('replay_detected'))

    const response = await POST(
      request(JSON.stringify({ capability_token: 'invite.header.payload.signature' })),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Patient access invitation cannot be redeemed',
      reason: 'replay_detected',
    })
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('does not accept capability tokens from URL query parameters', async () => {
    const response = await POST(
      new Request(
        'https://app.example.test/api/patient-access/redeem?capability=leaked',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'https://app.example.test',
          },
          body: JSON.stringify({}),
        },
      ),
    )

    expect(response.status).toBe(400)
    expect(redeemMock).not.toHaveBeenCalled()
  })

  it.each([
    [{ 'content-type': 'application/json' }, 403, 'missing provenance'],
    [
      {
        'content-type': 'application/json',
        origin: 'https://attacker.example.test',
      },
      403,
      'cross-origin request',
    ],
    [
      {
        'content-type': 'text/plain',
        origin: 'https://app.example.test',
      },
      415,
      'non-JSON content',
    ],
  ])('rejects %s before reading or redeeming a capability', async (headers, status, _description) => {
    const secret = 'invite.header.payload.signature'
    const response = await POST(
      new Request('https://app.example.test/api/patient-access/redeem', {
        method: 'POST',
        headers,
        body: JSON.stringify({ capability_token: secret }),
      }),
    )

    expect(response.status).toBe(status)
    expect(redeemMock).not.toHaveBeenCalled()
    expect(await response.text()).not.toContain(secret)
  })

  it('accepts an exact same-origin Referer when Origin is unavailable', async () => {
    const response = await POST(
      new Request('https://app.example.test/api/patient-access/redeem', {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          referer: 'https://app.example.test/patient/access',
        },
        body: JSON.stringify({
          capability_token: 'invite.header.payload.signature',
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(redeemMock).toHaveBeenCalledOnce()
  })
})
