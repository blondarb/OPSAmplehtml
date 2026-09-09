import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DrainTracker } from '../drainTracker'

describe('DrainTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves whenDrained() immediately when idle (no audio enqueued yet)', async () => {
    const tracker = new DrainTracker()
    let resolved = false
    tracker.whenDrained().then(() => {
      resolved = true
    })
    await Promise.resolve()
    expect(resolved).toBe(true)
  })

  it('does not resolve when a spurious drained() is followed by enqueue() within the grace window', async () => {
    const tracker = new DrainTracker({ graceMs: 500 })
    tracker.audioEnqueued()
    tracker.drainedReported() // starts the 500ms grace timer

    let resolved = false
    tracker.whenDrained().then(() => {
      resolved = true
    })

    // More audio shows up before the grace timer fires — this was just a
    // network gap, not the end of playback. Cancels the timer.
    vi.advanceTimersByTime(200)
    tracker.audioEnqueued()

    // Advance past when the ORIGINAL timer would have fired — it must not
    // have resolved anything, because it was cancelled.
    vi.advanceTimersByTime(400)
    await Promise.resolve()
    expect(resolved).toBe(false)
  })

  it('resolves once drainedReported() is followed by graceMs of quiet with no further enqueue', async () => {
    const tracker = new DrainTracker({ graceMs: 500 })
    tracker.audioEnqueued()
    tracker.drainedReported()

    let resolved = false
    tracker.whenDrained().then(() => {
      resolved = true
    })

    vi.advanceTimersByTime(499)
    await Promise.resolve()
    expect(resolved).toBe(false)

    vi.advanceTimersByTime(1)
    await Promise.resolve()
    expect(resolved).toBe(true)
  })

  it('flushNow() resolves all waiters immediately, cancelling any pending grace timer', async () => {
    const tracker = new DrainTracker({ graceMs: 500 })
    tracker.audioEnqueued()
    tracker.drainedReported()

    let resolved = false
    tracker.whenDrained().then(() => {
      resolved = true
    })

    vi.advanceTimersByTime(50) // well inside the grace window
    tracker.flushNow()
    await Promise.resolve()
    expect(resolved).toBe(true)
  })

  it('flushNow() resolves immediately even with no pending drain report (active, no timer)', async () => {
    const tracker = new DrainTracker({ graceMs: 500 })
    tracker.audioEnqueued()

    let resolved = false
    tracker.whenDrained().then(() => {
      resolved = true
    })

    tracker.flushNow()
    await Promise.resolve()
    expect(resolved).toBe(true)
  })

  it('a second whenDrained() call after a confirmed drain resolves immediately (tracker is idle again)', async () => {
    const tracker = new DrainTracker({ graceMs: 500 })
    tracker.audioEnqueued()
    tracker.drainedReported()
    vi.advanceTimersByTime(500)
    await Promise.resolve()

    let resolved = false
    tracker.whenDrained().then(() => {
      resolved = true
    })
    await Promise.resolve()
    expect(resolved).toBe(true)
  })
})
