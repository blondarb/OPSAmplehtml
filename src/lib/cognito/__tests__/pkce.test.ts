import crypto from 'crypto'
import { describe, expect, it } from 'vitest'
import { createPkceLogin, readPkceCallback } from '@/lib/cognito/pkce'

describe('Cognito PKCE login state', () => {
  it('creates a high-entropy S256 challenge and validates its matching callback state', () => {
    const login = createPkceLogin('/patient/historian')
    expect(login.challenge).toBe(
      crypto.createHash('sha256').update(login.verifier).digest('base64url'),
    )
    expect(login.state).not.toBe(login.verifier)
    expect(readPkceCallback(login.cookie, login.state)).toMatchObject({
      verifier: login.verifier,
      returnTo: '/patient/historian',
    })
  })

  it('rejects a callback with an altered state and does not permit external return URLs', () => {
    const login = createPkceLogin('https://untrusted.example/redirect')
    expect(readPkceCallback(login.cookie, `${login.state}x`)).toBeNull()
    expect(readPkceCallback(login.cookie, login.state)?.returnTo).toBe('/')
  })

  it.each(['//untrusted.example', '/\\untrusted.example', '/safe\nunsafe'])(
    'normalizes an unsafe same-origin return path (%s)',
    (returnTo) => {
      const login = createPkceLogin(returnTo)
      expect(readPkceCallback(login.cookie, login.state)?.returnTo).toBe('/')
    },
  )
})
