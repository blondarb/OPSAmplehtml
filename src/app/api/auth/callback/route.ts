import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || 'auth.neuroplans.app'
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || ''
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET || ''

function getRedirectUri(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000'
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  return `${protocol}://${host}/api/auth/callback`
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', request.url))
  }

  let returnTo = '/'
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
      returnTo = decoded.returnTo || '/'
    } catch {
      // Invalid state — use default
    }
  }

  const redirectUri = getRedirectUri(request)

  // Exchange authorization code for tokens
  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code,
    redirect_uri: redirectUri,
  }

  if (CLIENT_SECRET) {
    body.client_secret = CLIENT_SECRET
  }

  const tokenRes = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/login?error=token_exchange', request.url))
  }

  const tokens = await tokenRes.json()
  const { id_token, access_token, refresh_token } = tokens

  const response = NextResponse.redirect(new URL(returnTo, request.url))
  const isSecure = !request.headers.get('host')?.startsWith('localhost')

  const cookieOpts = {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax' as const,
    path: '/',
  }

  response.cookies.set('id_token', id_token, { ...cookieOpts, maxAge: 60 * 60 })
  response.cookies.set('access_token', access_token, { ...cookieOpts, maxAge: 60 * 60 })
  if (refresh_token) {
    response.cookies.set('refresh_token', refresh_token, { ...cookieOpts, maxAge: 60 * 60 * 24 * 30 })
  }

  // Clear legacy cookie names if present
  response.cookies.set('cognito-id-token', '', { ...cookieOpts, maxAge: 0 })
  response.cookies.set('cognito-access-token', '', { ...cookieOpts, maxAge: 0 })
  response.cookies.set('cognito-refresh-token', '', { ...cookieOpts, maxAge: 0 })

  return response
}
