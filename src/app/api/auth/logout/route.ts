import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || 'auth.neuroplans.app'
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || ''

export async function GET(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000'
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  const logoutUri = `${protocol}://${host}`

  const response = NextResponse.redirect(
    `https://${COGNITO_DOMAIN}/logout?client_id=${CLIENT_ID}&logout_uri=${encodeURIComponent(logoutUri)}`
  )

  const cookieOpts = {
    httpOnly: true,
    secure: !host.startsWith('localhost'),
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
