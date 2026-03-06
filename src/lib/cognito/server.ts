/**
 * Cognito Server-Side Auth
 *
 * Verifies Cognito ID tokens from cookies using jose JWKS.
 * Used by middleware and API routes to authenticate requests.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID
const COGNITO_REGION = process.env.COGNITO_REGION || process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-2'
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID

const ISSUER = COGNITO_USER_POOL_ID
  ? `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`
  : ''

const JWKS_URL = ISSUER ? `${ISSUER}/.well-known/jwks.json` : ''

let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null

function getJWKS() {
  if (!cachedJWKS && JWKS_URL) {
    cachedJWKS = createRemoteJWKSet(new URL(JWKS_URL))
  }
  return cachedJWKS!
}

export interface AuthUser {
  id: string
  email: string
}

/**
 * Get authenticated user from cookies.
 * Returns null if no valid session.
 */
export async function getUser(): Promise<AuthUser | null> {
  if (!COGNITO_USER_POOL_ID || !COGNITO_CLIENT_ID) return null

  try {
    const cookieStore = await cookies()
    const idToken = cookieStore.get('cognito-id-token')?.value
    if (!idToken) return null

    const jwks = getJWKS()
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: ISSUER,
      audience: COGNITO_CLIENT_ID,
    })

    const sub = payload.sub
    const email = payload.email as string | undefined

    if (!sub || !email) return null

    return { id: sub, email }
  } catch {
    return null
  }
}

/**
 * Verify a JWT token string directly (for middleware where cookies() is not available).
 * Returns user info or null.
 */
export async function verifyToken(token: string): Promise<AuthUser | null> {
  if (!COGNITO_USER_POOL_ID || !COGNITO_CLIENT_ID) return null

  try {
    const jwks = getJWKS()
    const { payload } = await jwtVerify(token, jwks, {
      issuer: ISSUER,
      audience: COGNITO_CLIENT_ID,
    })

    const sub = payload.sub
    const email = payload.email as string | undefined

    if (!sub || !email) return null

    return { id: sub, email }
  } catch {
    return null
  }
}
