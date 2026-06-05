import { describe, it, expect } from 'vitest'
import { floatTo16BitPCM, base64FromPcm, pcmFromBase64, downsampleTo16k } from '../pcm'

describe('pcm', () => {
  it('floatTo16BitPCM clamps full-scale', () => {
    const out = floatTo16BitPCM(new Float32Array([0, 1, -1]))
    expect(out[1]).toBe(32767); expect(out[2]).toBe(-32768)
  })
  it('base64 round-trips', () => {
    const pcm = new Int16Array([1, -1, 100, -100])
    expect(Array.from(pcmFromBase64(base64FromPcm(pcm)))).toEqual([1, -1, 100, -100])
  })
  it('downsampleTo16k halves a 32k buffer', () => {
    expect(downsampleTo16k(new Float32Array(320), 32000).length).toBe(160)
  })

  // Extra coverage
  it('downsampleTo16k returns input unchanged at 16000', () => {
    const input = new Float32Array([0.1, 0.2, 0.3])
    expect(downsampleTo16k(input, 16000)).toBe(input)
  })
  it('floatTo16BitPCM clamps out-of-range positive to 32767', () => {
    const out = floatTo16BitPCM(new Float32Array([1.5]))
    expect(out[0]).toBe(32767)
  })
  it('floatTo16BitPCM clamps out-of-range negative to -32768', () => {
    const out = floatTo16BitPCM(new Float32Array([-2.0]))
    expect(out[0]).toBe(-32768)
  })
  it('floatTo16BitPCM maps zero to zero', () => {
    const out = floatTo16BitPCM(new Float32Array([0]))
    expect(out[0]).toBe(0)
  })
})
