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

  it('round-trips a sessionId through mint -> verify', async () => {
    const token = await mintFlushToken('abc')
    expect(typeof token).toBe('string')
    await expect(verifyFlushToken(token)).resolves.toEqual({ sessionId: 'abc' })
  })

  it('round-trips an invited startup attempt with the session authority', async () => {
    const startupAttemptId = '11111111-1111-4111-8111-111111111111'
    const token = await mintFlushToken('abc', startupAttemptId)
    await expect(verifyFlushToken(token)).resolves.toEqual({
      sessionId: 'abc',
      startupAttemptId,
    })
  })

  it('produces different, independently-verifiable tokens for different sessionIds', async () => {
    const t1 = await mintFlushToken('session-1')
    const t2 = await mintFlushToken('session-2')
    expect(t1).not.toBe(t2)
    await expect(verifyFlushToken(t1)).resolves.toEqual({ sessionId: 'session-1' })
    await expect(verifyFlushToken(t2)).resolves.toEqual({ sessionId: 'session-2' })
  })

  it('rejects a tampered token (flipped signature char)', async () => {
    const token = await mintFlushToken('abc')
    const lastChar = token.at(-1)
    const flipped = lastChar === 'A' ? 'B' : 'A'
    const tampered = token.slice(0, -1) + flipped
    await expect(verifyFlushToken(tampered)).resolves.toBeNull()
  })

  it('rejects a token whose payload was swapped for a different session without re-signing', async () => {
    const tokenA = await mintFlushToken('session-a')
    const tokenB = await mintFlushToken('session-b')
    const [, sigB] = tokenB.split('.')
    const [payloadA] = tokenA.split('.')
    const frankensteined = `${payloadA}.${sigB}`
    await expect(verifyFlushToken(frankensteined)).resolves.toBeNull()
  })

  it('rejects garbage input', async () => {
    await expect(verifyFlushToken('not-a-real-token')).resolves.toBeNull()
    await expect(verifyFlushToken('')).resolves.toBeNull()
    await expect(verifyFlushToken('a.b.c')).resolves.toBeNull()
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await mintFlushToken('abc')
    process.env.HISTORIAN_FLUSH_SECRET = 'a-different-secret'
    await expect(verifyFlushToken(token)).resolves.toBeNull()
  })

  it('falls back to NOVA_RELAY_SHARED_SECRET when HISTORIAN_FLUSH_SECRET is unset', async () => {
    delete process.env.HISTORIAN_FLUSH_SECRET
    process.env.NOVA_RELAY_SHARED_SECRET = 'relay-shared-secret'
    const token = await mintFlushToken('xyz')
    await expect(verifyFlushToken(token)).resolves.toEqual({ sessionId: 'xyz' })
  })

  it('expires after FLUSH_TOKEN_TTL_SECONDS', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const token = await mintFlushToken('abc')
    await expect(verifyFlushToken(token)).resolves.toEqual({ sessionId: 'abc' })

    vi.setSystemTime(new Date(Date.now() + (FLUSH_TOKEN_TTL_SECONDS + 5) * 1000))
    await expect(verifyFlushToken(token)).resolves.toBeNull()
  })

  describe('production fail-closed behavior', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('mintFlushToken throws in production when neither secret env var is set', async () => {
      delete process.env.HISTORIAN_FLUSH_SECRET
      delete process.env.NOVA_RELAY_SHARED_SECRET
      vi.stubEnv('NODE_ENV', 'production')
      await expect(mintFlushToken('abc')).rejects.toThrow()
    })

    it('verifyFlushToken returns null in production when neither secret env var is set, even for a token minted earlier under a real secret', async () => {
      process.env.HISTORIAN_FLUSH_SECRET = 'a-real-secret'
      vi.stubEnv('NODE_ENV', 'development')
      const token = await mintFlushToken('abc')
      // Sanity check: works before the production flip.
      await expect(verifyFlushToken(token)).resolves.toEqual({ sessionId: 'abc' })

      delete process.env.HISTORIAN_FLUSH_SECRET
      delete process.env.NOVA_RELAY_SHARED_SECRET
      vi.stubEnv('NODE_ENV', 'production')
      await expect(verifyFlushToken(token)).resolves.toBeNull()
    })

    it('mint and verify both work normally in production when a real secret IS configured', async () => {
      process.env.HISTORIAN_FLUSH_SECRET = 'a-real-prod-secret'
      vi.stubEnv('NODE_ENV', 'production')
      const token = await mintFlushToken('prod-session')
      await expect(verifyFlushToken(token)).resolves.toEqual({ sessionId: 'prod-session' })
    })

    it('falls back to the dev-only secret outside production when neither env var is set', async () => {
      delete process.env.HISTORIAN_FLUSH_SECRET
      delete process.env.NOVA_RELAY_SHARED_SECRET
      vi.stubEnv('NODE_ENV', 'test')
      const token = await mintFlushToken('dev-session')
      await expect(verifyFlushToken(token)).resolves.toEqual({ sessionId: 'dev-session' })
    })
  })
})
