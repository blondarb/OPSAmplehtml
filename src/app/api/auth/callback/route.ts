import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || 'auth.neuroplans.app'
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || ''
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET || ''

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || ''

function getOrigin(request: NextRequest): string {
  if (APP_URL) return APP_URL
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  return forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : new URL(request.url).origin
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')

  const origin = getOrigin(request)

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', origin))
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

  const redirectUri = `${origin}/api/auth/callback`

  // Exchange authorization code for tokens (confidential client — includes client_secret)
  const tokenRes = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text()
    console.error('Cognito token exchange failed:', tokenRes.status, errBody)
    return NextResponse.redirect(new URL('/login?error=token_exchange', origin))
  }

  const tokens = await tokenRes.json()
  const { id_token, access_token, refresh_token } = tokens

  const response = NextResponse.redirect(new URL(returnTo, origin))
  const isSecure = origin.startsWith('https')

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
