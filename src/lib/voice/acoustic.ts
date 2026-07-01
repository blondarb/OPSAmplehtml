/**
 * Pure-TypeScript acoustic feature engine for neuro speech biomarkers.
 *
 * Phase A scaffold (2026-06-30). Time-domain only, ZERO dependencies — runs
 * inside the Next.js (Node Lambda) route without ffmpeg or a Python sidecar.
 * The client decodes + downsamples to mono Float32 PCM; this module does the math.
 *
 * Coverage vs. the gold standard (Praat / Parselmouth):
 *   - SOLID here: F0 mean/SD (monopitch), loudness + decay, voiced/pause timing,
 *     DDK syllable rate & regularity, vocal-tremor (4–8 Hz) detection, max phonation time.
 *   - APPROXIMATE here: jitter, shimmer, HNR — computed frame-to-frame, NOT from
 *     Praat-grade cycle detection. Flagged `approximate: true`. The test-week
 *     bake-off measures exactly how much a Praat-grade engine improves these.
 *
 * Thresholds/flags live in ./flagging.ts, not here — this module only measures.
 *
 * See docs/plans/2026-06-30-acoustic-speech-biomarkers-spec.md.
 */

import type { VoiceTask } from './types'

export const ENGINE_ID = 'sevaro-ts-acoustic-v0.1'

// ── framing parameters ───────────────────────────────────────────────
// 32 ms frame / 10 ms hop is a standard prosody analysis grid; at 16 kHz that's
// 512 samples / 160 hop. Exposed as constants (not buried magic numbers) so the
// bake-off can sweep them.
const FRAME_MS = 32
const HOP_MS = 10

// Human voice F0 search range (covers low male → high female/child).
const F0_MIN_HZ = 70
const F0_MAX_HZ = 400

// A frame counts as "voiced" when its normalized autocorrelation peak clears this.
const VOICING_THRESHOLD = 0.45

// A frame counts as silence (for pause/phonation timing) below this fraction of
// the recording's peak RMS.
const SILENCE_REL_RMS = 0.12

export interface AcousticInput {
  samples: Float32Array
  sampleRate: number
}

/** Per-frame analysis grid, computed once and reused by every feature. */
interface FrameGrid {
  hop: number
  frameSize: number
  rms: Float32Array          // per-frame RMS energy
  f0: Float32Array           // per-frame F0 in Hz, NaN where unvoiced
  voiced: boolean[]          // per-frame voicing decision
  peakAbs: Float32Array      // per-frame peak |amplitude| (for shimmer)
  frameRateHz: number        // analysis frames per second (1000 / HOP_MS)
}

// ── low-level helpers ────────────────────────────────────────────────

function mean(xs: number[]): number {
  if (!xs.length) return NaN
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return NaN
  const m = mean(xs)
  let s = 0
  for (const x of xs) s += (x - m) * (x - m)
  return Math.sqrt(s / (xs.length - 1))
}

function median(xs: number[]): number {
  if (!xs.length) return NaN
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Estimate F0 of one frame via normalized autocorrelation. Returns the pitch in
 * Hz and the peak autocorrelation strength r∈[0,1] (used for voicing + HNR), or
 * null if no clear period is found in range.
 */
function frameF0(frame: Float32Array, sampleRate: number): { f0: number; r: number } | null {
  const minLag = Math.floor(sampleRate / F0_MAX_HZ)
  const maxLag = Math.min(Math.floor(sampleRate / F0_MIN_HZ), frame.length - 1)
  if (maxLag <= minLag) return null

  // Zero-mean the frame so DC offset doesn't dominate the autocorrelation.
  let m = 0
  for (let i = 0; i < frame.length; i++) m += frame[i]
  m /= frame.length

  let energy = 0
  for (let i = 0; i < frame.length; i++) energy += (frame[i] - m) * (frame[i] - m)
  if (energy <= 1e-9) return null

  let bestLag = -1
  let bestR = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0
    for (let i = 0; i < frame.length - lag; i++) {
      acc += (frame[i] - m) * (frame[i + lag] - m)
    }
    const r = acc / energy
    if (r > bestR) {
      bestR = r
      bestLag = lag
    }
  }
  if (bestLag < 0 || bestR <= 0) return null
  return { f0: sampleRate / bestLag, r: Math.min(1, bestR) }
}

/** Build the shared per-frame grid (RMS, F0, voicing, peak amplitude). */
function buildGrid({ samples, sampleRate }: AcousticInput): FrameGrid {
  const frameSize = Math.max(64, Math.round((FRAME_MS / 1000) * sampleRate))
  const hop = Math.max(16, Math.round((HOP_MS / 1000) * sampleRate))
  const nFrames = Math.max(0, Math.floor((samples.length - frameSize) / hop) + 1)

  const rms = new Float32Array(nFrames)
  const f0 = new Float32Array(nFrames)
  const peakAbs = new Float32Array(nFrames)
  const voiced: boolean[] = new Array(nFrames).fill(false)

  for (let i = 0; i < nFrames; i++) {
    const start = i * hop
    const frame = samples.subarray(start, start + frameSize)

    let sumSq = 0
    let peak = 0
    for (let j = 0; j < frame.length; j++) {
      const v = frame[j]
      sumSq += v * v
      const a = Math.abs(v)
      if (a > peak) peak = a
    }
    rms[i] = Math.sqrt(sumSq / frame.length)
    peakAbs[i] = peak

    const est = frameF0(frame, sampleRate)
    if (est && est.r >= VOICING_THRESHOLD) {
      f0[i] = est.f0
      voiced[i] = true
    } else {
      f0[i] = NaN
    }
  }

  return { hop, frameSize, rms, f0, voiced, peakAbs, frameRateHz: 1000 / HOP_MS }
}

/** dBFS loudness from a linear RMS value (full-scale = 0 dB). */
function rmsToDb(r: number): number {
  return 20 * Math.log10(Math.max(r, 1e-6))
}

// ── shared signal-quality metadata ───────────────────────────────────

export interface SignalQuality {
  durationSeconds: number
  voicedFraction: number
  clipped: boolean
  tooShort: boolean
  peakRms: number
}

function assessQuality(input: AcousticInput, grid: FrameGrid): SignalQuality {
  const durationSeconds = input.samples.length / input.sampleRate
  const voicedCount = grid.voiced.filter(Boolean).length
  const voicedFraction = grid.voiced.length ? voicedCount / grid.voiced.length : 0

  let peakAbs = 0
  let peakRms = 0
  for (let i = 0; i < grid.rms.length; i++) if (grid.rms[i] > peakRms) peakRms = grid.rms[i]
  for (let i = 0; i < input.samples.length; i++) {
    const a = Math.abs(input.samples[i])
    if (a > peakAbs) peakAbs = a
  }

  return {
    durationSeconds,
    voicedFraction,
    clipped: peakAbs >= 0.999,
    tooShort: durationSeconds < 1.0 || voicedCount < 5,
    peakRms,
  }
}

// ── feature blocks ───────────────────────────────────────────────────

/** Sustained-vowel features: phonation stability, tremor, jitter/shimmer/HNR. */
export interface SustainedVowelFeatures {
  f0MeanHz: number | null
  f0SdHz: number | null
  maxPhonationSeconds: number | null
  jitterPercent: number | null   // APPROXIMATE
  shimmerPercent: number | null  // APPROXIMATE
  hnrDb: number | null           // APPROXIMATE
  tremorHz: number | null
  tremorStrength: number | null  // 0–1 modulation index (autocorr peak of F0 contour)
}

export function analyzeSustainedVowel(input: AcousticInput, grid: FrameGrid): SustainedVowelFeatures {
  const voicedIdx: number[] = []
  for (let i = 0; i < grid.voiced.length; i++) if (grid.voiced[i]) voicedIdx.push(i)

  const f0s = voicedIdx.map(i => grid.f0[i]).filter(v => Number.isFinite(v))
  const f0MeanHz = f0s.length ? mean(f0s) : null
  const f0SdHz = f0s.length >= 2 ? stddev(f0s) : null

  // Max phonation time = longest run of continuous voiced frames.
  let longest = 0
  let run = 0
  for (const v of grid.voiced) {
    run = v ? run + 1 : 0
    if (run > longest) longest = run
  }
  const maxPhonationSeconds = longest ? longest / grid.frameRateHz : null

  // Jitter (approx): mean abs period-to-period change / mean period, over voiced
  // frames. Frame-level, not cycle-level — coarser than Praat.
  let jitterPercent: number | null = null
  if (f0s.length >= 3) {
    const periods = f0s.map(f => 1 / f)
    let absDiff = 0
    for (let i = 1; i < periods.length; i++) absDiff += Math.abs(periods[i] - periods[i - 1])
    jitterPercent = (absDiff / (periods.length - 1) / mean(periods)) * 100
  }

  // Shimmer (approx): same idea on per-frame peak amplitude of voiced frames.
  let shimmerPercent: number | null = null
  const amps = voicedIdx.map(i => grid.peakAbs[i]).filter(a => a > 1e-6)
  if (amps.length >= 3) {
    let absDiff = 0
    for (let i = 1; i < amps.length; i++) absDiff += Math.abs(amps[i] - amps[i - 1])
    shimmerPercent = (absDiff / (amps.length - 1) / mean(amps)) * 100
  }

  // HNR (approx): from the mean autocorrelation strength r of voiced frames,
  // HNR ≈ 10·log10(r / (1 − r)). Re-derive r per voiced frame.
  let hnrDb: number | null = null
  if (voicedIdx.length) {
    const rs: number[] = []
    for (const i of voicedIdx) {
      const start = i * grid.hop
      const frame = input.samples.subarray(start, start + grid.frameSize)
      const est = frameF0(frame, input.sampleRate)
      if (est) rs.push(Math.min(0.999, Math.max(0.001, est.r)))
    }
    if (rs.length) {
      const r = median(rs)
      hnrDb = 10 * Math.log10(r / (1 - r))
    }
  }

  // Vocal tremor: look for a 4–8 Hz periodic modulation in the F0 contour by
  // autocorrelating the (mean-removed) voiced-frame F0 series.
  const { freq, strength } = detectModulation(
    voicedIdx.map(i => grid.f0[i]),
    grid.frameRateHz,
    3,
    9
  )

  return {
    f0MeanHz,
    f0SdHz,
    maxPhonationSeconds,
    jitterPercent,
    shimmerPercent,
    hnrDb,
    tremorHz: freq,
    tremorStrength: strength,
  }
}

/**
 * Find a dominant modulation frequency (Hz) within [loHz, hiHz] in a per-frame
 * series, via autocorrelation. Returns the frequency and a 0–1 strength
 * (normalized autocorrelation peak). Used for vocal tremor.
 */
function detectModulation(
  series: number[],
  frameRateHz: number,
  loHz: number,
  hiHz: number
): { freq: number | null; strength: number | null } {
  const clean = series.filter(v => Number.isFinite(v))
  if (clean.length < 8) return { freq: null, strength: null }

  const m = mean(clean)
  const x = clean.map(v => v - m)
  let energy = 0
  for (const v of x) energy += v * v
  if (energy <= 1e-9) return { freq: null, strength: null }

  const minLag = Math.max(1, Math.floor(frameRateHz / hiHz))
  const maxLag = Math.min(x.length - 1, Math.ceil(frameRateHz / loHz))
  let bestLag = -1
  let bestR = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0
    for (let i = 0; i < x.length - lag; i++) acc += x[i] * x[i + lag]
    const r = acc / energy
    if (r > bestR) {
      bestR = r
      bestLag = lag
    }
  }
  if (bestLag < 0 || bestR <= 0) return { freq: null, strength: null }
  return { freq: frameRateHz / bestLag, strength: Math.min(1, bestR) }
}

/** DDK (pa-ta-ka): articulatory rate & regularity from the RMS onset envelope. */
export interface DdkFeatures {
  syllableCount: number
  rateSyllPerSec: number | null
  regularityCv: number | null // coefficient of variation of inter-syllable intervals (lower = more regular)
}

export function analyzeDdk(grid: FrameGrid): DdkFeatures {
  // Onset envelope: positive first-difference of RMS (energy rising = new syllable).
  const n = grid.rms.length
  if (n < 4) return { syllableCount: 0, rateSyllPerSec: null, regularityCv: null }

  const flux = new Float32Array(n)
  let maxFlux = 0
  for (let i = 1; i < n; i++) {
    const d = grid.rms[i] - grid.rms[i - 1]
    flux[i] = d > 0 ? d : 0
    if (flux[i] > maxFlux) maxFlux = flux[i]
  }
  if (maxFlux <= 1e-9) return { syllableCount: 0, rateSyllPerSec: null, regularityCv: null }

  // Peak-pick onsets: local maxima above 25% of max flux, with a refractory
  // gap (~120 ms ≈ max ~8 syll/s) so one syllable isn't counted twice.
  const thresh = 0.25 * maxFlux
  const refractory = Math.round((120 / 1000) * grid.frameRateHz)
  const onsets: number[] = []
  let lastOnset = -Infinity
  for (let i = 1; i < n - 1; i++) {
    if (flux[i] >= thresh && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1] && i - lastOnset >= refractory) {
      onsets.push(i)
      lastOnset = i
    }
  }

  const syllableCount = onsets.length
  if (syllableCount < 2) return { syllableCount, rateSyllPerSec: null, regularityCv: null }

  const spanSec = (onsets[onsets.length - 1] - onsets[0]) / grid.frameRateHz
  const rateSyllPerSec = spanSec > 0 ? (syllableCount - 1) / spanSec : null

  const intervals: number[] = []
  for (let i = 1; i < onsets.length; i++) intervals.push((onsets[i] - onsets[i - 1]) / grid.frameRateHz)
  const intMean = mean(intervals)
  const regularityCv = intMean > 0 ? stddev(intervals) / intMean : null

  return { syllableCount, rateSyllPerSec, regularityCv }
}

/** Reading-passage features: loudness, decay (hypophonia), monopitch, pauses, rate. */
export interface ReadingFeatures {
  loudnessDb: number | null
  loudnessDecayDbPerSec: number | null // negative = fading (hypophonia)
  f0SdHz: number | null                // low = monopitch
  pauseCount: number
  pauseFraction: number | null         // fraction of time below silence threshold
  voicedFraction: number
}

export function analyzeReading(grid: FrameGrid, quality: SignalQuality): ReadingFeatures {
  const n = grid.rms.length
  const voicedRms: number[] = []
  for (let i = 0; i < n; i++) if (grid.rms[i] > 1e-5) voicedRms.push(grid.rms[i])
  const loudnessDb = voicedRms.length ? rmsToDb(median(voicedRms)) : null

  // Loudness decay: least-squares slope of frame loudness (dB) over time, on
  // above-silence frames. Negative slope = fading speech.
  const silenceFloor = SILENCE_REL_RMS * quality.peakRms
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < n; i++) {
    if (grid.rms[i] > silenceFloor) {
      xs.push(i / grid.frameRateHz)
      ys.push(rmsToDb(grid.rms[i]))
    }
  }
  let loudnessDecayDbPerSec: number | null = null
  if (xs.length >= 4) {
    const mx = mean(xs)
    const my = mean(ys)
    let num = 0
    let den = 0
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - mx) * (ys[i] - my)
      den += (xs[i] - mx) * (xs[i] - mx)
    }
    loudnessDecayDbPerSec = den > 0 ? num / den : null
  }

  const f0s: number[] = []
  for (let i = 0; i < n; i++) if (grid.voiced[i] && Number.isFinite(grid.f0[i])) f0s.push(grid.f0[i])
  const f0SdHz = f0s.length >= 2 ? stddev(f0s) : null

  // Pause detection: runs below the silence floor lasting ≥ 180 ms, excluding
  // leading/trailing silence.
  const minPauseFrames = Math.round((180 / 1000) * grid.frameRateHz)
  let pauseCount = 0
  let belowRun = 0
  let belowTotal = 0
  let firstActive = -1
  let lastActive = -1
  for (let i = 0; i < n; i++) {
    const active = grid.rms[i] > silenceFloor
    if (active) {
      if (firstActive < 0) firstActive = i
      lastActive = i
    }
  }
  for (let i = 0; i < n; i++) {
    const below = grid.rms[i] <= silenceFloor
    const interior = firstActive >= 0 && i > firstActive && i < lastActive
    if (below && interior) {
      belowRun++
      belowTotal++
    } else {
      if (belowRun >= minPauseFrames) pauseCount++
      belowRun = 0
    }
  }
  if (belowRun >= minPauseFrames) pauseCount++

  const activeSpan = firstActive >= 0 && lastActive > firstActive ? lastActive - firstActive : 0
  const pauseFraction = activeSpan > 0 ? belowTotal / activeSpan : null

  return {
    loudnessDb,
    loudnessDecayDbPerSec,
    f0SdHz,
    pauseCount,
    pauseFraction,
    voicedFraction: quality.voicedFraction,
  }
}

// ── public dispatch ──────────────────────────────────────────────────

export interface RawAnalysis {
  task: VoiceTask
  quality: SignalQuality
  sustainedVowel?: SustainedVowelFeatures
  ddk?: DdkFeatures
  reading?: ReadingFeatures
}

/**
 * Run the task-appropriate feature block. Pure measurement — flags/thresholds
 * are applied separately in ./flagging.ts.
 */
export function analyzeAcoustic(task: VoiceTask, input: AcousticInput): RawAnalysis {
  const grid = buildGrid(input)
  const quality = assessQuality(input, grid)

  switch (task) {
    case 'sustained_vowel':
      return { task, quality, sustainedVowel: analyzeSustainedVowel(input, grid) }
    case 'ddk':
      return { task, quality, ddk: analyzeDdk(grid) }
    case 'reading':
      return { task, quality, reading: analyzeReading(grid, quality) }
  }
}
