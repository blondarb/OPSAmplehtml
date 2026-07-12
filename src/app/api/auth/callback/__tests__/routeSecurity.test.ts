import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const STATE = 'a'.repeat(43)

function callbackRequest(input: {
  state?: string
  returnTo?: string
  cookieState?: string
}) {
  const url = new URL('http://localhost:3000/api/auth/callback')
  url.searchParams.set('code', 'synthetic-code')
  if (input.state) url.searchParams.set('state', input.state)
  const cookies = [
    `sevaro_oauth_state=${input.cookieState ?? STATE}`,
    `sevaro_oauth_return_to=${encodeURIComponent(input.returnTo ?? '/triage')}`,
  ].join('; ')
  return new NextRequest(url, { headers: { cookie: cookies } })
}

describe('OAuth callback route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEXT_PUBLIC_COGNITO_CLIENT_ID', 'synthetic-client')
    vi.stubEnv('NEXT_PUBLIC_COGNITO_DOMAIN', 'auth.example.test')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    vi.doMock('@/lib/secrets', () => ({
      getCognitoClientSecret: vi.fn(async () => 'synthetic-client-secret'),
    }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.doUnmock('@/lib/secrets')
  })

  it('rejects a missing or mismatched state before token exchange', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { GET } = await import('../route')
    const response = await GET(
      callbackRequest({ state: 'b'.repeat(43), cookieState: STATE }),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('invalid_oauth_state')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(response.cookies.get('sevaro_oauth_state')?.value).toBe('')
  })

  it('uses a validated cookie return path and clears the single-use flow cookies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id_token: 'id-token',
            access_token: 'access-token',
            refresh_token: 'refresh-token',
          }),
          { status: 200 },
        ),
      ),
    )
    const { GET } = await import('../route')
    const response = await GET(
      callbackRequest({ state: STATE, returnTo: '/triage?view=queue' }),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/triage?view=queue',
    )
    expect(response.cookies.get('id_token')?.value).toBe('id-token')
    expect(response.cookies.get('sevaro_oauth_state')?.value).toBe('')
    expect(response.cookies.get('sevaro_oauth_return_to')?.value).toBe('')
  })

  it('neutralizes an externally controlled return cookie', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id_token: 'id-token',
            access_token: 'access-token',
          }),
          { status: 200 },
        ),
      ),
    )
    const { GET } = await import('../route')
    const response = await GET(
      callbackRequest({
        state: STATE,
        returnTo: 'https://evil.example/steal',
      }),
    )

    expect(response.headers.get('location')).toBe('http://localhost:3000/')
  })

  it('rejects a malformed token response without setting auth cookies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ access_token: 'access-only' }), {
          status: 200,
        }),
      ),
    )
    const { GET } = await import('../route')
    const response = await GET(callbackRequest({ state: STATE }))

    expect(response.headers.get('location')).toContain(
      'invalid_token_response',
    )
    expect(response.cookies.get('id_token')).toBeUndefined()
  })
})
