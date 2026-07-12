export interface PaintFrameScheduler {
  request(callback: FrameRequestCallback): number
  cancel(handle: number): void
}

export interface PaintBarrierWatchdogClock {
  request(callback: () => void, delayMs: number): number
  cancel(handle: number): void
}

const DEFAULT_FRAME_TIMEOUT_MS = 2_000

export class SafetyNoticePaintBarrierUnavailableError extends Error {
  readonly name = 'SafetyNoticePaintBarrierUnavailableError'

  constructor() {
    super(
      'The safety notice could not be confirmed as painted. Scoring remains blocked.',
    )
  }
}

export class SafetyNoticePaintBarrierTimeoutError extends Error {
  readonly name = 'SafetyNoticePaintBarrierTimeoutError'

  constructor(frameTimeoutMs: number) {
    super(
      `The safety notice could not be confirmed as painted within ${frameTimeoutMs} ms. Scoring remains blocked.`,
    )
  }
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function browserFrameScheduler(): PaintFrameScheduler | null {
  if (
    typeof globalThis.requestAnimationFrame !== 'function' ||
    typeof globalThis.cancelAnimationFrame !== 'function'
  ) {
    return null
  }
  return {
    request: (callback) => globalThis.requestAnimationFrame(callback),
    cancel: (handle) => globalThis.cancelAnimationFrame(handle),
  }
}

function browserWatchdogClock(): PaintBarrierWatchdogClock {
  return {
    // This client-side module receives the browser's numeric timeout handle;
    // Node's ambient types widen the compile-time return type to Timeout.
    request: (callback, delayMs) =>
      globalThis.setTimeout(callback, delayMs) as unknown as number,
    cancel: (handle) => globalThis.clearTimeout(handle),
  }
}

function waitForFrame(
  signal: AbortSignal,
  scheduler: PaintFrameScheduler,
  watchdogClock: PaintBarrierWatchdogClock,
  frameTimeoutMs: number,
): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError())

  return new Promise<void>((resolve, reject) => {
    let frameHandle: number | null = null
    let watchdogHandle: number | null = null
    let settled = false
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    const cancelFrame = () => {
      if (frameHandle === null) return
      scheduler.cancel(frameHandle)
      frameHandle = null
    }
    const cancelWatchdog = () => {
      if (watchdogHandle === null) return
      watchdogClock.cancel(watchdogHandle)
      watchdogHandle = null
    }
    const onAbort = () => {
      if (settled) return
      settled = true
      cancelFrame()
      cancelWatchdog()
      cleanup()
      reject(abortError())
    }
    const onTimeout = () => {
      if (settled) return
      settled = true
      watchdogHandle = null
      cancelFrame()
      cleanup()
      reject(new SafetyNoticePaintBarrierTimeoutError(frameTimeoutMs))
    }
    const onFrame = () => {
      if (settled) return
      settled = true
      frameHandle = null
      cancelWatchdog()
      cleanup()
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      watchdogHandle = watchdogClock.request(onTimeout, frameTimeoutMs)
      if (settled) return
      const requestedFrame = scheduler.request(onFrame)
      if (!settled) frameHandle = requestedFrame
    } catch (error) {
      if (settled) return
      settled = true
      cancelFrame()
      cancelWatchdog()
      cleanup()
      reject(error)
    }
  })
}

export async function waitForTwoAnimationFrames(
  signal: AbortSignal,
  scheduler: PaintFrameScheduler | null | undefined = undefined,
  watchdogClock: PaintBarrierWatchdogClock = browserWatchdogClock(),
  frameTimeoutMs: number = DEFAULT_FRAME_TIMEOUT_MS,
): Promise<void> {
  const selected =
    scheduler === undefined ? browserFrameScheduler() : scheduler
  if (!selected) throw new SafetyNoticePaintBarrierUnavailableError()
  await waitForFrame(signal, selected, watchdogClock, frameTimeoutMs)
  await waitForFrame(signal, selected, watchdogClock, frameTimeoutMs)
}

export async function continueAfterSafetyNoticePaint(input: {
  signal: AbortSignal
  scheduler?: PaintFrameScheduler | null
  watchdogClock?: PaintBarrierWatchdogClock
  frameTimeoutMs?: number
  isCurrentAttempt: () => boolean
  commitNotice: () => void
  startScoring: () => Promise<void>
}): Promise<'started' | 'canceled'> {
  if (input.signal.aborted || !input.isCurrentAttempt()) return 'canceled'

  input.commitNotice()
  try {
    await waitForTwoAnimationFrames(
      input.signal,
      input.scheduler,
      input.watchdogClock,
      input.frameTimeoutMs,
    )
  } catch (error) {
    if (isAbortError(error)) return 'canceled'
    throw error
  }

  if (input.signal.aborted || !input.isCurrentAttempt()) return 'canceled'
  await input.startScoring()
  return 'started'
}
