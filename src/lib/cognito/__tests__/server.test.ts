import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  cookieGetMock,
  cookiesMock,
  createRemoteJWKSetMock,
  jwtVerifyMock,
  jwksMock,
} = vi.hoisted(() => {
  const jwks = vi.fn()
  return {
    cookieGetMock: vi.fn(),
    cookiesMock: vi.fn(),
    createRemoteJWKSetMock: vi.fn(() => jwks),
    jwtVerifyMock: vi.fn(),
    jwksMock: jwks,
  }
})

vi.mock('jose', () => ({
  createRemoteJWKSet: createRemoteJWKSetMock,
  jwtVerify: jwtVerifyMock,
}))

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}))

import { getUser, verifyToken } from '../server'

const originalClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
const issuer =
  'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_9y6XyJnXC'

const validPayload = {
  sub: 'user-123',
  email: 'clinician@example.com',
  token_use: 'id',
}

describe('Cognito server token validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID = 'clinical-client-123'
    cookieGetMock.mockReturnValue({ value: 'cookie-id-token' })
    cookiesMock.mockResolvedValue({ get: cookieGetMock })
    jwtVerifyMock.mockResolvedValue({ payload: validPayload })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(() => {
    if (originalClientId === undefined) {
      delete process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
    } else {
      process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID = originalClientId
    }
  })

  it('validates the cookie ID token against issuer and configured client audience', async () => {
    await expect(getUser()).resolves.toEqual({
      id: 'user-123',
      email: 'clinician@example.com',
    })

    expect(cookieGetMock).toHaveBeenCalledWith('id_token')
    expect(jwtVerifyMock).toHaveBeenCalledWith('cookie-id-token', jwksMock, {
      issuer,
      audience: 'clinical-client-123',
    })
  })

  it('validates a direct token against issuer and configured client audience', async () => {
    await expect(verifyToken('direct-id-token')).resolves.toEqual({
      id: 'user-123',
      email: 'clinician@example.com',
    })

    expect(jwtVerifyMock).toHaveBeenCalledWith('direct-id-token', jwksMock, {
      issuer,
      audience: 'clinical-client-123',
    })
  })

  it('fails closed without a configured Cognito client ID', async () => {
    delete process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID

    await expect(getUser()).resolves.toBeNull()
    await expect(verifyToken('direct-id-token')).resolves.toBeNull()
    expect(jwtVerifyMock).not.toHaveBeenCalled()
  })

  it.each([undefined, 'access'])('rejects token_use=%s for both entry points', async (tokenUse) => {
    jwtVerifyMock.mockResolvedValue({
      payload: { ...validPayload, token_use: tokenUse },
    })

    await expect(getUser()).resolves.toBeNull()
    await expect(verifyToken('direct-id-token')).resolves.toBeNull()
  })

  it.each([
    { payload: { email: validPayload.email, token_use: 'id' }, reason: 'missing sub' },
    { payload: { ...validPayload, sub: '' }, reason: 'empty sub' },
    { payload: { ...validPayload, sub: 42 }, reason: 'non-string sub' },
    {
      payload: {
        sub: validPayload.sub,
        token_use: 'id',
        'cognito:username': 'legacy-username',
      },
      reason: 'missing email even when a Cognito username is present',
    },
    { payload: { ...validPayload, email: '' }, reason: 'empty email' },
    { payload: { ...validPayload, email: 42 }, reason: 'non-string email' },
  ])('rejects invalid claims for both entry points ($reason)', async ({ payload }) => {
    jwtVerifyMock.mockResolvedValue({ payload })

    await expect(getUser()).resolves.toBeNull()
    await expect(verifyToken('direct-id-token')).resolves.toBeNull()
  })

  it.each(['missing audience claim', 'incorrect audience claim'])(
    'rejects %s without logging token data',
    async (validationFailure) => {
      const secretToken = 'sensitive-token-value'
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
      jwtVerifyMock.mockRejectedValue(new Error(validationFailure))

      cookieGetMock.mockReturnValue({ value: secretToken })
      await expect(getUser()).resolves.toBeNull()
      await expect(verifyToken(secretToken)).resolves.toBeNull()

      expect(errorSpy).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
      expect(logSpy).not.toHaveBeenCalled()
    },
  )
})
