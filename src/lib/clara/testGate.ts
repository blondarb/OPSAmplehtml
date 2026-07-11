/**
 * Clara voice test — standalone password gate.
 *
 * Self-contained (does NOT depend on Cognito or the unmerged FAQ POC gate).
 * `/rnd/clara` is added to middleware.ts PUBLIC_ROUTES so it works without a
 * Cognito session — access is controlled entirely by this password check,
 * appropriate for a synthetic/internal-only R&D surface.
 *
 * Mechanism: POST /api/ai/clara/auth compares the submitted password
 * (constant-time) against CLARA_TEST_PASSWORD. On success it mints a signed,
 * time-limited token (HMAC-SHA256 keyed by the same secret — same pattern as
 * mintNovaRelayToken in src/app/api/ai/historian/session/route.ts) and sets
 * it as an httpOnly cookie scoped to /rnd/clara. The page (server component)
 * verifies that cookie on each load — never trusts client state.
 *
 * Fail-closed: if CLARA_TEST_PASSWORD is unset, isGateConfigured() is false,
 * checkPassword() always rejects, and verifyGateToken() always rejects.
 */

import crypto from 'crypto'

export const CLARA_GATE_COOKIE = 'clara_test_auth'
export const CLARA_GATE_TTL_SECONDS = 60 * 60 * 24 // 24h

function getSecret(): string | null {
  return process.env.CLARA_TEST_PASSWORD || null
}

export function isGateConfigured(): boolean {
  return !!getSecret()
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function sign(payloadB64: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

/** Constant-time password comparison against CLARA_TEST_PASSWORD. */
export function checkPassword(candidate: string): boolean {
  const secret = getSecret()
  if (!secret || typeof candidate !== 'string') return false
  const a = Buffer.from(candidate)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** Mints a signed gate token. Returns null if CLARA_TEST_PASSWORD is unset. */
export function mintGateToken(): string | null {
  const secret = getSecret()
  if (!secret) return null
  const payloadB64 = base64url(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + CLARA_GATE_TTL_SECONDS }))
  return `${payloadB64}.${sign(payloadB64, secret)}`
}

/** Verifies a gate token from the cookie. Fail-closed on any missing/invalid/expired input. */
export function verifyGateToken(token: string | undefined | null): boolean {
  const secret = getSecret()
  if (!secret || !token) return false

  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [payloadB64, sig] = parts

  const expectedSig = sign(payloadB64, secret)
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false
  } catch {
    return false
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    return typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}
