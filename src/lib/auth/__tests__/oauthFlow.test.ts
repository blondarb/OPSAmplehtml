import { describe, expect, it } from 'vitest'

import {
  constantTimeStateMatch,
  resolveTrustedAppOrigin,
  sanitizeOAuthReturnTo,
} from '@/lib/auth/oauthFlow'

describe('OAuth flow boundary', () => {
  it('allows only same-application relative return paths', () => {
    expect(sanitizeOAuthReturnTo('/triage?view=queue')).toBe(
      '/triage?view=queue',
    )
    expect(sanitizeOAuthReturnTo('https://evil.example/steal')).toBe('/')
    expect(sanitizeOAuthReturnTo('//evil.example/steal')).toBe('/')
    expect(sanitizeOAuthReturnTo('\\\\evil.example\\steal')).toBe('/')
    expect(sanitizeOAuthReturnTo('triage')).toBe('/')
  })

  it('requires a configured HTTPS origin in production', () => {
    expect(
      resolveTrustedAppOrigin({
        configuredAppUrl: 'https://app.neuroplans.app/path',
        requestUrl: 'https://attacker.example/api/auth/login',
        nodeEnv: 'production',
      }),
    ).toBe('https://app.neuroplans.app')
    expect(
      resolveTrustedAppOrigin({
        configuredAppUrl: '',
        requestUrl: 'https://attacker.example/api/auth/login',
        nodeEnv: 'production',
      }),
    ).toBeNull()
    expect(
      resolveTrustedAppOrigin({
        configuredAppUrl: 'http://app.neuroplans.app',
        requestUrl: 'https://app.neuroplans.app/api/auth/login',
        nodeEnv: 'production',
      }),
    ).toBeNull()
  })

  it('uses the request origin only outside production', () => {
    expect(
      resolveTrustedAppOrigin({
        configuredAppUrl: '',
        requestUrl: 'http://localhost:3000/api/auth/login',
        nodeEnv: 'test',
      }),
    ).toBe('http://localhost:3000')
  })

  it('compares state without accepting missing or different values', () => {
    const state = 'a'.repeat(43)
    expect(constantTimeStateMatch(state, state)).toBe(true)
    expect(constantTimeStateMatch(state, `${'a'.repeat(42)}b`)).toBe(false)
    expect(constantTimeStateMatch(state, null)).toBe(false)
    expect(constantTimeStateMatch(null, state)).toBe(false)
  })
})
