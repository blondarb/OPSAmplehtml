/**
 * Continuous upsampler for streamed PCM playback.
 *
 * The Nova Sonic relay sends 24 kHz PCM chunks. Mobile browsers open the
 * AudioContext at 48 kHz, so if each chunk is handed to Web Audio as its own
 * 24 kHz AudioBuffer, the browser resamples every chunk INDEPENDENTLY — and at
 * each chunk boundary the resampler has no neighbouring samples, producing a
 * discontinuity (an audible click) at every seam. That is the mobile "clicking".
 *
 * Fix: resample here, ONCE, carrying interpolation state across chunk
 * boundaries, and hand Web Audio buffers already at the context's native rate
 * (no per-chunk browser resample). Linear interpolation is enough to remove the
 * boundary discontinuity; the point is continuity, not brickwall filtering.
 *
 * Pure + stateless-per-call except for the caller-owned ResampleState, so it is
 * unit-testable with no Web Audio. `resamplePcm16` returns Float32 in [-1, 1].
 */

export interface ResampleState {
  /** Fractional input position for the NEXT output sample, in the incoming
   *  chunk's coordinate frame. May be negative to bridge a boundary (then the
   *  interpolation's left sample is `last`). */
  phase: number
  /** Last input sample of the previous chunk, for boundary interpolation. */
  last: number
}

export function makeResampleState(): ResampleState {
  return { phase: 0, last: 0 }
}

/**
 * Resample Int16 PCM at `fromRate` to Float32 at `toRate`, carrying `state`
 * across calls so consecutive chunks join with no discontinuity.
 */
export function resamplePcm16(
  pcm: Int16Array,
  fromRate: number,
  toRate: number,
  state: ResampleState,
): Float32Array {
  const inLen = pcm.length
  if (inLen === 0) return new Float32Array(0)

  // Equal rates (e.g. a desktop context already at 24 kHz): straight convert,
  // no interpolation. Reset phase; carry last for a subsequent rate change.
  if (fromRate === toRate) {
    const out = new Float32Array(inLen)
    for (let i = 0; i < inLen; i++) out[i] = pcm[i] / 32768
    state.phase = 0
    state.last = out[inLen - 1]
    return out
  }

  const ratio = fromRate / toRate // input samples advanced per output sample
  const out: number[] = []
  let pos = state.phase

  // Emit an output sample whenever both interpolation neighbours are available:
  //   i0 = floor(pos), need i0 and i0+1 with i0+1 <= inLen-1  =>  pos < inLen-1.
  //   i0 === -1 is allowed and uses the carried `last` as the left neighbour.
  while (pos < inLen - 1) {
    const i0 = Math.floor(pos)
    const frac = pos - i0
    const s0 = i0 < 0 ? state.last : pcm[i0] / 32768
    const s1 = pcm[i0 + 1] / 32768
    out.push(s0 + (s1 - s0) * frac)
    pos += ratio
  }

  // Carry the remainder into the next chunk's coordinate frame (the next chunk's
  // sample 0 is the global sample that was at index inLen here).
  state.phase = pos - inLen
  state.last = pcm[inLen - 1] / 32768
  return Float32Array.from(out)
}
