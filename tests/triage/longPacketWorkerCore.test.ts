import type { SQSEvent, SQSRecord } from 'aws-lambda'
import { describe, expect, it, vi } from 'vitest'

import type { ClaimedLongPacketWork } from '@/workers/triageLongPacketWorkerCore'
import { processLongPacketSqsEvent } from '@/workers/triageLongPacketWorkerCore'
import { serializeLongPacketWorkMessage } from '@/workers/triageLongPacketMessage'

const JOB_ID = '05240000-0000-4000-8000-000000000001'

function record(
  body = serializeLongPacketWorkMessage({ kind: 'chunk', jobId: JOB_ID }),
  messageId = 'sqs-message-1',
): SQSRecord {
  return { body, messageId } as SQSRecord
}

function event(...records: SQSRecord[]): SQSEvent {
  return { Records: records }
}

function claim(
  overrides: Partial<ClaimedLongPacketWork> = {},
): ClaimedLongPacketWork {
  return {
    jobId: JOB_ID,
    kind: 'chunk',
    leaseToken: 'lease-1',
    attemptCount: 1,
    ...overrides,
  }
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    claim: vi.fn(async () => claim()),
    executeChunk: vi.fn(async () => ({ branch: 'mapper', result: 'safe' })),
    executeFinalizer: vi.fn(async () => ({ status: 'complete' })),
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
    now: () => new Date('2026-07-11T12:00:00.000Z'),
    ...overrides,
  }
}

describe('durable long-packet SQS worker core', () => {
  it('claims, executes, and completes a chunk under its lease', async () => {
    const deps = dependencies()

    await expect(processLongPacketSqsEvent(event(record()), deps)).resolves.toEqual({
      batchItemFailures: [],
    })
    expect(deps.executeChunk).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: JOB_ID, leaseToken: 'lease-1' }),
    )
    expect(deps.complete).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: JOB_ID }),
      { branch: 'mapper', result: 'safe' },
    )
    expect(deps.fail).not.toHaveBeenCalled()
  })

  it('routes finalization work only to the finalizer', async () => {
    const deps = dependencies({
      claim: vi.fn(async () => claim({ kind: 'finalize' })),
    })
    const finalRecord = record(
      serializeLongPacketWorkMessage({ kind: 'finalize', jobId: JOB_ID }),
    )

    await processLongPacketSqsEvent(event(finalRecord), deps)

    expect(deps.executeFinalizer).toHaveBeenCalledOnce()
    expect(deps.executeChunk).not.toHaveBeenCalled()
  })

  it('acknowledges duplicate work that the database declines to lease', async () => {
    const deps = dependencies({ claim: vi.fn(async () => null) })

    const result = await processLongPacketSqsEvent(event(record()), deps)

    expect(result.batchItemFailures).toEqual([])
    expect(deps.executeChunk).not.toHaveBeenCalled()
    expect(deps.complete).not.toHaveBeenCalled()
  })

  it('persists a retry time and acknowledges a model failure', async () => {
    const modelError = new Error('synthetic model timeout')
    const deps = dependencies({
      claim: vi.fn(async () => claim({ attemptCount: 2 })),
      executeChunk: vi.fn(async () => {
        throw modelError
      }),
    })

    const result = await processLongPacketSqsEvent(event(record()), deps)

    expect(result.batchItemFailures).toEqual([])
    expect(deps.fail).toHaveBeenCalledWith(
      expect.objectContaining({ attemptCount: 2 }),
      modelError,
      new Date('2026-07-11T12:01:00.000Z'),
    )
  })

  it('returns only failed message identifiers when parsing or persistence is unsafe', async () => {
    const deps = dependencies({
      fail: vi.fn(async () => {
        throw new Error('database unavailable')
      }),
      executeChunk: vi.fn(async () => {
        throw new Error('synthetic model timeout')
      }),
    })

    const result = await processLongPacketSqsEvent(
      event(record('contains referral text', 'invalid'), record(undefined, 'db-fail')),
      deps,
    )

    expect(result).toEqual({
      batchItemFailures: [
        { itemIdentifier: 'invalid' },
        { itemIdentifier: 'db-fail' },
      ],
    })
  })

  it('fails a mismatched database binding without running either model path', async () => {
    const deps = dependencies({
      claim: vi.fn(async () =>
        claim({ jobId: '05240000-0000-4000-8000-000000000002' }),
      ),
    })

    const result = await processLongPacketSqsEvent(event(record()), deps)

    expect(result.batchItemFailures).toEqual([])
    expect(deps.executeChunk).not.toHaveBeenCalled()
    expect(deps.executeFinalizer).not.toHaveBeenCalled()
    expect(deps.fail).toHaveBeenCalledOnce()
  })
})
