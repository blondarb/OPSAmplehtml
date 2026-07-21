import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FLUSH_TOKEN_TTL_SECONDS, mintFlushToken, verifyFlushToken } from '@/lib/historian/flushToken'

describe('flushToken', () => {
  const originalFlushSecret = process.env.HISTORIAN_FLUSH_SECRET
  const originalRelaySecret = process.env.NOVA_RELAY_SHARED_SECRET

  beforeEach(() => {
    process.env.HISTORIAN_FLUSH_SECRET = 'test-flush-secret'
    delete process.env.NOVA_RELAY_SHARED_SECRET
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalFlushSecret === undefined) delete process.env.HISTORIAN_FLUSH_SECRET
    else process.env.HISTORIAN_FLUSH_SECRET = originalFlushSecret
    if (originalRelaySecret === undefined) delete process.env.NOVA_RELAY_SHARED_SECRET
    else process.env.NOVA_RELAY_SHARED_SECRET = originalRelaySecret
  })

  it('round-trips a sessionId through mint -> verify', () => {
    const token = mintFlushToken('abc')
    expect(typeof token).toBe('string')
    expect(verifyFlushToken(token)).toEqual({ sessionId: 'abc' })
  })

  it('produces different, independently-verifiable tokens for different sessionIds', () => {
    const t1 = mintFlushToken('session-1')
    const t2 = mintFlushToken('session-2')
    expect(t1).not.toBe(t2)
    expect(verifyFlushToken(t1)).toEqual({ sessionId: 'session-1' })
    expect(verifyFlushToken(t2)).toEqual({ sessionId: 'session-2' })
  })

  it('rejects a tampered token (flipped signature char)', () => {
    const token = mintFlushToken('abc')
    const lastChar = token.at(-1)
    const flipped = lastChar === 'A' ? 'B' : 'A'
    const tampered = token.slice(0, -1) + flipped
    expect(verifyFlushToken(tampered)).toBeNull()
  })

  it('rejects a token whose payload was swapped for a different session without re-signing', () => {
    const tokenA = mintFlushToken('session-a')
    const tokenB = mintFlushToken('session-b')
    const [, sigB] = tokenB.split('.')
    const [payloadA] = tokenA.split('.')
    const frankensteined = `${payloadA}.${sigB}`
    expect(verifyFlushToken(frankensteined)).toBeNull()
  })

  it('rejects garbage input', () => {
    expect(verifyFlushToken('not-a-real-token')).toBeNull()
    expect(verifyFlushToken('')).toBeNull()
    expect(verifyFlushToken('a.b.c')).toBeNull()
  })

  it('rejects a token signed with a different secret', () => {
    const token = mintFlushToken('abc')
    process.env.HISTORIAN_FLUSH_SECRET = 'a-different-secret'
    expect(verifyFlushToken(token)).toBeNull()
  })

  it('falls back to NOVA_RELAY_SHARED_SECRET when HISTORIAN_FLUSH_SECRET is unset', () => {
    delete process.env.HISTORIAN_FLUSH_SECRET
    process.env.NOVA_RELAY_SHARED_SECRET = 'relay-shared-secret'
    const token = mintFlushToken('xyz')
    expect(verifyFlushToken(token)).toEqual({ sessionId: 'xyz' })
  })

  it('expires after FLUSH_TOKEN_TTL_SECONDS', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const token = mintFlushToken('abc')
    expect(verifyFlushToken(token)).toEqual({ sessionId: 'abc' })

    vi.setSystemTime(new Date(Date.now() + (FLUSH_TOKEN_TTL_SECONDS + 5) * 1000))
    expect(verifyFlushToken(token)).toBeNull()
  })
})
