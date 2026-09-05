import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQSEvent } from 'aws-lambda'
import { processHistorianEvalSqsEvent, type HistorianEvalSession } from '@/workers/historianEvalWorkerCore'
import { classifyFinalDifferentialError } from '@/lib/historian/eval/finalDifferential'
const id = '11111111-1111-4111-8111-111111111111'
const event = { Records: [{ messageId: 'message-1', body: JSON.stringify({ sessionId: id, enqueuedAt: '2026-09-05T20:00:00Z' }) }] } as SQSEvent
function setup() {
  const session: HistorianEvalSession = { id, transcript: [], referral_reason: 'Synthetic referral', narrative_summary: 'Synthetic summary', final_differential: { status: 'queued', queued_at: '2026-09-05T20:00:00Z' } }
  return {
    loadSession: vi.fn().mockResolvedValue({ ...session, final_differential: { status: 'ok' } }).mockResolvedValueOnce(session),
    runFinalDifferential: vi.fn().mockResolvedValue(undefined),
    runThoroughnessJudge: vi.fn().mockResolvedValue(undefined),
    runIndependentDdxAndAgreement: vi.fn().mockResolvedValue(undefined),
    persistError: vi.fn().mockResolvedValue(undefined), log: vi.fn(),
  }
}
beforeEach(() => vi.restoreAllMocks())
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
describe('historian evaluation worker', () => {
  it('acks missing sessions without evaluators', async () => {
    const deps = setup(); deps.loadSession.mockReset().mockResolvedValue(null)
    expect(await processHistorianEvalSqsEvent(event, deps)).toEqual({ batchItemFailures: [] })
    expect(deps.runFinalDifferential).not.toHaveBeenCalled()
    expect(deps.log).toHaveBeenCalledWith('historian_eval_session_missing')
  })
  it('runs in order, derives complaint and reports, and verifies persisted ok', async () => {
    const deps = setup()
    expect(await processHistorianEvalSqsEvent(event, deps)).toEqual({ batchItemFailures: [] })
    expect(deps.loadSession).toHaveBeenCalledTimes(2)
    expect(deps.runFinalDifferential).toHaveBeenCalledWith(id, [], 'Synthetic referral', { signal: expect.any(AbortSignal) })
    expect(deps.runThoroughnessJudge).toHaveBeenCalledWith(id, [], expect.objectContaining({ reports: { narrative_summary: 'Synthetic summary' }, signal: expect.any(AbortSignal) }))
    expect(deps.runFinalDifferential.mock.invocationCallOrder[0]).toBeLessThan(deps.runThoroughnessJudge.mock.invocationCallOrder[0])
    expect(deps.runThoroughnessJudge.mock.invocationCallOrder[0]).toBeLessThan(deps.runIndependentDdxAndAgreement.mock.invocationCallOrder[0])
    expect(deps.persistError).not.toHaveBeenCalled()
  })
  it.each([
    [{ name: 'ThrottlingException' }, 'bedrock', true],
    [{ $metadata: { httpStatusCode: 503 } }, 'bedrock', true],
    [{ code: 'ECONNRESET' }, 'db', true],
    [new SyntaxError('private source'), 'parse', false],
    [{ name: 'AbortError' }, 'timeout', false],
    [{ name: 'TranscriptTooLargeError' }, 'oversized', false],
    [{ code: '42703' }, 'db', false],
    [{ name: 'AccessDeniedException' }, 'bedrock', false],
  ])('persists differential failures and retries only transient errors (%j)', async (error, errorClass, transient) => {
    const deps = setup(); deps.runFinalDifferential.mockRejectedValue(error)
    expect(await processHistorianEvalSqsEvent(event, deps)).toEqual({ batchItemFailures: transient ? [{ itemIdentifier: 'message-1' }] : [] })
    expect(deps.persistError).toHaveBeenCalledWith(id, expect.objectContaining({ status: 'error', error_class: errorClass }))
    expect(deps.runThoroughnessJudge).toHaveBeenCalledTimes(1)
    expect(deps.runIndependentDdxAndAgreement).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(deps.persistError.mock.calls)).not.toContain('private source')
  })
  it('uses returned failure evidence from a fail-open differential wrapper', async () => {
    const deps = setup(); deps.runFinalDifferential.mockResolvedValue({ error: { name: 'ThrottlingException' } })
    expect((await processHistorianEvalSqsEvent(event, deps)).batchItemFailures).toHaveLength(1)
  })
  it('persists an error when a differential resolves but leaves the column non-ok', async () => {
    const deps = setup(); deps.loadSession.mockResolvedValueOnce({ id, transcript: [], final_differential: null })
    await processHistorianEvalSqsEvent(event, deps)
    expect(deps.persistError).toHaveBeenCalledWith(id, expect.objectContaining({ error_class: 'unknown' }))
  })
  it('runs independent evaluation even when thoroughness fails', async () => {
    const deps = setup(); deps.runThoroughnessJudge.mockRejectedValue(new Error('private'))
    await processHistorianEvalSqsEvent(event, deps)
    expect(deps.runIndependentDdxAndAgreement).toHaveBeenCalledTimes(1)
    expect(deps.log).toHaveBeenCalledWith('historian_eval_thoroughness_failed', 'unknown')
  })
  it('skips regenerating an already-ok differential on duplicate delivery', async () => {
    const deps = setup(); deps.loadSession.mockReset().mockResolvedValue({ id, transcript: [], final_differential: { status: 'ok' } })
    await processHistorianEvalSqsEvent(event, deps)
    expect(deps.runFinalDifferential).not.toHaveBeenCalled()
  })
  it('acks malformed queue messages without loading a session', async () => {
    const deps = setup()
    await processHistorianEvalSqsEvent({ Records: [{ messageId: 'invalid', body: '{bad json' }] } as SQSEvent, deps)
    expect(deps.loadSession).not.toHaveBeenCalled()
  })
  it('continues both evaluators and retries when writing the differential error fails transiently', async () => {
    const deps = setup()
    deps.runFinalDifferential.mockRejectedValue(new SyntaxError('invalid output'))
    deps.persistError.mockRejectedValue({ code: 'ECONNRESET' })
    expect((await processHistorianEvalSqsEvent(event, deps)).batchItemFailures).toHaveLength(1)
    expect(deps.runThoroughnessJudge).toHaveBeenCalledTimes(1)
    expect(deps.runIndependentDdxAndAgreement).toHaveBeenCalledTimes(1)
  })
  it('bounds even non-cooperative evaluators to 300/240/240 seconds', async () => {
    vi.useFakeTimers()
    const budgets: number[] = []
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      budgets.push(ms)
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('Budget expired', 'TimeoutError')), ms)
      return controller.signal
    })
    const deps = setup()
    deps.runFinalDifferential.mockImplementation(() => new Promise(() => {}))
    deps.runThoroughnessJudge.mockImplementation(() => new Promise(() => {}))
    deps.runIndependentDdxAndAgreement.mockImplementation(() => new Promise(() => {}))
    const started = Date.now()
    const result = processHistorianEvalSqsEvent(event, deps)
    await vi.advanceTimersByTimeAsync(780_001)
    expect(await result).toEqual({ batchItemFailures: [] })
    expect(budgets.filter((ms) => ms > 10_000)).toEqual([300_000, 240_000, 240_000])
    expect(Date.now() - started).toBeLessThan(840_000)
    expect(deps.persistError).toHaveBeenCalledWith(id, expect.objectContaining({ error_class: 'timeout' }))
  })
  it('classifies connection and model failures without retaining exception text', () => {
    expect(classifyFinalDifferentialError({ code: '08006' })).toEqual({ errorClass: 'db', transient: true })
    expect(classifyFinalDifferentialError({ name: 'ClinicalModelOutputError' })).toEqual({ errorClass: 'parse', transient: false })
  })
})
