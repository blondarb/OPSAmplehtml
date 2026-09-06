import { describe, expect, it, vi } from 'vitest'
import { dispatchHistorianEvaluations } from '@/workers/historianEvalDispatcherCore'

function setup(count = 1) {
  const rows = Array.from({ length: count }, (_, i) => ({ id: `opaque-${i}`, transcript: 'must never enter queue', name: 'must never enter queue' }))
  const query = vi.fn().mockResolvedValue({ rows: [] }).mockResolvedValueOnce({ rows })
  const sendMessages = vi.fn().mockResolvedValue({ failedEntryIds: [] })
  return { query, sendMessages, now: () => new Date('2026-09-05T20:00:00Z') }
}

describe('historian evaluation dispatcher', () => {
  it('selects the bounded pending window, sends, then conditionally marks queued', async () => {
    const deps = setup()
    expect(await dispatchHistorianEvaluations(deps)).toEqual({ discovered: 1, enqueued: 1, batchCount: 1 })
    expect(deps.query.mock.calls[0][0]).toMatch(/status' = 'pending'/)
    expect(deps.query.mock.calls[0][0]).toMatch(/created_at > now\(\) - interval '48 hours'/)
    expect(deps.query.mock.calls[0][0]).toMatch(/ORDER BY created_at LIMIT 20/)
    expect(deps.query.mock.invocationCallOrder[0]).toBeLessThan(deps.sendMessages.mock.invocationCallOrder[0])
    expect(deps.sendMessages.mock.invocationCallOrder[0]).toBeLessThan(deps.query.mock.invocationCallOrder[1])
    expect(deps.query.mock.calls[1][0]).toContain("WHERE id = $2 AND (final_differential->>'status' = 'pending'")
    expect(JSON.parse(deps.query.mock.calls[1][1][0])).toEqual({ status: 'queued', queued_at: deps.now().toISOString() })
  })
  it('batches at ten and serializes only opaque sessionId and enqueuedAt', async () => {
    const deps = setup(20)
    await dispatchHistorianEvaluations(deps)
    expect(deps.sendMessages.mock.calls.map(([entries]) => entries.length)).toEqual([10, 10])
    for (const [entries] of deps.sendMessages.mock.calls) {
      for (const entry of entries) expect(Object.keys(JSON.parse(entry.body)).sort()).toEqual(['enqueuedAt', 'sessionId'])
    }
  })
  it('leaves rows pending on a rejected send', async () => {
    const deps = setup(10)
    deps.sendMessages.mockRejectedValue(new Error('send failed'))
    await expect(dispatchHistorianEvaluations(deps)).rejects.toThrow('send failed')
    expect(deps.query).toHaveBeenCalledTimes(1)
  })
  it('marks only confirmed successes from a partial batch', async () => {
    const deps = setup(2)
    deps.sendMessages.mockResolvedValue({ failedEntryIds: ['eval-1'] })
    expect((await dispatchHistorianEvaluations(deps)).enqueued).toBe(1)
    expect(deps.query).toHaveBeenCalledTimes(2)
    expect(deps.query.mock.calls[1][1][1]).toBe('opaque-0')
  })
  it('does not send when no rows are pending', async () => {
    const deps = setup(0)
    await dispatchHistorianEvaluations(deps)
    expect(deps.sendMessages).not.toHaveBeenCalled()
  })
})

it('reclaims only queued records older than 60 minutes, in selection and marking', async () => {
  const deps = setup()
  await dispatchHistorianEvaluations(deps)
  for (const [sql] of deps.query.mock.calls) {
    expect(sql).toContain("OR (final_differential->>'status' = 'queued'")
    expect(sql).toContain("AND (final_differential->>'queued_at')::timestamptz < now() - interval '60 minutes'))")
  }
})
