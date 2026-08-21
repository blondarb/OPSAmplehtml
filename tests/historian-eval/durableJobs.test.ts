import { describe, expect, it, vi } from 'vitest'
import {
  buildHistorianEvalMessage,
  HistorianEvalJobService,
  parseHistorianEvalMessage,
  safeHistorianEvalErrorCode,
} from '@/lib/historian/eval/durableJobs'

const jobId = '11111111-1111-4111-8111-111111111111'

describe('historian durable evaluation jobs', () => {
  it('uses a versioned opaque-ID-only queue message', () => {
    const message = buildHistorianEvalMessage(jobId)
    expect(message).toEqual({ v: 1, kind: 'historian_eval', job_id: jobId })
    expect(Object.keys(message).sort()).toEqual(['job_id', 'kind', 'v'])
    expect(parseHistorianEvalMessage(JSON.stringify(message))).toEqual(message)
    expect(() => parseHistorianEvalMessage(JSON.stringify({ ...message, transcript: 'PHI' }))).toThrow()
  })

  it('rejects malformed or unbound work messages', () => {
    expect(() => parseHistorianEvalMessage('not-json')).toThrow()
    expect(() => parseHistorianEvalMessage(JSON.stringify({ v: 1, kind: 'historian_eval', job_id: 'nope' }))).toThrow()
    expect(() => parseHistorianEvalMessage(JSON.stringify({ v: 2, kind: 'historian_eval', job_id: jobId }))).toThrow()
  })

  it('selects only retry-due or expired-lease jobs below the attempt ceiling', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: jobId }] })
    const service = new HistorianEvalJobService({ query } as never)
    await expect(service.listDispatchableJobIds(20)).resolves.toEqual([jobId])
    const terminalizeSql = String(query.mock.calls[0][0])
    expect(terminalizeSql).toContain("SET status = 'failed'")
    expect(terminalizeSql).toContain("last_error_code = COALESCE(last_error_code, 'LeaseExpired')")
    expect(terminalizeSql).toContain('attempt_count >= $1')

    const sql = String(query.mock.calls[1][0])
    expect(sql).toContain("status IN ('pending', 'retry_wait')")
    expect(sql).toContain("status = 'leased'")
    expect(sql).toContain('lease_expires_at <= now()')
    expect(sql).toContain('attempt_count < $1')
  })

  it('reduces errors to non-PHI codes for durable state/logging', () => {
    expect(safeHistorianEvalErrorCode(Object.assign(new Error('patient text'), { name: 'Provider Error!' })))
      .toBe('Provider_Error_')
    expect(safeHistorianEvalErrorCode('raw patient text')).toBe('EvaluationError')
  })
})
