import { describe, expect, it } from 'vitest'
import {
  hashHistorianToken,
  mintHistorianToken,
  readCookieValue,
} from '@/lib/historian/invitationTokens'

describe('historian invitation tokens', () => {
  it('mints 256-bit opaque tokens and stores only deterministic SHA-256 hashes', () => {
    const first = mintHistorianToken()
    const second = mintHistorianToken()
    expect(first.raw).not.toBe(second.raw)
    expect(Buffer.from(first.raw, 'base64url')).toHaveLength(32)
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(first.hash).toBe(hashHistorianToken(first.raw))
    expect(first.hash).not.toContain(first.raw)
  })

  it('reads the exact HttpOnly grant cookie value from a request header', () => {
    const request = new Request('https://example.test', {
      headers: { Cookie: 'other=1; historian_patient_grant=a%2Eb%2Ec; theme=dark' },
    })
    expect(readCookieValue(request, 'historian_patient_grant')).toBe('a.b.c')
    expect(readCookieValue(request, 'missing')).toBeNull()
  })
})
