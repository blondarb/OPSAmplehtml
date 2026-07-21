/**
 * HMAC-signed, stateless auth token for the transcript-flush endpoint
 * (POST /api/ai/historian/transcript-flush).
 *
 * Mirrors the mint pattern in
 * src/app/api/ai/historian/session/route.ts:28-47 (mintNovaRelayToken):
 * `${base64url(JSON.stringify(payload))}.${base64url(HMAC_SHA256(secret, payload))}`.
 *
 * Secret resolution: HISTORIAN_FLUSH_SECRET, falling back to
 * NOVA_RELAY_SHARED_SECRET (already required in production for the Nova
 * voice path) — either real secret always wins when set. If NEITHER is
 * set:
 *   - Outside production: falls back to a fixed dev-only secret so
 *     mint/verify round-trip locally without any secrets configured.
 *   - In production (NODE_ENV === 'production'): FAILS CLOSED. The
 *     dev-only fallback is never reachable there. mintFlushToken THROWS
 *     (its signature stays the non-nullable `string` later tasks rely on —
 *     throwing, not returning an unusable value, is how it fails to
 *     produce one) and verifyFlushToken returns null for every token,
 *     including one minted earlier under a real secret that has since gone
 *     missing — nothing should be trusted once production has no
 *     configured secret to check against.
 */
import crypto from 'crypto'

/**
 * Dev/test-only fallback secret. Reachable ONLY when NODE_ENV is not
 * 'production' AND neither real secret env var is configured — see
 * resolveSecret() below. Never reachable in production.
 */
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

/**
 * Resolves the signing/verification secret. A configured real secret
 * (HISTORIAN_FLUSH_SECRET, falling back to NOVA_RELAY_SHARED_SECRET)
 * always wins. If neither is configured: returns the dev-only fallback
 * outside production, or null in production — the fail-closed signal both
 * mintFlushToken and verifyFlushToken key off of below.
 */
function resolveSecret(): string | null {
  const configured = process.env.HISTORIAN_FLUSH_SECRET || process.env.NOVA_RELAY_SHARED_SECRET
  if (configured) return configured
  if (process.env.NODE_ENV === 'production') return null
  return DEV_FALLBACK_SECRET
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
  const secret = resolveSecret()
  if (!secret) {
    // Fail closed: production with neither HISTORIAN_FLUSH_SECRET nor
    // NOVA_RELAY_SHARED_SECRET configured. Refuse to mint rather than
    // silently signing with a fallback secret in production.
    throw new Error(
      '[historian/flushToken] Refusing to mint a transcript-flush token in production: ' +
        'neither HISTORIAN_FLUSH_SECRET nor NOVA_RELAY_SHARED_SECRET is configured.',
    )
  }
  const payload: FlushTokenPayload = {
    sessionId,
    exp: Math.floor(Date.now() / 1000) + FLUSH_TOKEN_TTL_SECONDS,
  }
  const payloadB64 = toBase64Url(JSON.stringify(payload))
  const sig = sign(payloadB64, secret)
  return `${payloadB64}.${sig}`
}

export function verifyFlushToken(token: string): { sessionId: string } | null {
  if (!token || typeof token !== 'string') return null

  const secret = resolveSecret()
  if (!secret) return null // fail closed — no configured secret to verify against

  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sig] = parts
  if (!payloadB64 || !sig) return null

  const expectedSig = sign(payloadB64, secret)

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
