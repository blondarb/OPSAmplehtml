import { describe, expect, it } from 'vitest'

import { DELETE } from '../route'

function request(headers: Record<string, string> = {}) {
  return new Request('https://app.example.test/api/patient-access/session', {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      origin: 'https://app.example.test',
      ...headers,
    },
    body: '{}',
  })
}

const INVALID_HEADERS: Record<string, string>[] = [
  {},
  { origin: 'https://attacker.example.test' },
  { 'content-type': 'text/plain' },
]

describe('patient access browser-session clearing', () => {
  it('clears only the hardened patient cookie and returns no-store', async () => {
    const response = await DELETE(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(response.headers.get('cache-control')).toBe('no-store')
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('__Host-sevaro_patient_access=')
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=strict')
    expect(cookie).toContain('Path=/')
  })

  it.each(INVALID_HEADERS)('rejects non-browser or cross-origin clearing attempts: %s', async (headers) => {
    const response = await DELETE(
      new Request('https://app.example.test/api/patient-access/session', {
        method: 'DELETE',
        headers,
      }),
    )

    expect([403, 415]).toContain(response.status)
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
