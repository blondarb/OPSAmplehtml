import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

describe('OAuth login route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEXT_PUBLIC_COGNITO_CLIENT_ID', 'synthetic-client')
    vi.stubEnv('NEXT_PUBLIC_COGNITO_DOMAIN', 'auth.example.test')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('sets an HttpOnly state cookie and never puts an external return URL in state', async () => {
    const { GET } = await import('../route')
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/auth/login?returnTo=https%3A%2F%2Fevil.example%2Fsteal',
      ),
    )

    expect(response.status).toBe(307)
    const authorization = new URL(response.headers.get('location')!)
    expect(authorization.origin).toBe('https://auth.example.test')
    expect(authorization.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/callback',
    )
    const state = authorization.searchParams.get('state')
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(state).not.toContain('evil')
    expect(response.cookies.get('sevaro_oauth_state')?.value).toBe(state)
    expect(response.cookies.get('sevaro_oauth_return_to')?.value).toBe('/')
    const setCookie = response.headers.get('set-cookie') || ''
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=lax')
  })

  it('fails closed in production without a configured application origin', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { GET } = await import('../route')
    const response = await GET(
      new NextRequest('https://untrusted.example/api/auth/login'),
    )

    expect(response.status).toBe(503)
  })
})
