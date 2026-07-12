import { describe, it, expect } from 'vitest'
import { renderBlock, makeStreamState, DECLICK, type StreamState } from '../pcmStreamWorklet'

function push(s: StreamState, arr: number[]) {
  const f = Float32Array.from(arr)
  s.chunks.push(f)
  s.queued += f.length
}

describe('renderBlock', () => {
  it('stays silent until the prime cushion is buffered, then plays', () => {
    const s = makeStreamState(4) // prime after 4 samples
    push(s, [0.5, 0.5]) // only 2 queued — under threshold
    const out = new Float32Array(4)
    renderBlock(s, out)
    expect(Array.from(out)).toEqual([0, 0, 0, 0]) // not primed → silence
    expect(s.primed).toBe(false)
    push(s, [0.5, 0.5]) // now 4 queued → will prime
    const out2 = new Float32Array(4)
    renderBlock(s, out2)
    expect(s.primed).toBe(true)
    expect(out2.some((v) => v !== 0)).toBe(true) // audio now flows
  })

  it('joins across chunk boundaries with no gap once primed', () => {
    const s = makeStreamState(0)
    s.silent = false // skip the resume fade-in for a clean contiguity check
    push(s, [1, 2])
    push(s, [3, 4])
    const out = new Float32Array(4)
    renderBlock(s, out)
    expect(Array.from(out)).toEqual([1, 2, 3, 4]) // contiguous — the anti-click property
  })

  it('declicks into silence on underrun (fade to 0, not a hard jump) and re-primes', () => {
    const s = makeStreamState(0)
    s.silent = false
    push(s, [1]) // one real sample, then underrun
    const out = new Float32Array(DECLICK + 4)
    renderBlock(s, out)
    expect(out[0]).toBe(1) // the real sample
    expect(out[1]).toBeGreaterThan(0) // ramped-down, never a hard jump to 0
    expect(out[1]).toBeLessThan(1)
    expect(out[out.length - 1]).toBe(0) // tail is silence
    expect(s.primed).toBe(false) // re-primed for the next cushion
    expect(s.silent).toBe(true)
  })

  it('fades in (no hard jump) when resuming from silence', () => {
    const s = makeStreamState(0)
    s.silent = true // simulate resuming after a gap
    s.lastOut = 0
    push(s, new Array(DECLICK + 2).fill(1))
    const out = new Float32Array(DECLICK + 2)
    renderBlock(s, out)
    expect(out[0]).toBeLessThan(1) // first sample ramped up, not a hard 0→1 jump
    expect(out[0]).toBeGreaterThan(0)
    expect(out[DECLICK]).toBeCloseTo(1, 5) // reaches full level after the ramp
  })

  // --- diagnostics counters (iOS crackle instrumentation, 2026-07-11) ---

  it('counts blocksRendered once per renderBlock call regardless of prime state', () => {
    const s = makeStreamState(100) // never reaches the prime cushion below
    const out = new Float32Array(4)
    expect(s.stats.blocksRendered).toBe(0)
    renderBlock(s, out) // not primed — still counts a rendered block
    renderBlock(s, out)
    renderBlock(s, out)
    expect(s.stats.blocksRendered).toBe(3)
  })

  it('does NOT count a prime or underrun for the not-yet-primed early return', () => {
    const s = makeStreamState(4) // needs 4 queued samples to prime
    push(s, [0.5]) // only 1 queued — under threshold, stays in the buffering path
    const out = new Float32Array(4)
    renderBlock(s, out)
    expect(s.primed).toBe(false)
    expect(s.stats.primes).toBe(0)
    expect(s.stats.underruns).toBe(0)
    expect(s.stats.blocksRendered).toBe(1)
  })

  it('increments stats.primes on (re)prime and stats.underruns exactly once per exhaustion', () => {
    const s = makeStreamState(2) // prime after 2 samples queued
    push(s, [0.5]) // 1 queued — not enough to prime yet
    renderBlock(s, new Float32Array(4))
    expect(s.stats.primes).toBe(0)
    expect(s.stats.underruns).toBe(0)

    // Now 2 queued: primes this block, then immediately exhausts mid-block —
    // one underrun, re-primed=false for the next cushion.
    push(s, [0.5])
    renderBlock(s, new Float32Array(4))
    expect(s.stats.primes).toBe(1)
    expect(s.stats.underruns).toBe(1)
    expect(s.primed).toBe(false)

    // Re-prime and underrun again — counters advance by exactly one each,
    // not double-counted per exhaustion.
    push(s, [0.5, 0.5])
    renderBlock(s, new Float32Array(4))
    expect(s.stats.primes).toBe(2)
    expect(s.stats.underruns).toBe(2)
    expect(s.primed).toBe(false)
  })

  it('joining across chunk boundaries once primed does not trip an underrun', () => {
    const s = makeStreamState(0)
    s.silent = false
    push(s, [1, 2])
    push(s, [3, 4])
    const out = new Float32Array(4)
    renderBlock(s, out)
    expect(s.stats.underruns).toBe(0) // fully filled the block — no exhaustion
    expect(s.stats.blocksRendered).toBe(1)
  })

  // Note: pushes/samplesIn/maxQueued are tracked only in the worklet string's
  // port 'push' handler (there is no port on the pure StreamState side), and
  // the `clear` message that must preserve stats across a barge-in also only
  // exists in the worklet string — neither is reachable/testable from pure
  // renderBlock/makeStreamState, per the instrumentation spec.
})
