import { describe, expect, it } from 'vitest'

import { formatLongPacketProgress } from '@/lib/triage/longPacketProgressView'
import type { LongPacketProgress } from '@/lib/triage/pollClient'

function progress(
  overrides: Partial<LongPacketProgress> = {},
): LongPacketProgress {
  return {
    run_status: 'running',
    expected_chunks: 8,
    mapper: { completed: 3, failed: 0, leased: 1 },
    safety: { completed: 4, failed: 0, leased: 1 },
    finalizer_status: 'pending',
    ...overrides,
  }
}

describe('formatLongPacketProgress', () => {
  it('shows concise clinical mapping, safety review, and active-work counts', () => {
    expect(formatLongPacketProgress(progress())).toBe(
      'Clinical mapping 3/8 · Safety review 4/8 · 2 active',
    )
  })

  it('describes failed chunk work as awaiting retry or review', () => {
    expect(
      formatLongPacketProgress(
        progress({
          mapper: { completed: 3, failed: 1, leased: 0 },
          safety: { completed: 4, failed: 2, leased: 0 },
        }),
      ),
    ).toBe(
      'Clinical mapping 3/8 · Safety review 4/8 · 3 awaiting retry/review',
    )
  })

  it.each([
    progress({
      mapper: { completed: 8, failed: 0, leased: 0 },
      safety: { completed: 8, failed: 0, leased: 0 },
      finalizer_status: 'pending',
    }),
    progress({
      mapper: { completed: 8, failed: 0, leased: 0 },
      safety: { completed: 8, failed: 0, leased: 0 },
      finalizer_status: 'leased',
    }),
    progress({
      run_status: 'complete',
      mapper: { completed: 8, failed: 0, leased: 0 },
      safety: { completed: 8, failed: 0, leased: 0 },
      finalizer_status: 'complete',
    }),
  ])('does not call a pending extraction complete while final output is settling', (value) => {
    expect(formatLongPacketProgress(value)).toBe('Finalizing packet review…')
  })

  it.each([
    progress({ run_status: 'failed' }),
    progress({ finalizer_status: 'failed' }),
    progress({
      mapper: { completed: 8, failed: 0, leased: 0 },
      safety: { completed: 8, failed: 0, leased: 0 },
      finalizer_status: 'failed',
    }),
  ])('uses human-review wording for a failed run or finalizer', (value) => {
    expect(formatLongPacketProgress(value)).toBe(
      'Packet processing needs human review.',
    )
  })

  it('uses a neutral preparation state before work starts', () => {
    expect(
      formatLongPacketProgress(
        progress({
          run_status: 'pending',
          mapper: { completed: 0, failed: 0, leased: 0 },
          safety: { completed: 0, failed: 0, leased: 0 },
          finalizer_status: 'pending',
        }),
      ),
    ).toBe('Preparing packet review…')
  })

  it('never exposes durable-work or source internals', () => {
    const label = formatLongPacketProgress(progress())

    expect(label).not.toMatch(
      /job|lease|run id|model|prompt|source|packet id|result|hash/i,
    )
  })
})
