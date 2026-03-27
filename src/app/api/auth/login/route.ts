import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || 'auth.neuroplans.app'
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || ''

function getOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  return forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : new URL(request.url).origin
}

export async function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get('returnTo') || '/'
  const state = Buffer.from(JSON.stringify({ returnTo })).toString('base64url')
  const origin = getOrigin(request)
  const redirectUri = `${origin}/api/auth/callback`

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    state,
  })

  return NextResponse.redirect(`https://${COGNITO_DOMAIN}/oauth2/authorize?${params}`)
}
