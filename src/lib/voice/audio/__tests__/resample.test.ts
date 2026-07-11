import { describe, it, expect } from 'vitest'
import { makeResampleState, resamplePcm16 } from '../resample'

function sineI16(n: number, freq: number, rate: number): Int16Array {
  const out = new Int16Array(n)
  for (let i = 0; i < n; i++) out[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 30000)
  return out
}

describe('resamplePcm16', () => {
  it('passthrough when rates are equal (no pitch/length change)', () => {
    const pcm = sineI16(100, 440, 24000)
    const out = resamplePcm16(pcm, 24000, 24000, makeResampleState())
    expect(out.length).toBe(100)
    expect(out[0]).toBeCloseTo(pcm[0] / 32768, 5)
    expect(out[99]).toBeCloseTo(pcm[99] / 32768, 5)
  })

  it('24k -> 48k roughly doubles sample count (correct ratio => no pitch shift)', () => {
    const pcm = sineI16(2400, 440, 24000) // 100 ms
    const out = resamplePcm16(pcm, 24000, 48000, makeResampleState())
    // ~2x samples (allow a few for boundary carry)
    expect(out.length).toBeGreaterThan(2400 * 2 - 5)
    expect(out.length).toBeLessThan(2400 * 2 + 5)
    // stays in range
    for (const v of out) expect(Math.abs(v)).toBeLessThanOrEqual(1)
  })

  it('joins two chunks with NO boundary discontinuity (the anti-click property)', () => {
    // One continuous sine split into two chunks, resampled with carried state.
    const full = sineI16(4800, 300, 24000)
    const a = full.slice(0, 2400)
    const b = full.slice(2400)
    const st = makeResampleState()
    const outA = resamplePcm16(a, 24000, 48000, st)
    const outB = resamplePcm16(b, 24000, 48000, st)

    // Max adjacent-sample step WITHIN a smooth resampled sine is small. The
    // click bug shows up as a large jump at the seam between outA's tail and
    // outB's head — assert that seam step is no bigger than the in-chunk steps.
    const stepAt = (arr: Float32Array, i: number) => Math.abs(arr[i] - arr[i - 1])
    let maxInChunk = 0
    for (let i = 1; i < outA.length; i++) maxInChunk = Math.max(maxInChunk, stepAt(outA, i))
    for (let i = 1; i < outB.length; i++) maxInChunk = Math.max(maxInChunk, stepAt(outB, i))
    const seamStep = Math.abs(outB[0] - outA[outA.length - 1])
    expect(seamStep).toBeLessThanOrEqual(maxInChunk * 1.5)
  })

  it('empty input yields empty output and does not corrupt state', () => {
    const st = makeResampleState()
    const out = resamplePcm16(new Int16Array(0), 24000, 48000, st)
    expect(out.length).toBe(0)
    expect(st.phase).toBe(0)
  })
})
