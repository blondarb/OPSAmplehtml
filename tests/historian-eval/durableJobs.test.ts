import { describe, expect, it, vi } from 'vitest'
import {
  buildHistorianEvalMessage,
  HistorianEvalJobService,
  parseHistorianEvalMessage,
  safeHistorianEvalErrorCode,
} from '@/lib/historian/eval/durableJobs'

const jobId = '11111111-1111-4111-8111-111111111111'
const claim = {
  jobId,
  sessionId: '22222222-2222-4222-8222-222222222222',
  tenantId: '33333333-3333-4333-8333-333333333333',
  leaseToken: '44444444-4444-4444-8444-444444444444',
} as never

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

  it('persists the clinician report only under the live lease and advances to report_ready', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 })
    const service = new HistorianEvalJobService({ query } as never)
    const report = { input_digest: 'a'.repeat(64), version: 1 } as never

    await service.persistClinicianHistoryReport(claim, report)

    const [sql, params] = query.mock.calls[0]
    expect(String(sql)).toContain("current_stage = 'report_ready'")
    expect(String(sql)).toContain("lease.status = 'leased'")
    expect(String(sql)).toContain('lease.lease_token = $5')
    expect(String(sql)).toContain("session.clinician_history_report->>'input_digest' = $6")
    expect(params[4]).toBe('44444444-4444-4444-8444-444444444444')
    expect(params[5]).toBe('a'.repeat(64))
  })

  it('fails closed when report persistence loses its lease', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0 })
    const service = new HistorianEvalJobService({ query } as never)
    await expect(service.persistClinicianHistoryReport(
      claim,
      { input_digest: 'b'.repeat(64), version: 1 } as never,
    )).rejects.toThrow(/lost its lease/i)
  })

  it('records an explicitly withheld differential under the same digest and stage', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 })
    const service = new HistorianEvalJobService({ query } as never)
    const inputDigest = 'c'.repeat(64)
    await service.persistFinalDifferential(
      claim,
      { version: 1, status: 'withheld_partial' },
      { inputDigest, withheld: true },
    )

    const [sql, params] = query.mock.calls[0]
    expect(String(sql)).toContain("session.final_differential->>'input_digest' = $6")
    expect(params[5]).toBe(inputDigest)
    expect(params[6]).toBe('ddx_withheld')
    expect(JSON.parse(params[0])).toMatchObject({
      status: 'withheld_partial',
      input_digest: inputDigest,
    })
  })
})
