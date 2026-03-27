import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || 'auth.neuroplans.app'
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || ''

function getRedirectUri(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000'
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  return `${protocol}://${host}/api/auth/callback`
}

export async function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get('returnTo') || '/'
  const state = Buffer.from(JSON.stringify({ returnTo })).toString('base64url')
  const redirectUri = getRedirectUri(request)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    state,
  })

  return NextResponse.redirect(`https://${COGNITO_DOMAIN}/oauth2/authorize?${params}`)
}
