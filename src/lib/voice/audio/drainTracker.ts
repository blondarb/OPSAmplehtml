/**
 * DrainTracker — turns a raw "queue emptied" signal into a real "playback
 * finished" signal via a short grace window.
 *
 * Why this exists (2026-09-08, prod run 22350e76): the AudioWorklet's
 * `reportDrain()` fires after only ~4 empty render blocks (~11 ms at 48 kHz).
 * Nova streams PCM in small chunks with small gaps between them, so a
 * momentary underrun mid-sentence looks identical to "the sentence is over".
 * The old player resolved every `whenDrained()` waiter the instant that first
 * drain message arrived, so the closing line got cut off mid-word when a
 * network gap coincided with `aiSpeechStop` → `endSession`.
 *
 * DrainTracker fixes this by not trusting a single drain report: it starts a
 * short grace timer instead, and only resolves waiters if nothing new was
 * enqueued before the timer fires. If more audio shows up during the grace
 * window (the ordinary case — the "drain" was just a network gap), the timer
 * is cancelled and the tracker goes back to "active" as if the report never
 * happened.
 *
 * Pure and timer-injectable so it is unit-testable without touching any
 * browser audio API — see `drainTracker.test.ts`.
 */

type TimerHandle = ReturnType<typeof setTimeout>

export interface DrainTrackerOptions {
  /** How long to wait, after a drain report, for more audio before treating
   *  playback as genuinely finished. Default 500ms. */
  graceMs?: number
  /** Injectable timer functions — defaults to the global setTimeout/clearTimeout. */
  setTimeoutFn?: (cb: () => void, ms: number) => TimerHandle
  clearTimeoutFn?: (handle: TimerHandle) => void
}

export class DrainTracker {
  private readonly graceMs: number
  private readonly setTimeoutFn: (cb: () => void, ms: number) => TimerHandle
  private readonly clearTimeoutFn: (handle: TimerHandle) => void

  /** True once audio has been enqueued and no confirmed drain has happened since. */
  private active = false
  /** Handle of the pending grace timer, if a drain report is currently being confirmed. */
  private timer: TimerHandle | null = null
  private waiters: Array<() => void> = []

  constructor(options: DrainTrackerOptions = {}) {
    this.graceMs = options.graceMs ?? 500
    this.setTimeoutFn = options.setTimeoutFn ?? setTimeout
    this.clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout
  }

  /** Call whenever audio is handed off for playback (pushed to the worklet,
   *  or scheduled as a fallback buffer source). Cancels any pending grace
   *  timer from an earlier (now-stale) drain report. */
  audioEnqueued(): void {
    this.active = true
    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer)
      this.timer = null
    }
  }

  /** Call when the underlying playback signals its queue emptied (worklet
   *  'drained' message, or the fallback's activeSources hitting 0). Does NOT
   *  resolve waiters immediately — starts (or leaves running) a grace timer
   *  that resolves them only if nothing new arrives before it fires. */
  drainedReported(): void {
    if (!this.active) return // nothing was queued — spurious report, ignore
    if (this.timer !== null) return // a grace timer is already pending
    this.timer = this.setTimeoutFn(() => {
      this.timer = null
      this.active = false
      this.resolveAll()
    }, this.graceMs)
  }

  /**
   * Resolves once playback has genuinely finished: immediately if the
   * tracker is idle (no audio enqueued since the last confirmed drain, and
   * no grace timer pending); otherwise once the pending grace timer fires or
   * flushNow() is called.
   */
  whenDrained(): Promise<void> {
    if (!this.active && this.timer === null) return Promise.resolve()
    return new Promise<void>((resolve) => this.waiters.push(resolve))
  }

  /** Interrupt/close: cancel any pending grace timer and resolve every
   *  waiter immediately — used when queued audio is being discarded rather
   *  than allowed to finish. */
  flushNow(): void {
    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer)
      this.timer = null
    }
    this.active = false
    this.resolveAll()
  }

  private resolveAll(): void {
    const waiters = this.waiters
    this.waiters = []
    for (const resolve of waiters) resolve()
  }
}
