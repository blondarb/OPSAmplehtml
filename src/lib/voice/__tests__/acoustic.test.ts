import { describe, it, expect } from 'vitest'
import { analyzeAcoustic } from '../acoustic'
import { buildPanel } from '../flagging'

const SR = 16000

/** Pure sine at a fixed F0. */
function sine(freqHz: number, seconds: number, amp = 0.5): Float32Array {
  const n = Math.floor(seconds * SR)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / SR)
  return out
}

/** Carrier with sinusoidal frequency modulation (vocal-tremor analog). */
function fmTone(f0: number, modHz: number, devHz: number, seconds: number, amp = 0.5): Float32Array {
  const n = Math.floor(seconds * SR)
  const out = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const inst = f0 + devHz * Math.sin((2 * Math.PI * modHz * i) / SR)
    phase += (2 * Math.PI * inst) / SR
    out[i] = amp * Math.sin(phase)
  }
  return out
}

/** Amplitude bursts at a given repetition rate (DDK analog). */
function bursts(rateHz: number, seconds: number): Float32Array {
  const n = Math.floor(seconds * SR)
  const out = new Float32Array(n)
  const period = SR / rateHz
  const burstLen = Math.floor(period * 0.4)
  for (let i = 0; i < n; i++) {
    const phaseInPeriod = i % Math.floor(period)
    const inBurst = phaseInPeriod < burstLen
    const env = inBurst ? Math.sin((Math.PI * phaseInPeriod) / burstLen) : 0
    out[i] = env * 0.6 * Math.sin((2 * Math.PI * 200 * i) / SR)
  }
  return out
}

describe('acoustic engine — sustained vowel', () => {
  it('estimates F0 of a pure tone within tolerance', () => {
    const raw = analyzeAcoustic('sustained_vowel', { samples: sine(150, 3), sampleRate: SR })
    expect(raw.sustainedVowel?.f0MeanHz).toBeGreaterThan(140)
    expect(raw.sustainedVowel?.f0MeanHz).toBeLessThan(160)
    expect(raw.quality.voicedFraction).toBeGreaterThan(0.8)
    expect(raw.quality.tooShort).toBe(false)
  })

  it('reports max phonation time near the clip length for continuous voicing', () => {
    const raw = analyzeAcoustic('sustained_vowel', { samples: sine(150, 4), sampleRate: SR })
    expect(raw.sustainedVowel?.maxPhonationSeconds).toBeGreaterThan(3)
  })

  it('detects 5 Hz vocal tremor in a frequency-modulated tone', () => {
    const raw = analyzeAcoustic('sustained_vowel', { samples: fmTone(150, 5, 8, 3), sampleRate: SR })
    const sv = raw.sustainedVowel
    expect(sv).toBeTruthy()
    const hz = sv?.tremorHz ?? null
    expect(hz).not.toBeNull()
    expect(hz as number).toBeGreaterThan(3.5)
    expect(hz as number).toBeLessThan(7)
    expect(sv?.tremorStrength ?? 0).toBeGreaterThan(0.2)
  })
})

describe('acoustic engine — DDK', () => {
  it('recovers a ~6 syll/s repetition rate', () => {
    const raw = analyzeAcoustic('ddk', { samples: bursts(6, 3), sampleRate: SR })
    expect(raw.ddk?.syllableCount).toBeGreaterThan(10)
    expect(raw.ddk?.rateSyllPerSec ?? 0).toBeGreaterThan(4.5)
    expect(raw.ddk?.rateSyllPerSec ?? 0).toBeLessThan(7.5)
  })

  it('reports low regularity CV for evenly spaced bursts', () => {
    const raw = analyzeAcoustic('ddk', { samples: bursts(6, 3), sampleRate: SR })
    expect(raw.ddk?.regularityCv ?? 1).toBeLessThan(0.2)
  })
})

describe('quality gating', () => {
  it('marks a sub-second clip as tooShort and INVALID overall', () => {
    const raw = analyzeAcoustic('sustained_vowel', { samples: sine(150, 0.3), sampleRate: SR })
    expect(raw.quality.tooShort).toBe(true)
    const panel = buildPanel(raw)
    expect(panel.overallFlag).toBe('INVALID')
  })
})

describe('panel building', () => {
  it('produces a reading panel with a monopitch feature and a valid roll-up', () => {
    // Monotone reading → low F0 SD → monopitch should not be GREEN.
    const raw = analyzeAcoustic('reading', { samples: sine(120, 4), sampleRate: SR })
    const panel = buildPanel(raw)
    expect(panel.task).toBe('reading')
    expect(panel.features.find(f => f.key === 'monopitch')).toBeTruthy()
    expect(['GREEN', 'YELLOW', 'RED', 'INVALID']).toContain(panel.overallFlag)
  })
})
