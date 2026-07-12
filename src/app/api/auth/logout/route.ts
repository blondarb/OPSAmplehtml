import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveTrustedAppOrigin } from '@/lib/auth/oauthFlow'

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

  const response = NextResponse.redirect(
    `https://${COGNITO_DOMAIN}/logout?client_id=${CLIENT_ID}&logout_uri=${encodeURIComponent(origin)}`
  )

  const cookieOpts = {
    httpOnly: true,
    secure: origin.startsWith('https'),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  }

  response.cookies.set('id_token', '', cookieOpts)
  response.cookies.set('access_token', '', cookieOpts)
  response.cookies.set('refresh_token', '', cookieOpts)
  // Clear legacy cookies too
  response.cookies.set('cognito-id-token', '', cookieOpts)
  response.cookies.set('cognito-access-token', '', cookieOpts)
  response.cookies.set('cognito-refresh-token', '', cookieOpts)

  return response
}
