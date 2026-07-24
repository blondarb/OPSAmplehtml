import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Covers the Task 2 fire-and-forget hook-in wired into
 * src/app/api/ai/historian/save/route.ts: runFinalDifferential is called
 * (with the right args) after a successful insert, is gated by
 * HISTORIAN_EVAL_AUTORUN, and never delays or fails the save response even
 * if the eval call hangs or rejects.
 *
 * Mirrors saveRouteIntegrityCheck.test.ts's mocking approach (same wide
 * dependency graph) but focuses on the eval hook specifically; that file
 * forces HISTORIAN_EVAL_AUTORUN='false' and doesn't exercise this path.
 */
const { runFinalDifferentialMock, getPoolMock, fromMock } = vi.hoisted(() => {
  const runFinalDifferentialMock = vi.fn(async () => {})
  const getPoolMock = vi.fn(async () => ({ query: vi.fn(async () => ({ rows: [{ count: 0 }] })) }))
  const fromMock = vi.fn(() => {
    const builder = {
      insert: vi.fn(() => builder),
      select: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve({ data: { id: 'saved-session-id' }, error: null })),
    }
    return builder
  })
  return { runFinalDifferentialMock, getPoolMock, fromMock }
})

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/cognito/server', () => ({ getUser: vi.fn() }))
vi.mock('@/lib/tenant', () => ({ getTenantServer: () => 'test-tenant' }))
vi.mock('@/lib/consult/pipeline', () => ({ linkHistorianToConsult: vi.fn() }))
vi.mock('@/lib/notifications', () => ({ notifyHistorianRedFlag: vi.fn() }))
vi.mock('@/lib/historian/eval/finalDifferential', () => ({
  runFinalDifferential: runFinalDifferentialMock,
}))

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

describe('save/route.ts final-differential hook', () => {
  const originalAutorun = process.env.HISTORIAN_EVAL_AUTORUN
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    runFinalDifferentialMock.mockReset()
    runFinalDifferentialMock.mockResolvedValue(undefined)
    delete process.env.HISTORIAN_EVAL_AUTORUN
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    if (originalAutorun === undefined) delete process.env.HISTORIAN_EVAL_AUTORUN
    else process.env.HISTORIAN_EVAL_AUTORUN = originalAutorun
    errorSpy.mockRestore()
  })

  it('fires runFinalDifferential with the saved session id and transcript when HISTORIAN_EVAL_AUTORUN is unset (default enabled)', async () => {
    const res = await postSave()
    expect(res.status).toBe(200)

    // Fire-and-forget — give the microtask queue a tick to run the void call.
    await new Promise((r) => setTimeout(r, 0))

    expect(runFinalDifferentialMock).toHaveBeenCalledTimes(1)
    expect(runFinalDifferentialMock).toHaveBeenCalledWith(
      'saved-session-id',
      VALID_TRANSCRIPT,
      undefined,
    )
  })

  it('passes chief complaint from structured_output when present', async () => {
    await postSave({ structured_output: { chief_complaint: 'headache x3 days' } })
    await new Promise((r) => setTimeout(r, 0))

    expect(runFinalDifferentialMock).toHaveBeenCalledWith(
      'saved-session-id',
      VALID_TRANSCRIPT,
      'headache x3 days',
    )
  })

  it('falls back to referral_reason for chief complaint when structured_output has none', async () => {
    await postSave({ referral_reason: 'referred for headache eval' })
    await new Promise((r) => setTimeout(r, 0))

    expect(runFinalDifferentialMock).toHaveBeenCalledWith(
      'saved-session-id',
      VALID_TRANSCRIPT,
      'referred for headache eval',
    )
  })

  it('does NOT fire runFinalDifferential when HISTORIAN_EVAL_AUTORUN is the literal string "false"', async () => {
    process.env.HISTORIAN_EVAL_AUTORUN = 'false'
    const res = await postSave()
    expect(res.status).toBe(200)
    await new Promise((r) => setTimeout(r, 0))

    expect(runFinalDifferentialMock).not.toHaveBeenCalled()
  })

  it('fires when HISTORIAN_EVAL_AUTORUN is set to any value other than "false"', async () => {
    process.env.HISTORIAN_EVAL_AUTORUN = 'true'
    await postSave()
    await new Promise((r) => setTimeout(r, 0))

    expect(runFinalDifferentialMock).toHaveBeenCalledTimes(1)
  })

  it('never delays the save response, even if runFinalDifferential hangs forever', async () => {
    runFinalDifferentialMock.mockImplementation(() => new Promise(() => {})) // never resolves

    const start = Date.now()
    const res = await postSave()
    const elapsed = Date.now() - start

    expect(res.status).toBe(200)
    expect(elapsed).toBeLessThan(1000)
  })

  it('never fails the save response if runFinalDifferential rejects', async () => {
    runFinalDifferentialMock.mockRejectedValue(new Error('boom'))

    const res = await postSave()
    expect(res.status).toBe(200)

    await new Promise((r) => setTimeout(r, 0))
    const errorText = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(errorText).toMatch(/final differential eval error/i)
  })

  it('does not fire when the insert itself failed (no data)', async () => {
    fromMock.mockReturnValueOnce({
      insert: vi.fn(function (this: unknown) { return this }),
      select: vi.fn(function (this: unknown) { return this }),
      single: vi.fn(() => Promise.resolve({ data: null, error: { message: 'insert failed' } })),
    } as never)

    const res = await postSave()
    expect(res.status).toBe(500)
    await new Promise((r) => setTimeout(r, 0))

    expect(runFinalDifferentialMock).not.toHaveBeenCalled()
  })
})
