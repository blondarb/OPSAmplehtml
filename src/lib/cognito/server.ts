/**
 * Cognito Server-Side Auth (OAuth + PKCE via Hosted UI)
 *
 * Verifies Cognito ID tokens from httpOnly cookies using jose JWKS.
 * Used by middleware and API routes to authenticate requests.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { cookies } from 'next/headers'

const COGNITO_REGION = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-2'
const COGNITO_POOL_ID = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || 'us-east-2_9y6XyJnXC'
const COGNITO_ISSUER = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_POOL_ID}`
const JWKS_URL = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_POOL_ID}/.well-known/jwks.json`

const jwks = createRemoteJWKSet(new URL(JWKS_URL))

export interface AuthUser {
  id: string
  email: string
}

function getConfiguredClientId(): string | null {
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID?.trim()
  return clientId || null
}

function getUserFromPayload(payload: JWTPayload): AuthUser | null {
  if (payload.token_use !== 'id') return null

  const { sub, email } = payload
  if (typeof sub !== 'string' || sub.trim().length === 0) return null
  if (typeof email !== 'string' || email.trim().length === 0) return null

  return { id: sub, email }
}

async function verifyIdToken(token: string): Promise<AuthUser | null> {
  try {
    const clientId = getConfiguredClientId()
    if (!clientId) return null

    const { payload } = await jwtVerify(token, jwks, {
      issuer: COGNITO_ISSUER,
      audience: clientId,
    })

    return getUserFromPayload(payload)
  } catch {
    return null
  }
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

    return verifyIdToken(idToken)
  } catch {
    return null
  }
}

/**
 * Verify a JWT token string directly (for middleware where cookies() is not available).
 * Returns user info or null.
 */
export async function verifyToken(token: string): Promise<AuthUser | null> {
  return verifyIdToken(token)
}
