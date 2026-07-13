import { describe, expect, it, vi } from 'vitest'

import {
  SafetyNoticePaintBarrierUnavailableError,
  continueAfterSafetyNoticePaint,
  type PaintFrameScheduler,
} from '@/lib/triage/safetyNoticePaintBarrier'

function controlledFrames(): PaintFrameScheduler & {
  flushNext: () => void
  pendingCount: () => number
} {
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  return {
    request(callback) {
      const id = nextId++
      callbacks.set(id, callback)
      return id
    },
    cancel(id) {
      callbacks.delete(Number(id))
    },
    flushNext() {
      const next = callbacks.entries().next().value as
        | [number, FrameRequestCallback]
        | undefined
      if (!next) throw new Error('No animation frame is pending.')
      callbacks.delete(next[0])
      next[1](performance.now())
    },
    pendingCount() {
      return callbacks.size
    },
  }
}

function controlledWatchdogClock() {
  let nextId = 1
  const callbacks = new Map<number, () => void>()
  return {
    request(callback: () => void, delayMs: number) {
      void delayMs
      const id = nextId++
      callbacks.set(id, callback)
      return id
    },
    cancel(id: number) {
      callbacks.delete(id)
    },
    flushNext() {
      const next = callbacks.entries().next().value as
        | [number, () => void]
        | undefined
      if (!next) throw new Error('No watchdog timeout is pending.')
      callbacks.delete(next[0])
      next[1]()
    },
    pendingCount() {
      return callbacks.size
    },
  }
}

describe('safety notice paint barrier', () => {
  it('commits the notice synchronously and starts scoring only after two frames', async () => {
    const frames = controlledFrames()
    const order: string[] = []
    const controller = new AbortController()

    const continuation = continueAfterSafetyNoticePaint({
      signal: controller.signal,
      scheduler: frames,
      isCurrentAttempt: () => true,
      commitNotice: () => order.push('notice'),
      startScoring: async () => {
        order.push('scoring')
      },
    })

    expect(order).toStrictEqual(['notice'])
    expect(frames.pendingCount()).toBe(1)
    frames.flushNext()
    await Promise.resolve()
    expect(order).toStrictEqual(['notice'])
    expect(frames.pendingCount()).toBe(1)
    frames.flushNext()

    await expect(continuation).resolves.toBe('started')
    expect(order).toStrictEqual(['notice', 'scoring'])
  })

  it('aborts cleanly between frames without starting scoring', async () => {
    const frames = controlledFrames()
    const watchdogClock = controlledWatchdogClock()
    const controller = new AbortController()
    const startScoring = vi.fn()

    const continuation = continueAfterSafetyNoticePaint({
      signal: controller.signal,
      scheduler: frames,
      watchdogClock,
      isCurrentAttempt: () => true,
      commitNotice: vi.fn(),
      startScoring,
    })

    frames.flushNext()
    await Promise.resolve()
    controller.abort()

    await expect(continuation).resolves.toBe('canceled')
    expect(frames.pendingCount()).toBe(0)
    expect(watchdogClock.pendingCount()).toBe(0)
    expect(startScoring).not.toHaveBeenCalled()
  })

  it('rechecks the attempt after painting and suppresses stale scoring', async () => {
    const frames = controlledFrames()
    let current = true
    const startScoring = vi.fn()
    const continuation = continueAfterSafetyNoticePaint({
      signal: new AbortController().signal,
      scheduler: frames,
      isCurrentAttempt: () => current,
      commitNotice: vi.fn(),
      startScoring,
    })

    frames.flushNext()
    await Promise.resolve()
    current = false
    frames.flushNext()

    await expect(continuation).resolves.toBe('canceled')
    expect(startScoring).not.toHaveBeenCalled()
  })

  it('fails closed when no browser frame scheduler is available', async () => {
    const startScoring = vi.fn()

    await expect(
      continueAfterSafetyNoticePaint({
        signal: new AbortController().signal,
        scheduler: null,
        isCurrentAttempt: () => true,
        commitNotice: vi.fn(),
        startScoring,
      }),
    ).rejects.toBeInstanceOf(SafetyNoticePaintBarrierUnavailableError)
    expect(startScoring).not.toHaveBeenCalled()
  })

  it('fails closed when the first animation frame never fires', async () => {
    const frames = controlledFrames()
    const watchdogClock = controlledWatchdogClock()
    const startScoring = vi.fn()

    const continuation = continueAfterSafetyNoticePaint({
      signal: new AbortController().signal,
      scheduler: frames,
      watchdogClock,
      frameTimeoutMs: 25,
      isCurrentAttempt: () => true,
      commitNotice: vi.fn(),
      startScoring,
    })

    expect(frames.pendingCount()).toBe(1)
    expect(watchdogClock.pendingCount()).toBe(1)
    watchdogClock.flushNext()

    await expect(continuation).rejects.toMatchObject({
      name: 'SafetyNoticePaintBarrierTimeoutError',
    })
    expect(frames.pendingCount()).toBe(0)
    expect(watchdogClock.pendingCount()).toBe(0)
    expect(startScoring).not.toHaveBeenCalled()
  })

  it('fails closed when the second animation frame never fires', async () => {
    const frames = controlledFrames()
    const watchdogClock = controlledWatchdogClock()
    const startScoring = vi.fn()

    const continuation = continueAfterSafetyNoticePaint({
      signal: new AbortController().signal,
      scheduler: frames,
      watchdogClock,
      frameTimeoutMs: 25,
      isCurrentAttempt: () => true,
      commitNotice: vi.fn(),
      startScoring,
    })

    frames.flushNext()
    await Promise.resolve()
    expect(frames.pendingCount()).toBe(1)
    expect(watchdogClock.pendingCount()).toBe(1)
    watchdogClock.flushNext()

    await expect(continuation).rejects.toMatchObject({
      name: 'SafetyNoticePaintBarrierTimeoutError',
    })
    expect(frames.pendingCount()).toBe(0)
    expect(watchdogClock.pendingCount()).toBe(0)
    expect(startScoring).not.toHaveBeenCalled()
  })
})
