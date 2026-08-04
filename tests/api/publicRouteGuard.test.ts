import { beforeEach, describe, expect, it } from 'vitest'

import {
  __resetPublicRouteGuard,
  allowedAppOrigins,
  checkPublicRouteAbuse,
  clientKeyFromRequest,
} from '@/lib/api/publicRouteGuard'

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://app.neuroplans.app/api/ai/historian/session', {
    method: 'POST',
    headers,
  })
}

const OPTS = {
  limit: 3,
  windowMs: 60_000,
  allowedOrigins: ['https://app.neuroplans.app'],
}

describe('publicRouteGuard', () => {
  beforeEach(() => __resetPublicRouteGuard())

  it('allows requests from an allowed origin up to the limit, then 429s', () => {
    const headers = { origin: 'https://app.neuroplans.app', 'x-forwarded-for': '203.0.113.9' }
    for (let i = 0; i < OPTS.limit; i++) {
      expect(checkPublicRouteAbuse(req(headers), 'r', OPTS).ok).toBe(true)
    }
    const blocked = checkPublicRouteAbuse(req(headers), 'r', OPTS)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) {
      expect(blocked.status).toBe(429)
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
    }
  })

  it('rejects a disallowed origin before spending any budget', () => {
    const evil = { origin: 'https://evil.example', 'x-forwarded-for': '203.0.113.10' }
    const result = checkPublicRouteAbuse(req(evil), 'r', OPTS)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)

    // The rejected request must not have consumed the caller's window.
    const good = { origin: 'https://app.neuroplans.app', 'x-forwarded-for': '203.0.113.10' }
    for (let i = 0; i < OPTS.limit; i++) {
      expect(checkPublicRouteAbuse(req(good), 'r', OPTS).ok).toBe(true)
    }
  })

  it('falls back to the referer when origin is absent', () => {
    const result = checkPublicRouteAbuse(
      req({ referer: 'https://evil.example/page', 'x-forwarded-for': '203.0.113.11' }),
      'r',
      OPTS,
    )
    expect(result.ok).toBe(false)
  })

  it('allows requests carrying neither origin nor referer (documented behavior)', () => {
    const result = checkPublicRouteAbuse(req({ 'x-forwarded-for': '203.0.113.12' }), 'r', OPTS)
    expect(result.ok).toBe(true)
  })

  it('buckets clients independently so one abuser cannot lock everyone out', () => {
    const a = { origin: 'https://app.neuroplans.app', 'x-forwarded-for': '203.0.113.1' }
    const b = { origin: 'https://app.neuroplans.app', 'x-forwarded-for': '203.0.113.2' }
    for (let i = 0; i < OPTS.limit; i++) checkPublicRouteAbuse(req(a), 'r', OPTS)
    expect(checkPublicRouteAbuse(req(a), 'r', OPTS).ok).toBe(false)
    expect(checkPublicRouteAbuse(req(b), 'r', OPTS).ok).toBe(true)
  })

  it('keys routes separately', () => {
    const h = { origin: 'https://app.neuroplans.app', 'x-forwarded-for': '203.0.113.3' }
    for (let i = 0; i < OPTS.limit; i++) checkPublicRouteAbuse(req(h), 'route-a', OPTS)
    expect(checkPublicRouteAbuse(req(h), 'route-a', OPTS).ok).toBe(false)
    expect(checkPublicRouteAbuse(req(h), 'route-b', OPTS).ok).toBe(true)
  })

  it('takes the left-most forwarded hop as the client key', () => {
    expect(
      clientKeyFromRequest(req({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1, 10.0.0.2' })),
    ).toBe('198.51.100.7')
  })

  it('always permits the production and local app origins', () => {
    const origins = allowedAppOrigins()
    expect(origins).toContain('https://app.neuroplans.app')
    expect(origins).toContain('http://localhost:3000')
  })
})
