import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTriageLongPacketDispatcherHandler } from '@/workers/triageLongPacketDispatcher'

const JOB_ID = '05240000-0000-4000-8000-000000000001'

describe('triage long-packet dispatcher handler', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('emits only aggregate operational telemetry', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const handler = createTriageLongPacketDispatcherHandler({
      listDispatchableWork: async () => [{ kind: 'chunk', jobId: JOB_ID }],
      sendBatch: async () => ({ failedEntryIds: [] }),
    })

    await expect(handler()).resolves.toEqual({
      discovered: 1,
      enqueued: 1,
      batchCount: 1,
    })

    const logged = info.mock.calls.flat().join(' ')
    expect(logged).toContain('triage_long_packet_dispatch_completed')
    expect(logged).not.toContain(JOB_ID)
    expect(logged).not.toMatch(/tenant|patient|referral|source|text/i)
  })

  it('propagates queue failures for scheduled retry', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const handler = createTriageLongPacketDispatcherHandler({
      listDispatchableWork: async () => [{ kind: 'chunk', jobId: JOB_ID }],
      sendBatch: async (entries) => ({
        failedEntryIds: [entries[0].id],
      }),
    })

    await expect(handler()).rejects.toThrow(/accepted only part/i)
  })
})
