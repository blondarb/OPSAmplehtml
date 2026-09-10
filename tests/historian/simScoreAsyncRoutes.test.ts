/**
 * Contract tests for the async sim scoring routes (202+poll).
 *
 * The live simulator client depends on a specific contract to know when to fall
 * back to the legacy staged scoring: /sim/score/start returns 202 when the job
 * table exists and 501 { code: 'not_enabled' } when it doesn't (migration 066
 * not applied); /sim/score/status returns the job's status and 501 { status:
 * 'not_enabled' } on the same missing table. This locks that contract so a
 * future change can't silently break the fallback (the harness-rot lesson).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const table42P01 = () => Object.assign(new Error('relation does not exist'), { code: '42P01' })

function mockAuthed() {
  vi.doMock('@/lib/historian/simAuth', () => ({ requireSimUser: vi.fn().mockResolvedValue(null) }))
}
function mockPool(query: ReturnType<typeof vi.fn>) {
  vi.doMock('@/lib/db', () => ({ getPool: vi.fn().mockResolvedValue({ query }) }))
}

const startBody = (over: Record<string, unknown> = {}) =>
  new Request('http://localhost/api/ai/historian/sim/score/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ persona: 'headache-migraine', transcript: [{ role: 'user', text: 'hi' }], batchId: 'b1', ...over }),
  })

describe('sim async scoring routes', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('start returns 202 + jobId and fires the background job when the table exists', async () => {
    mockAuthed()
    const query = vi.fn().mockResolvedValue({ rows: [] })
    mockPool(query)
    const runInBackground = vi.fn()
    vi.doMock('@/lib/triage/asyncRunner', () => ({ runInBackground }))
    vi.doMock('@/lib/historian/sim/runSimScoringJob', () => ({ runSimScoringJob: vi.fn() }))

    const { POST } = await import('@/app/api/ai/historian/sim/score/start/route')
    const res = await POST(startBody())
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.jobId).toBeTruthy()
    expect(body.status).toBe('pending')
    expect(query).toHaveBeenCalledTimes(1) // the INSERT
    expect(runInBackground).toHaveBeenCalledTimes(1)
  })

  it('start returns 501 not_enabled (and does NOT run work) when the table is missing', async () => {
    mockAuthed()
    const query = vi.fn().mockRejectedValue(table42P01())
    mockPool(query)
    const runInBackground = vi.fn()
    vi.doMock('@/lib/triage/asyncRunner', () => ({ runInBackground }))
    vi.doMock('@/lib/historian/sim/runSimScoringJob', () => ({ runSimScoringJob: vi.fn() }))

    const { POST } = await import('@/app/api/ai/historian/sim/score/start/route')
    const res = await POST(startBody())
    expect(res.status).toBe(501)
    expect((await res.json()).code).toBe('not_enabled')
    expect(runInBackground).not.toHaveBeenCalled()
  })

  it('start validates persona, transcript, and batchId', async () => {
    mockAuthed()
    mockPool(vi.fn().mockResolvedValue({ rows: [] }))
    const { POST } = await import('@/app/api/ai/historian/sim/score/start/route')
    expect((await POST(startBody({ persona: '' }))).status).toBe(400)
    expect((await POST(startBody({ transcript: [] }))).status).toBe(400)
    expect((await POST(startBody({ batchId: '' }))).status).toBe(400)
  })

  it('status returns the job row status', async () => {
    mockAuthed()
    mockPool(vi.fn().mockResolvedValue({ rows: [{ status: 'complete', error: null, top1_hit: true, top3_hit: false }] }))
    const { GET } = await import('@/app/api/ai/historian/sim/score/status/route')
    const res = await GET(new Request('http://localhost/api/ai/historian/sim/score/status?jobId=j1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('complete')
    expect(body.top1Hit).toBe(true)
    expect(body.top3Hit).toBe(false)
  })

  it('status returns 404 when the job is unknown', async () => {
    mockAuthed()
    mockPool(vi.fn().mockResolvedValue({ rows: [] }))
    const { GET } = await import('@/app/api/ai/historian/sim/score/status/route')
    const res = await GET(new Request('http://localhost/api/ai/historian/sim/score/status?jobId=nope'))
    expect(res.status).toBe(404)
  })

  it('status returns 501 not_enabled when the table is missing', async () => {
    mockAuthed()
    mockPool(vi.fn().mockRejectedValue(table42P01()))
    const { GET } = await import('@/app/api/ai/historian/sim/score/status/route')
    const res = await GET(new Request('http://localhost/api/ai/historian/sim/score/status?jobId=j1'))
    expect(res.status).toBe(501)
    expect((await res.json()).status).toBe('not_enabled')
  })
})
