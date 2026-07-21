import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Covers the non-destructive integrity cross-check in
 * src/app/api/ai/historian/save/route.ts (Task 1 fix, review issue #2):
 * a missing historian_transcript_events table (Postgres 42P01 —
 * undefined_table, expected until the rollout task applies migration 056)
 * must log a single quiet informational line, never at error level or in
 * a way that reads as a DB failure; a genuine event-count/transcript-length
 * mismatch still warns; no mismatch logs nothing.
 *
 * save/route.ts pulls in a wider dependency graph than the flush route
 * (cognito/server, tenant, consult/pipeline, notifications) — all mocked
 * here so this test exercises only the save handler + the real
 * validateTranscript/integrity-check logic against a mocked pg pool.
 */
const { queryMock, getPoolMock, fromMock } = vi.hoisted(() => {
  const queryMock = vi.fn()
  const getPoolMock = vi.fn(async () => ({ query: queryMock }))
  const fromMock = vi.fn(() => {
    const builder = {
      insert: vi.fn(() => builder),
      select: vi.fn(() => builder),
      single: vi.fn(() =>
        Promise.resolve({ data: { id: 'saved-session-id' }, error: null }),
      ),
    }
    return builder
  })
  return { queryMock, getPoolMock, fromMock }
})

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/cognito/server', () => ({ getUser: vi.fn() }))
vi.mock('@/lib/tenant', () => ({ getTenantServer: () => 'test-tenant' }))
vi.mock('@/lib/consult/pipeline', () => ({ linkHistorianToConsult: vi.fn() }))
vi.mock('@/lib/notifications', () => ({ notifyHistorianRedFlag: vi.fn() }))

import { POST } from '@/app/api/ai/historian/save/route'

const VALID_TRANSCRIPT = [
  { role: 'assistant', text: 'Hi, how can I help?', timestamp: 0, seq: 1 },
  { role: 'user', text: 'I have a headache.', timestamp: 4, seq: 2 },
]

function postSave(overrides: Record<string, unknown> = {}) {
  const request = new Request('http://historian.test/api/ai/historian/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: 'test-tenant',
      session_type: 'new_patient',
      patient_name: 'Test Patient',
      transcript: VALID_TRANSCRIPT,
      status: 'completed',
      sessionId: 'saved-session-id',
      ...overrides,
    }),
  })
  return POST(request)
}

describe('save/route.ts integrity cross-check', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    queryMock.mockReset()
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    infoSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('logs a single quiet info line (not error) when historian_transcript_events does not exist yet (42P01)', async () => {
    queryMock.mockRejectedValueOnce(
      Object.assign(new Error('relation "historian_transcript_events" does not exist'), {
        code: '42P01',
      }),
    )

    const res = await postSave()
    expect(res.status).toBe(200)

    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(infoSpy.mock.calls[0].join(' ')).toMatch(/migration 056 not applied/i)

    // Must NOT log this as an error — it is not a DB failure.
    const errorText = errorSpy.mock.calls.map(c => c.join(' ')).join('\n')
    expect(errorText).not.toMatch(/integrity cross-check error/i)
    expect(errorText).not.toMatch(/42P01/)
  })

  it('warns on a genuine event-count vs transcript-length mismatch', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ count: 1 }] }) // transcript has 2 entries

    const res = await postSave()
    expect(res.status).toBe(200)

    expect(warnSpy).toHaveBeenCalled()
    const warnText = warnSpy.mock.calls.map(c => c.join(' ')).join('\n')
    expect(warnText).toMatch(/event-count mismatch/i)
    expect(warnText).toContain('saved-session-id')
    // No patient utterance text in the log.
    expect(warnText).not.toContain('I have a headache')
  })

  it('does not warn when the event count matches the transcript length', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ count: 2 }] }) // matches VALID_TRANSCRIPT.length

    const res = await postSave()
    expect(res.status).toBe(200)

    const warnText = warnSpy.mock.calls.map(c => c.join(' ')).join('\n')
    expect(warnText).not.toMatch(/event-count mismatch/i)
  })

  it('still logs a real (non-42P01) DB error from the cross-check at error level', async () => {
    queryMock.mockRejectedValueOnce(
      Object.assign(new Error('connection terminated unexpectedly'), { code: '57P01' }),
    )

    const res = await postSave()
    // Save itself still succeeds — the cross-check is non-fatal.
    expect(res.status).toBe(200)

    const errorText = errorSpy.mock.calls.map(c => c.join(' ')).join('\n')
    expect(errorText).toMatch(/integrity cross-check error/i)
  })

  it('skips the event-count query entirely when no sessionId was provided', async () => {
    const res = await postSave({ sessionId: undefined })
    expect(res.status).toBe(200)
    expect(queryMock).not.toHaveBeenCalled()
  })
})
