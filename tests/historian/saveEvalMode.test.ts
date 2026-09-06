import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Exercises the real POST handler with synthetic data and mocked evaluator/DB boundaries.
const { runFinalDifferentialMock, runThoroughnessMock, runIndependentMock, queryMock, getPoolMock, fromMock } = vi.hoisted(() => {
  const runFinalDifferentialMock = vi.fn(async () => {})
  const queryMock = vi.fn(async (_sql: string, _values?: any[]) => ({ rows: [{ count: 0 }] }))
  const runThoroughnessMock = vi.fn(async () => {})
  const runIndependentMock = vi.fn(async () => {})
  const getPoolMock = vi.fn(async () => ({ query: queryMock }))
  const fromMock = vi.fn(() => {
    const builder = {
      insert: vi.fn(() => builder),
      select: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve({ data: { id: 'saved-session-id' }, error: null })),
    }
    return builder
  })
  return { runFinalDifferentialMock, runThoroughnessMock, runIndependentMock, queryMock, getPoolMock, fromMock }
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

vi.mock('@/lib/historian/eval/thoroughnessJudge', () => ({ runThoroughnessJudge: runThoroughnessMock }))
vi.mock('@/lib/historian/eval/independentDdx', () => ({ runIndependentDdxAndAgreement: runIndependentMock }))

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
      sessionId: 'client-requested-session-id',
      ...overrides,
    }),
  })
  return POST(request)
}


describe('historian save evaluation mode behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('HISTORIAN_EVAL_AUTORUN', 'true')
  })
  afterEach(() => vi.unstubAllEnvs())
  it('queue mode writes pending for the saved id without running evaluators', async () => {
    vi.stubEnv('HISTORIAN_EVAL_MODE', 'queue')
    expect((await postSave()).status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const markers = queryMock.mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE historian_sessions SET final_differential'))
    expect(markers).toHaveLength(1)
    const values = markers[0][1]!
    expect(values[1]).toBe('saved-session-id')
    expect(JSON.parse(values[0])).toEqual({ status: 'pending', queued_at: expect.any(String), source: 'save' })
    expect(runFinalDifferentialMock).not.toHaveBeenCalled()
    expect(runThoroughnessMock).not.toHaveBeenCalled()
    expect(runIndependentMock).not.toHaveBeenCalled()
  })
  it('unset mode writes no marker and runs all three evaluators in order', async () => {
    vi.stubEnv('HISTORIAN_EVAL_MODE', undefined)
    expect((await postSave()).status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(queryMock.mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE historian_sessions SET final_differential'))).toHaveLength(0)
    expect(runFinalDifferentialMock).toHaveBeenCalledWith('saved-session-id', VALID_TRANSCRIPT, undefined, { structured_output: null })
    expect(runThoroughnessMock).toHaveBeenCalledOnce()
    expect(runIndependentMock).toHaveBeenCalledWith('saved-session-id', VALID_TRANSCRIPT, undefined)
    expect(runFinalDifferentialMock.mock.invocationCallOrder[0]).toBeLessThan(runThoroughnessMock.mock.invocationCallOrder[0])
    expect(runThoroughnessMock.mock.invocationCallOrder[0]).toBeLessThan(runIndependentMock.mock.invocationCallOrder[0])
  })
})
