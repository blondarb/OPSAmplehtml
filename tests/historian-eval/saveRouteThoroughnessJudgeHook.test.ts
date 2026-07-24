import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Covers the Task 3 thoroughness-judge hook-in wired into
 * src/app/api/ai/historian/save/route.ts, added beyond the task brief's
 * literal test-file list (rubric.test.ts, deterministicChecks.test.ts,
 * thoroughnessJudge.gate.test.ts) to mirror the Task 2 precedent
 * (saveRouteFinalDifferentialHook.test.ts) for the same save-route wiring
 * responsibility — "Wire into save route after final DDx" (Step 6) needs
 * its own coverage the same way Task 2's did.
 *
 * Verifies: the judge runs strictly AFTER the final-differential call
 * settles (success OR handled-failure) — true sequential ordering: gated
 * by HISTORIAN_EVAL_AUTORUN; never delays or fails the save response even
 * if either call hangs or rejects; and that runFinalDifferential rejecting
 * does not prevent runThoroughnessJudge from still running (each stage
 * fails open independently).
 */
const { runFinalDifferentialMock, runThoroughnessJudgeMock, fromMock } = vi.hoisted(() => {
  const runFinalDifferentialMock = vi.fn(async () => {})
  const runThoroughnessJudgeMock = vi.fn(async () => {})
  const fromMock = vi.fn(() => {
    const builder = {
      insert: vi.fn(() => builder),
      select: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve({ data: { id: 'saved-session-id' }, error: null })),
    }
    return builder
  })
  return { runFinalDifferentialMock, runThoroughnessJudgeMock, fromMock }
})

vi.mock('@/lib/db', () => ({ getPool: vi.fn(async () => ({ query: vi.fn(async () => ({ rows: [{ count: 0 }] })) })) }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/cognito/server', () => ({ getUser: vi.fn() }))
vi.mock('@/lib/tenant', () => ({ getTenantServer: () => 'test-tenant' }))
vi.mock('@/lib/consult/pipeline', () => ({ linkHistorianToConsult: vi.fn() }))
vi.mock('@/lib/notifications', () => ({ notifyHistorianRedFlag: vi.fn() }))
vi.mock('@/lib/historian/eval/finalDifferential', () => ({
  runFinalDifferential: runFinalDifferentialMock,
}))
vi.mock('@/lib/historian/eval/thoroughnessJudge', () => ({
  runThoroughnessJudge: runThoroughnessJudgeMock,
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

describe('save/route.ts thoroughness-judge hook', () => {
  const originalAutorun = process.env.HISTORIAN_EVAL_AUTORUN
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    runFinalDifferentialMock.mockReset()
    runFinalDifferentialMock.mockResolvedValue(undefined)
    runThoroughnessJudgeMock.mockReset()
    runThoroughnessJudgeMock.mockResolvedValue(undefined)
    delete process.env.HISTORIAN_EVAL_AUTORUN
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    if (originalAutorun === undefined) delete process.env.HISTORIAN_EVAL_AUTORUN
    else process.env.HISTORIAN_EVAL_AUTORUN = originalAutorun
    errorSpy.mockRestore()
  })

  it('fires runThoroughnessJudge with the saved session id, transcript, and options after autorun default (unset = enabled)', async () => {
    const res = await postSave({ narrative_summary: 'Patient reports headache.' })
    expect(res.status).toBe(200)
    await new Promise((r) => setTimeout(r, 0))

    expect(runThoroughnessJudgeMock).toHaveBeenCalledTimes(1)
    const [sessionId, transcript, options] = runThoroughnessJudgeMock.mock.calls[0]
    expect(sessionId).toBe('saved-session-id')
    expect(transcript).toEqual(VALID_TRANSCRIPT)
    expect(options.narrativeSummary).toBe('Patient reports headache.')
    expect(options.reports).toEqual({ narrative_summary: 'Patient reports headache.' })
  })

  it('runs the judge strictly AFTER runFinalDifferential (sequential, not parallel)', async () => {
    const callOrder: string[] = []
    runFinalDifferentialMock.mockImplementation(async () => {
      callOrder.push('final-differential')
    })
    runThoroughnessJudgeMock.mockImplementation(async () => {
      callOrder.push('thoroughness-judge')
    })

    await postSave()
    await new Promise((r) => setTimeout(r, 0))

    expect(callOrder).toEqual(['final-differential', 'thoroughness-judge'])
  })

  it('omits reports (fidelity input) when narrative_summary is blank/absent', async () => {
    await postSave({ narrative_summary: undefined })
    await new Promise((r) => setTimeout(r, 0))

    const [, , options] = runThoroughnessJudgeMock.mock.calls[0]
    expect(options.reports).toBeUndefined()
  })

  it('does NOT fire the judge when HISTORIAN_EVAL_AUTORUN is the literal string "false"', async () => {
    process.env.HISTORIAN_EVAL_AUTORUN = 'false'
    const res = await postSave()
    expect(res.status).toBe(200)
    await new Promise((r) => setTimeout(r, 0))

    expect(runThoroughnessJudgeMock).not.toHaveBeenCalled()
  })

  it('still runs the judge even when runFinalDifferential rejects (each stage fails open independently)', async () => {
    runFinalDifferentialMock.mockRejectedValue(new Error('final differential boom'))

    const res = await postSave()
    expect(res.status).toBe(200)
    await new Promise((r) => setTimeout(r, 0))

    expect(runThoroughnessJudgeMock).toHaveBeenCalledTimes(1)
    const errorText = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(errorText).toMatch(/final differential eval error/i)
  })

  it('never fails the save response if runThoroughnessJudge rejects', async () => {
    runThoroughnessJudgeMock.mockRejectedValue(new Error('judge boom'))

    const res = await postSave()
    expect(res.status).toBe(200)
    await new Promise((r) => setTimeout(r, 0))

    const errorText = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(errorText).toMatch(/thoroughness judge eval error/i)
  })

  it('never delays the save response, even if runThoroughnessJudge hangs forever', async () => {
    runThoroughnessJudgeMock.mockImplementation(() => new Promise(() => {}))

    const start = Date.now()
    const res = await postSave()
    const elapsed = Date.now() - start

    expect(res.status).toBe(200)
    expect(elapsed).toBeLessThan(1000)
  })

  it('does not fire the judge when the insert itself failed (no data)', async () => {
    fromMock.mockReturnValueOnce({
      insert: vi.fn(function (this: unknown) { return this }),
      select: vi.fn(function (this: unknown) { return this }),
      single: vi.fn(() => Promise.resolve({ data: null, error: { message: 'insert failed' } })),
    } as never)

    const res = await postSave()
    expect(res.status).toBe(500)
    await new Promise((r) => setTimeout(r, 0))

    expect(runThoroughnessJudgeMock).not.toHaveBeenCalled()
  })
})
