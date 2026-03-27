/**
 * Cognito Server-Side Auth (OAuth + PKCE via Hosted UI)
 *
 * Verifies Cognito ID tokens from httpOnly cookies using jose JWKS.
 * Used by middleware and API routes to authenticate requests.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const COGNITO_REGION = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-2'
const COGNITO_POOL_ID = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || 'us-east-2_9y6XyJnXC'
const JWKS_URL = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_POOL_ID}/.well-known/jwks.json`

const jwks = createRemoteJWKSet(new URL(JWKS_URL))

export interface AuthUser {
  id: string
  email: string
}

/**
 * Get authenticated user from cookies.
 * Returns null if no valid session.
 */
export async function getUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies()
    const idToken = cookieStore.get('id_token')?.value
    if (!idToken) return null

    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_POOL_ID}`,
    })

    const sub = payload.sub
    const email = (payload.email || payload['cognito:username']) as string | undefined

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
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_POOL_ID}`,
    })

    const sub = payload.sub
    const email = (payload.email || payload['cognito:username']) as string | undefined

    if (!sub || !email) return null

    return { id: sub, email }
  } catch {
    return null
  }
}
