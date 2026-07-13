import { describe, expect, it, vi } from 'vitest'

import {
  LongPacketDispatchError,
  dispatchLongPacketWork,
} from '@/workers/triageLongPacketDispatcherCore'
import { parseLongPacketWorkMessage } from '@/workers/triageLongPacketMessage'

function uuid(index: number): string {
  return `05240000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

describe('long-packet scheduled dispatcher', () => {
  it('sends opaque identifiers in SQS-sized batches and reports counts only', async () => {
    const sendBatch = vi.fn(async () => ({ failedEntryIds: [] }))
    const listDispatchableWork = vi.fn(async () =>
      Array.from({ length: 23 }, (_, index) => ({
        kind: index === 22 ? ('finalize' as const) : ('chunk' as const),
        jobId: uuid(index + 1),
      })),
    )

    const summary = await dispatchLongPacketWork({
      listDispatchableWork,
      sendBatch,
    })

    expect(summary).toEqual({ discovered: 23, enqueued: 23, batchCount: 3 })
    expect(sendBatch.mock.calls.map(([entries]) => entries.length)).toEqual([
      10, 10, 3,
    ])
    for (const [entries] of sendBatch.mock.calls) {
      for (const entry of entries) {
        expect(parseLongPacketWorkMessage(entry.body)).toMatchObject({
          job_id: expect.stringMatching(/^0524/),
        })
        expect(entry.body).not.toMatch(/tenant|patient|referral|source|text/i)
      }
    }
  })

  it('deduplicates repeated sweep results before enqueueing', async () => {
    const sendBatch = vi.fn(async () => ({ failedEntryIds: [] }))
    const item = { kind: 'chunk' as const, jobId: uuid(1) }

    const summary = await dispatchLongPacketWork({
      listDispatchableWork: async () => [item, item],
      sendBatch,
    })

    expect(summary.discovered).toBe(1)
    expect(sendBatch.mock.calls[0][0]).toHaveLength(1)
  })

  it('fails the invocation on a partial batch response so the scheduler retries', async () => {
    await expect(
      dispatchLongPacketWork({
        listDispatchableWork: async () => [
          { kind: 'chunk', jobId: uuid(1) },
          { kind: 'chunk', jobId: uuid(2) },
        ],
        sendBatch: async (entries) => ({
          failedEntryIds: [entries[1].id],
        }),
      }),
    ).rejects.toThrow(LongPacketDispatchError)
  })

  it('does no queue work when there is nothing dispatchable', async () => {
    const sendBatch = vi.fn()
    await expect(
      dispatchLongPacketWork({
        listDispatchableWork: async () => [],
        sendBatch,
      }),
    ).resolves.toEqual({ discovered: 0, enqueued: 0, batchCount: 0 })
    expect(sendBatch).not.toHaveBeenCalled()
  })
})
