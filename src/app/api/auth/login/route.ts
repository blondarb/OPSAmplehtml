import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cognitoPkceCookie, createPkceLogin } from '@/lib/cognito/pkce'

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
  const pkce = createPkceLogin(request.nextUrl.searchParams.get('returnTo'))
  const origin = getOrigin(request)
  const redirectUri = `${origin}/api/auth/callback`

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    state: pkce.state,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
  })

  const response = NextResponse.redirect(`https://${COGNITO_DOMAIN}/oauth2/authorize?${params}`)
  response.cookies.set(cognitoPkceCookie.name, pkce.cookie, {
    httpOnly: true,
    secure: origin.startsWith('https'),
    sameSite: 'lax',
    path: '/api/auth/callback',
    maxAge: cognitoPkceCookie.maxAge,
  })
  return response
}
