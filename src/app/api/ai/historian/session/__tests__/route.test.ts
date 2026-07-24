import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/consult/pipeline', () => ({
  getConsult: vi.fn(),
  markHistorianStarted: vi.fn(),
}))
vi.mock('@/lib/secrets', () => ({
  getOpenAIKey: vi.fn(),
}))

import { POST } from '@/app/api/ai/historian/session/route'
import { getOpenAIKey } from '@/lib/secrets'
import { getConsult } from '@/lib/consult/pipeline'

const buildReq = (body: Record<string, unknown>, queryString = ''): Request =>
  new Request(`http://localhost/api/ai/historian/session${queryString}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const VOICE_FIELDS = [
  'ephemeralKey',
  'providerSessionId',
  'expiresAt',
  'model',
  'turn_detection_mode',
  'base_instructions',
  'tools',
  'provider',
  'instructions',
  'relayUrl',
  'relayToken',
  'voiceId',
]

describe('POST /api/ai/historian/session — textMode (Historian Validation Suite Task 6)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getOpenAIKey).mockResolvedValue('sk-test-key')
    vi.mocked(getConsult).mockResolvedValue(null)
    // mockImplementation (not mockResolvedValue) so each call gets a FRESH
    // Response — a Response body can only be read once, and this test file
    // calls POST multiple times per test against the same mocked fetch.
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ value: 'ek_test_123', expires_at: 1234567890, session_id: 'oai_sess_1' }),
          { status: 200 },
        ),
    )
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('body.textMode === true returns ONLY sessionId + flushToken, with no voice-credential fields, and never calls OpenAI', async () => {
    const res = await POST(buildReq({ sessionType: 'new_patient', textMode: true }))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(typeof json.sessionId).toBe('string')
    expect(json.sessionId.length).toBeGreaterThan(0)
    expect(typeof json.flushToken).toBe('string')

    for (const field of VOICE_FIELDS) {
      expect(json).not.toHaveProperty(field)
    }

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(getOpenAIKey).not.toHaveBeenCalled()
    expect(getConsult).not.toHaveBeenCalled()
  })

  it('?textMode=1 query string also short-circuits to the same minimal shape', async () => {
    const res = await POST(buildReq({ sessionType: 'new_patient' }, '?textMode=1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(typeof json.sessionId).toBe('string')
    expect(typeof json.flushToken).toBe('string')
    expect(Object.keys(json).sort()).toEqual(['flushToken', 'sessionId'])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('mints a fresh sessionId on every textMode call', async () => {
    const first = await (await POST(buildReq({ textMode: true }))).json()
    const second = await (await POST(buildReq({ textMode: true }))).json()
    expect(first.sessionId).not.toBe(second.sessionId)
  })

  it('default (non-textMode) path is unchanged: still returns the full OpenAI voice-session shape', async () => {
    const res = await POST(buildReq({ sessionType: 'new_patient' }))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.provider).toBe('openai')
    expect(json.ephemeralKey).toBe('ek_test_123')
    expect(Array.isArray(json.tools)).toBe(true)
    expect(typeof json.base_instructions).toBe('string')
    expect(typeof json.sessionId).toBe('string')
    expect(typeof json.flushToken).toBe('string')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(getOpenAIKey).toHaveBeenCalledTimes(1)
  })

  it('false-y textMode values (absent, false, "0") do not trigger the short-circuit', async () => {
    const res1 = await POST(buildReq({ sessionType: 'new_patient', textMode: false }))
    const json1 = await res1.json()
    expect(json1.provider).toBe('openai')

    const res2 = await POST(buildReq({ sessionType: 'new_patient' }, '?textMode=0'))
    const json2 = await res2.json()
    expect(json2.provider).toBe('openai')
  })
})
