import { describe, expect, it, vi } from 'vitest'

import {
  ClinicalModelTimeoutError,
  runClinicalModelWithTimeout,
} from '@/lib/triage/modelTimeout'

describe('runClinicalModelWithTimeout', () => {
  it('passes a live abort signal and returns a completed result', async () => {
    const operation = vi.fn(async (signal: AbortSignal) => {
      expect(signal.aborted).toBe(false)
      return 'complete'
    })

    await expect(
      runClinicalModelWithTimeout({
        label: 'safety_extractor',
        timeoutMs: 1_000,
        operation,
      }),
    ).resolves.toBe('complete')
    expect(operation).toHaveBeenCalledOnce()
  })

  it('aborts and fails with a bounded non-PHI error when the deadline expires', async () => {
    vi.useFakeTimers()
    try {
      let capturedSignal: AbortSignal | undefined
      const pending = runClinicalModelWithTimeout({
        label: 'safety_extractor',
        timeoutMs: 45_000,
        operation: (signal) => {
          capturedSignal = signal
          return new Promise<never>(() => undefined)
        },
      })
      const rejection = expect(pending).rejects.toEqual(
        expect.objectContaining({
          name: 'ClinicalModelTimeoutError',
          label: 'safety_extractor',
          timeoutMs: 45_000,
        }),
      )

      await vi.advanceTimersByTimeAsync(45_000)

      await rejection
      expect(capturedSignal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears the timer when the operation rejects before the deadline', async () => {
    vi.useFakeTimers()
    try {
      const expected = new Error('synthetic branch failure')
      await expect(
        runClinicalModelWithTimeout({
          label: 'adjudicator',
          timeoutMs: 45_000,
          operation: async () => {
            throw expected
          },
        }),
      ).rejects.toBe(expected)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects invalid timeout configuration before invoking a model', async () => {
    const operation = vi.fn()
    await expect(
      runClinicalModelWithTimeout({
        label: 'outpatient_scorer',
        timeoutMs: 0,
        operation,
      }),
    ).rejects.toBeInstanceOf(ClinicalModelTimeoutError)
    expect(operation).not.toHaveBeenCalled()
  })
})
