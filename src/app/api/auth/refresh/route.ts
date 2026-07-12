import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { getCognitoClientSecret } from '@/lib/secrets'

const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || 'auth.neuroplans.app'
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || ''
const COGNITO_REGION = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-2'
const COGNITO_POOL_ID = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || 'us-east-2_9y6XyJnXC'

const JWKS_URL = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_POOL_ID}/.well-known/jwks.json`
const jwks = createRemoteJWKSet(new URL(JWKS_URL))

function clearAuthCookies(response: NextResponse) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  }
  response.cookies.set('id_token', '', options)
  response.cookies.set('access_token', '', options)
  response.cookies.set('refresh_token', '', options)
  return response
}

export async function POST() {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get('refresh_token')?.value

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 })
  }

  const clientSecret = await getCognitoClientSecret()
  if (!CLIENT_ID || !clientSecret) {
    return NextResponse.json(
      { error: 'OAuth server configuration is unavailable' },
      { status: 503 },
    )
  }

  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  }

  body.client_secret = clientSecret

  let tokenRes: Response
  try {
    tokenRes = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    })
  } catch {
    return NextResponse.json(
      { error: 'Refresh service unavailable' },
      { status: 503 },
    )
  }

  if (!tokenRes.ok) {
    return clearAuthCookies(
      NextResponse.json({ error: 'Refresh failed' }, { status: 401 }),
    )
  }

  const tokens: unknown = await tokenRes.json().catch(() => null)
  if (
    typeof tokens !== 'object' ||
    tokens === null ||
    typeof (tokens as Record<string, unknown>).id_token !== 'string' ||
    !(tokens as Record<string, unknown>).id_token ||
    typeof (tokens as Record<string, unknown>).access_token !== 'string' ||
    !(tokens as Record<string, unknown>).access_token
  ) {
    return clearAuthCookies(
      NextResponse.json({ error: 'Refresh failed' }, { status: 401 }),
    )
  }
  const id_token = (tokens as Record<string, string>).id_token
  const access_token = (tokens as Record<string, string>).access_token

  // Parse user from the new ID token
  let payload
  try {
    const verified = await jwtVerify(id_token, jwks, {
      issuer: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_POOL_ID}`,
      audience: CLIENT_ID,
    })
    payload = verified.payload
    if (payload.token_use !== 'id' || typeof payload.sub !== 'string') {
      throw new Error('Invalid Cognito ID token claims.')
    }
  } catch {
    return clearAuthCookies(
      NextResponse.json({ error: 'Refresh failed' }, { status: 401 }),
    )
  }

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
