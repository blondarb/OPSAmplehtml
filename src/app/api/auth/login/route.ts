import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  createOAuthState,
  OAUTH_FLOW_MAX_AGE_SECONDS,
  OAUTH_RETURN_TO_COOKIE,
  OAUTH_STATE_COOKIE,
  resolveTrustedAppOrigin,
  sanitizeOAuthReturnTo,
} from '@/lib/auth/oauthFlow'

const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || 'auth.neuroplans.app'
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || ''

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || ''

export async function GET(request: NextRequest) {
  const origin = resolveTrustedAppOrigin({
    configuredAppUrl: APP_URL,
    requestUrl: request.url,
    nodeEnv: process.env.NODE_ENV,
  })
  if (!origin || !CLIENT_ID) {
    return NextResponse.json(
      { error: 'OAuth server configuration is unavailable' },
      { status: 503 },
    )
  }
  const returnTo = sanitizeOAuthReturnTo(
    request.nextUrl.searchParams.get('returnTo'),
  )
  const state = createOAuthState()
  const redirectUri = `${origin}/api/auth/callback`

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    state,
  })

  const response = NextResponse.redirect(
    `https://${COGNITO_DOMAIN}/oauth2/authorize?${params}`,
  )
  const cookieOptions = {
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: OAUTH_FLOW_MAX_AGE_SECONDS,
  }
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookieOptions)
  response.cookies.set(OAUTH_RETURN_TO_COOKIE, returnTo, cookieOptions)
  return response
}
