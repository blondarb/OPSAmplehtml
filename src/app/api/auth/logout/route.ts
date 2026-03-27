import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || 'auth.neuroplans.app'
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || ''

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
  const origin = getOrigin(request)

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
