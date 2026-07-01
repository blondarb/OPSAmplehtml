import { describe, it, expect } from 'vitest'
import { decodeWav } from '../wav'
import { pureTsEngine, parselmouthEngine, scoreAllEngines } from '../engines'
import { buildBenchReport, type TrialScore } from '../bench'

const SR = 16000

function sine(freqHz: number, seconds: number, sr = SR, amp = 0.5): Float32Array {
  const n = Math.floor(seconds * sr)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / sr)
  return out
}

/** Build a minimal 16-bit PCM mono WAV in memory. */
function makeWav(samples: Float32Array, sr = SR): ArrayBuffer {
  const bytesPerSample = 2
  const dataLen = samples.length * bytesPerSample
  const buf = new ArrayBuffer(44 + dataLen)
  const v = new DataView(buf)
  const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); w(8, 'WAVE')
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sr, true); v.setUint32(28, sr * bytesPerSample, true)
  v.setUint16(32, bytesPerSample, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, dataLen, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buf
}

describe('decodeWav', () => {
  it('round-trips a 16-bit PCM mono WAV', () => {
    const wav = decodeWav(makeWav(sine(150, 1)))
    expect(wav.sampleRate).toBe(SR)
    expect(wav.channels).toBe(1)
    expect(wav.bitDepth).toBe(16)
    expect(wav.samples.length).toBeGreaterThan(SR - 5)
  })

  it('rejects non-RIFF input', () => {
    expect(() => decodeWav(new ArrayBuffer(8))).toThrow()
  })
})

describe('engines', () => {
  it('pure-TS engine scores a sustained vowel and exposes numeric features', async () => {
    const res = await pureTsEngine.score('sustained_vowel', { samples: sine(150, 3), sampleRate: SR })
    expect(res.available).toBe(true)
    expect(res.features.f0Mean).toBeGreaterThan(140)
    expect(res.panel).toBeTruthy()
  })

  it('parselmouth engine reports unavailable when VOICE_PRAAT_URL is unset', async () => {
    const prev = process.env.VOICE_PRAAT_URL
    delete process.env.VOICE_PRAAT_URL
    const res = await parselmouthEngine.score('sustained_vowel', { samples: sine(150, 1), sampleRate: SR })
    expect(res.available).toBe(false)
    if (prev !== undefined) process.env.VOICE_PRAAT_URL = prev
  })

  it('scoreAllEngines fans out and never rejects on an unavailable engine', async () => {
    const results = await scoreAllEngines('sustained_vowel', { samples: sine(150, 2), sampleRate: SR })
    expect(results.length).toBe(2)
    expect(results.find(r => r.engine === 'pure-ts')?.available).toBe(true)
  })
})

describe('buildBenchReport', () => {
  it('computes engine agreement, test-retest, and separation from synthetic trials', () => {
    // Two engines that agree exactly; two subjects × two reps; two profiles.
    const mk = (subjectId: string, profile: string, rep: number, val: number): TrialScore => ({
      subjectId,
      profile,
      task: 'sustained_vowel',
      rep,
      engines: [
        { engine: 'pure-ts', version: 't', available: true, features: { f0Mean: val } },
        { engine: 'parselmouth', version: 'p', available: true, features: { f0Mean: val } },
      ],
    })
    const trials = [
      mk('a', 'PD', 0, 100), mk('a', 'PD', 1, 101),
      mk('b', 'normal', 0, 200), mk('b', 'normal', 1, 199),
    ]
    const report = buildBenchReport(trials)
    const row = report.find(r => r.feature === 'f0Mean')!
    expect(row).toBeTruthy()
    // Engines identical → near-perfect agreement.
    expect(row.engineAgreementIcc as number).toBeCloseTo(1, 3)
    // Both profiles present in separation.
    const ts = row.perEngine.find(e => e.engine === 'pure-ts')!
    expect(Object.keys(ts.separation).sort()).toEqual(['PD', 'normal'])
    expect(ts.separation.PD.mean).toBeCloseTo(100.5, 1)
  })
})
