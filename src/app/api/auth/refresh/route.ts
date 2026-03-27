import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { jwtVerify, createRemoteJWKSet } from 'jose'

const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || 'auth.neuroplans.app'
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || ''
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET || ''
const COGNITO_REGION = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-2'
const COGNITO_POOL_ID = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || 'us-east-2_9y6XyJnXC'

const JWKS_URL = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_POOL_ID}/.well-known/jwks.json`
const jwks = createRemoteJWKSet(new URL(JWKS_URL))

export async function POST() {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get('refresh_token')?.value

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 })
  }

  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
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
    return NextResponse.json({ error: 'Refresh failed' }, { status: 401 })
  }

  const tokens = await tokenRes.json()
  const { id_token, access_token } = tokens

  // Parse user from the new ID token
  const { payload } = await jwtVerify(id_token, jwks, {
    issuer: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_POOL_ID}`,
  })

  const isSecure = process.env.NODE_ENV === 'production'
  const cookieOpts = {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax' as const,
    path: '/',
  }

  const response = NextResponse.json({
    id: payload.sub,
    email: (payload.email || payload['cognito:username']) as string,
  })

  response.cookies.set('id_token', id_token, { ...cookieOpts, maxAge: 60 * 60 })
  response.cookies.set('access_token', access_token, { ...cookieOpts, maxAge: 60 * 60 })

  return response
}
