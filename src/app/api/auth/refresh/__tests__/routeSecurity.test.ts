import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { cookiesMock, jwtVerifyMock, secretMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  jwtVerifyMock: vi.fn(),
  secretMock: vi.fn(),
}))

vi.mock('next/headers', () => ({ cookies: cookiesMock }))
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'synthetic-jwks'),
  jwtVerify: jwtVerifyMock,
}))
vi.mock('@/lib/secrets', () => ({
  getCognitoClientSecret: secretMock,
}))

describe('OAuth refresh route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEXT_PUBLIC_COGNITO_CLIENT_ID', 'synthetic-client')
    vi.stubEnv('NEXT_PUBLIC_COGNITO_DOMAIN', 'auth.example.test')
    vi.stubEnv('NEXT_PUBLIC_COGNITO_REGION', 'us-east-2')
    vi.stubEnv('NEXT_PUBLIC_COGNITO_USER_POOL_ID', 'us-east-2_synthetic')
    cookiesMock.mockResolvedValue({
      get: vi.fn((name: string) =>
        name === 'refresh_token' ? { value: 'refresh-token' } : undefined,
      ),
    })
    secretMock.mockResolvedValue('synthetic-client-secret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('verifies issuer, audience, token use, and subject before rotating cookies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id_token: 'new-id-token',
            access_token: 'new-access-token',
          }),
          { status: 200 },
        ),
      ),
    )
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: 'user-1',
        email: 'clinician@example.test',
        token_use: 'id',
      },
    })
    const { POST } = await import('../route')
    const response = await POST()

    expect(response.status).toBe(200)
    expect(jwtVerifyMock).toHaveBeenCalledWith(
      'new-id-token',
      'synthetic-jwks',
      expect.objectContaining({
        issuer:
          'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_synthetic',
        audience: 'synthetic-client',
      }),
    )
    expect(response.cookies.get('id_token')?.value).toBe('new-id-token')
    expect(response.cookies.get('access_token')?.value).toBe(
      'new-access-token',
    )
  })

  it('clears auth cookies when token claims do not describe an ID token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id_token: 'wrong-token-use',
            access_token: 'new-access-token',
          }),
          { status: 200 },
        ),
      ),
    )
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: 'user-1', token_use: 'access' },
    })
    const { POST } = await import('../route')
    const response = await POST()

    expect(response.status).toBe(401)
    expect(response.cookies.get('id_token')?.value).toBe('')
    expect(response.cookies.get('refresh_token')?.value).toBe('')
  })

  it('rejects malformed token JSON before signature verification', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ access_token: 'missing-id' }), {
          status: 200,
        }),
      ),
    )
    const { POST } = await import('../route')
    const response = await POST()

    expect(response.status).toBe(401)
    expect(jwtVerifyMock).not.toHaveBeenCalled()
  })
})
