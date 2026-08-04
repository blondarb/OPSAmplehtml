/**
 * Abuse guard for UNAUTHENTICATED routes that spend money or capacity.
 *
 * Audit 2026-08-04 N1: `/api/ai/historian/session` mints paid OpenAI Realtime
 * client secrets with no caller identity, and `/patient/historian` is a public
 * partner-demo URL. Without a guard, anyone with the path can drain the
 * Realtime quota — the realistic damage is a demo failing live, not a PHI
 * breach.
 *
 * This is deliberately NOT the platform auth net the July audit called for
 * (that work is gated on the PHI decision). It is a cheap, self-contained
 * brake for routes that must stay open to anonymous callers.
 *
 * LIMITATION, stated plainly: the counter is in-process memory. On Amplify SSR
 * each Lambda instance keeps its own window, so the effective cap is
 * (limit x live instances) and a cold start resets it. That is fine for its
 * actual purpose — stopping casual/scripted abuse of a demo link — and is not
 * a substitute for a shared limiter (Redis/DynamoDB) if these routes ever
 * carry real load or real PHI.
 */

export interface PublicRouteGuardOptions {
  /** Max requests per window per client key. */
  limit: number
  /** Window length in ms. */
  windowMs: number
  /**
   * Allowed request origins. A request whose Origin/Referer is present but not
   * on this list is rejected. Requests with NEITHER header are allowed through
   * to the rate limiter — server-to-server callers and some mobile webviews
   * legitimately omit both, and blocking them would break real users to stop an
   * attacker who can trivially forge the header anyway.
   */
  allowedOrigins?: string[]
}

export type GuardResult =
  | { ok: true }
  | { ok: false; status: 403 | 429; error: string; retryAfterSeconds?: number }

const buckets = new Map<string, { count: number; resetAt: number }>()

/** Bound the map so a burst of unique keys can't grow it without limit. */
const MAX_TRACKED_KEYS = 5_000

function sweep(now: number) {
  if (buckets.size < MAX_TRACKED_KEYS) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
  // Still oversized after dropping expired entries — drop the oldest.
  if (buckets.size >= MAX_TRACKED_KEYS) {
    const oldest = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)
    for (const [key] of oldest.slice(0, Math.floor(MAX_TRACKED_KEYS / 4))) {
      buckets.delete(key)
    }
  }
}

/** Best-effort client identity: the left-most X-Forwarded-For hop, else a shared bucket. */
export function clientKeyFromRequest(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown-client'
}

function originAllowed(request: Request, allowed: string[]): boolean {
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const candidate = origin || referer
  // Neither header — allow (see the option docs above).
  if (!candidate) return true
  let host: string
  try {
    host = new URL(candidate).origin
  } catch {
    return false
  }
  return allowed.some((entry) => {
    try {
      return new URL(entry).origin === host
    } catch {
      return false
    }
  })
}

/**
 * Returns `{ ok: true }` when the request may proceed. Callers turn a failure
 * into a response; this function never throws and never logs request content.
 */
export function checkPublicRouteAbuse(
  request: Request,
  routeKey: string,
  options: PublicRouteGuardOptions,
): GuardResult {
  const allowed = options.allowedOrigins?.filter(Boolean) ?? []
  if (allowed.length > 0 && !originAllowed(request, allowed)) {
    return { ok: false, status: 403, error: 'Request origin is not permitted for this endpoint.' }
  }

  const now = Date.now()
  sweep(now)

  const key = `${routeKey}:${clientKeyFromRequest(request)}`
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs })
    return { ok: true }
  }

  if (bucket.count >= options.limit) {
    return {
      ok: false,
      status: 429,
      error: 'Too many requests. Please wait a moment and try again.',
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }

  bucket.count += 1
  return { ok: true }
}

/** Test-only: drop all counters. */
export function __resetPublicRouteGuard() {
  buckets.clear()
}

/**
 * Origins permitted to start a voice session. Env override lets Amplify add
 * a preview domain without a code change; falls back to the known app hosts.
 */
export function allowedAppOrigins(): string[] {
  const configured = process.env.PUBLIC_ROUTE_ALLOWED_ORIGINS
  if (configured) {
    return configured.split(',').map((o) => o.trim()).filter(Boolean)
  }
  return [
    process.env.NEXT_PUBLIC_APP_URL || '',
    'https://app.neuroplans.app',
    'https://main.d3ietjwgco4g2t.amplifyapp.com',
    'http://localhost:3000',
  ].filter(Boolean)
}
