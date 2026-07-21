/**
 * HMAC-signed, stateless auth token for the transcript-flush endpoint
 * (POST /api/ai/historian/transcript-flush).
 *
 * Mirrors the mint pattern in
 * src/app/api/ai/historian/session/route.ts:28-47 (mintNovaRelayToken):
 * `${base64url(JSON.stringify(payload))}.${base64url(HMAC_SHA256(secret, payload))}`.
 * Differs in one deliberate way: mintNovaRelayToken returns `string | null`
 * and fails closed when no secret is configured, because a leaked relay
 * token can hijack a live, costly Bedrock voice stream. The flush token
 * protects a synthetic-data transcript-append endpoint that is explicitly
 * spec'd as "no auth beyond token (patient-portal pattern)" — the same bar
 * as /save and /session already sit at (no Cognito auth). So this module's
 * public signature is intentionally non-nullable (`mintFlushToken(...): string`)
 * and falls back to a fixed dev-only secret when neither
 * HISTORIAN_FLUSH_SECRET nor NOVA_RELAY_SHARED_SECRET is configured, so
 * mint/verify stay symmetric in local dev/test without live secrets.
 * Production MUST set one of the two real env vars (NOVA_RELAY_SHARED_SECRET
 * is already required there for the Nova voice path).
 */
import crypto from 'crypto'

const DEV_FALLBACK_SECRET = 'historian-flush-token-dev-only-insecure-default'

/**
 * Flush tokens must stay valid for the lifetime of an entire interview
 * (many turns, potentially many minutes) — not just a short handshake — so
 * the TTL is generous: 4 hours, comfortably longer than any plausible
 * historian session.
 */
export const FLUSH_TOKEN_TTL_SECONDS = 4 * 60 * 60

interface FlushTokenPayload {
  sessionId: string
  exp: number // unix seconds
}

function getSecret(): string {
  return (
    process.env.HISTORIAN_FLUSH_SECRET ||
    process.env.NOVA_RELAY_SHARED_SECRET ||
    DEV_FALLBACK_SECRET
  )
}

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromBase64Url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(padded, 'base64')
}

function sign(payloadB64: string, secret: string): string {
  return toBase64Url(crypto.createHmac('sha256', secret).update(payloadB64).digest())
}

export function mintFlushToken(sessionId: string): string {
  const payload: FlushTokenPayload = {
    sessionId,
    exp: Math.floor(Date.now() / 1000) + FLUSH_TOKEN_TTL_SECONDS,
  }
  const payloadB64 = toBase64Url(JSON.stringify(payload))
  const sig = sign(payloadB64, getSecret())
  return `${payloadB64}.${sig}`
}

export function verifyFlushToken(token: string): { sessionId: string } | null {
  if (!token || typeof token !== 'string') return null

  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sig] = parts
  if (!payloadB64 || !sig) return null

  const expectedSig = sign(payloadB64, getSecret())

  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null
  }

  let payload: FlushTokenPayload
  try {
    payload = JSON.parse(fromBase64Url(payloadB64).toString('utf8'))
  } catch {
    return null
  }

  if (!payload || typeof payload.sessionId !== 'string' || !payload.sessionId) return null
  if (typeof payload.exp === 'number' && Math.floor(Date.now() / 1000) > payload.exp) return null

  return { sessionId: payload.sessionId }
}
