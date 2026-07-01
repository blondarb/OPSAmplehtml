/**
 * Threshold & flagging layer for acoustic speech biomarkers.
 *
 * Phase A scaffold (2026-06-30). Turns raw measurements (./acoustic.ts) into a
 * GREEN/YELLOW/RED panel using the same flag vocabulary as SDNE.
 *
 * THRESHOLDS ARE PROVISIONAL. They start from published MDS-UPDRS / Frenchay /
 * voice-pathology ranges and MUST be tuned against the labeled-profile bench in
 * test week (James Morrison=PD, Eleanor Wright=ET, Maria Santos=normal). They
 * live here as named, commented config — not magic numbers scattered in code.
 *
 * See docs/plans/2026-06-30-acoustic-speech-biomarkers-spec.md.
 */

import type { SDNEFlag } from '@/lib/sdneTypes'
import type { RawAnalysis } from './acoustic'
import { ENGINE_ID } from './acoustic'
import type { BiomarkerFeature, BiomarkerPanel, VoiceTask } from './types'

/**
 * A one-sided band: `yellow` is the borderline boundary, `red` the abnormal one.
 * `direction` says which way is concerning. Values between normal and yellow →
 * GREEN; past yellow → YELLOW; past red → RED.
 */
interface Band {
  yellow: number
  red: number
  direction: 'high' | 'low'
}

function flagOneSided(value: number, band: Band): SDNEFlag {
  if (band.direction === 'high') {
    if (value >= band.red) return 'RED'
    if (value >= band.yellow) return 'YELLOW'
    return 'GREEN'
  } else {
    if (value <= band.red) return 'RED'
    if (value <= band.yellow) return 'YELLOW'
    return 'GREEN'
  }
}

/**
 * Provisional thresholds. Citations are directional starting points, not
 * validated cutoffs — tune on the bench.
 */
export const THRESHOLDS = {
  sustained_vowel: {
    // Monopitch: low F0 SD in a sustained vowel is normal; this band is a
    // sanity check on phonation stability, not the primary monopitch read
    // (that's the reading task). Very high SD = unstable phonation.
    f0SdHz: { yellow: 35, red: 60, direction: 'high' as const },
    // Max phonation time: healthy adults sustain ≥ ~10–15 s; < 8 s borderline,
    // < 5 s abnormal (respiratory/phonatory weakness).
    maxPhonationSeconds: { yellow: 8, red: 5, direction: 'low' as const },
    // Jitter % (APPROX): normal < ~1%, mild 1–2%, abnormal > 2%.
    jitterPercent: { yellow: 1.5, red: 3.0, direction: 'high' as const },
    // Shimmer % (APPROX): normal < ~3.8%, borderline to ~6%, abnormal beyond.
    shimmerPercent: { yellow: 6, red: 10, direction: 'high' as const },
    // HNR dB (APPROX): healthy > ~20 dB; lower = breathier/hoarser.
    hnrDb: { yellow: 15, red: 8, direction: 'low' as const },
  },
  ddk: {
    // DDK rate (syll/s): healthy ~5.5–7.5; slowed < ~5 borderline, < ~4 abnormal.
    rateSyllPerSec: { yellow: 5.0, red: 4.0, direction: 'low' as const },
    // Regularity CV: lower is steadier; > ~0.25 irregular (ataxic), > ~0.4 marked.
    regularityCv: { yellow: 0.25, red: 0.4, direction: 'high' as const },
  },
  reading: {
    // Loudness decay (dB/s): flat is normal; steep negative = fading (hypophonia).
    loudnessDecayDbPerSec: { yellow: -2, red: -4, direction: 'low' as const },
    // Monopitch: reading F0 SD — healthy speech ~20–40 Hz; < ~15 Hz borderline,
    // < ~10 Hz markedly monotone.
    f0SdHz: { yellow: 15, red: 10, direction: 'low' as const },
  },
} as const

// Vocal-tremor flag is handled specially (needs both a frequency in the 4–8 Hz
// band AND enough modulation strength), so it isn't a simple one-sided band.
const TREMOR_STRENGTH_YELLOW = 0.25
const TREMOR_STRENGTH_RED = 0.45
const TREMOR_BAND_HZ = { lo: 4, hi: 8 }

function feat(
  key: string,
  label: string,
  value: number | null,
  unit: string,
  direction: BiomarkerFeature['direction'],
  band: Band | null,
  opts?: { note?: string; approximate?: boolean }
): BiomarkerFeature {
  let flag: SDNEFlag = 'NOT_PERFORMED'
  if (value === null || !Number.isFinite(value)) {
    flag = 'INVALID'
  } else if (band) {
    flag = flagOneSided(value, band)
  } else {
    flag = 'GREEN'
  }
  return { key, label, value, unit, flag, direction, note: opts?.note, approximate: opts?.approximate }
}

const FLAG_SEVERITY: Record<SDNEFlag, number> = {
  GREEN: 0,
  NOT_PERFORMED: 0,
  INVALID: 1,
  YELLOW: 2,
  RED: 3,
}

function rollUp(features: BiomarkerFeature[]): SDNEFlag {
  // Worst real finding wins; INVALID ranks below YELLOW so a couple of
  // un-estimable features don't masquerade as an abnormal exam.
  let worst: SDNEFlag = 'GREEN'
  for (const f of features) {
    if (FLAG_SEVERITY[f.flag] > FLAG_SEVERITY[worst]) worst = f.flag
  }
  return worst
}

/** Build the clinician-facing panel from raw measurements + thresholds. */
export function buildPanel(raw: RawAnalysis): BiomarkerPanel {
  const features: BiomarkerFeature[] = []
  const t = THRESHOLDS

  if (raw.task === 'sustained_vowel' && raw.sustainedVowel) {
    const s = raw.sustainedVowel
    features.push(
      feat('f0Mean', 'Pitch (mean F0)', round(s.f0MeanHz, 1), 'Hz', 'none', null, {
        note: 'Average fundamental frequency.',
      }),
      feat('maxPhonation', 'Max phonation time', round(s.maxPhonationSeconds, 1), 's', 'low', t.sustained_vowel.maxPhonationSeconds, {
        note: 'How long voicing was sustained — low suggests phonatory/respiratory weakness.',
      }),
      feat('tremor', 'Vocal tremor', round(s.tremorHz, 2), 'Hz', 'either', null, {
        note: tremorNote(s.tremorHz, s.tremorStrength),
      }),
      feat('jitter', 'Jitter', round(s.jitterPercent, 2), '%', 'high', t.sustained_vowel.jitterPercent, {
        note: 'Cycle-to-cycle pitch perturbation (hoarseness).',
        approximate: true,
      }),
      feat('shimmer', 'Shimmer', round(s.shimmerPercent, 2), '%', 'high', t.sustained_vowel.shimmerPercent, {
        note: 'Cycle-to-cycle loudness perturbation.',
        approximate: true,
      }),
      feat('hnr', 'Harmonic-to-noise ratio', round(s.hnrDb, 1), 'dB', 'low', t.sustained_vowel.hnrDb, {
        note: 'Lower = breathier/noisier voice.',
        approximate: true,
      }),
    )
    // Override the tremor feature's flag with the special 2-condition rule.
    const tremorFeat = features.find(f => f.key === 'tremor')
    if (tremorFeat) tremorFeat.flag = tremorFlag(s.tremorHz, s.tremorStrength)
  }

  if (raw.task === 'ddk' && raw.ddk) {
    const d = raw.ddk
    features.push(
      feat('ddkRate', 'DDK rate', round(d.rateSyllPerSec, 2), 'syll/s', 'low', t.ddk.rateSyllPerSec, {
        note: 'Pa-ta-ka repetitions per second — slowed in parkinsonian/cerebellar dysarthria.',
      }),
      feat('ddkRegularity', 'DDK regularity (CV)', round(d.regularityCv, 3), '', 'high', t.ddk.regularityCv, {
        note: 'Variability of inter-syllable timing — high = irregular (ataxic).',
      }),
      feat('ddkCount', 'Syllables detected', d.syllableCount, '', 'none', null, {
        note: 'Total onsets detected in the recording.',
      }),
    )
  }

  if (raw.task === 'reading' && raw.reading) {
    const r = raw.reading
    features.push(
      feat('monopitch', 'Pitch variability (F0 SD)', round(r.f0SdHz, 1), 'Hz', 'low', t.reading.f0SdHz, {
        note: 'Low = monopitch / reduced prosody (hypokinetic dysarthria).',
      }),
      feat('loudnessDecay', 'Loudness decay', round(r.loudnessDecayDbPerSec, 2), 'dB/s', 'low', t.reading.loudnessDecayDbPerSec, {
        note: 'Steep negative = fading volume (hypophonia).',
      }),
      feat('loudness', 'Loudness (median)', round(r.loudnessDb, 1), 'dBFS', 'none', null, {
        note: 'Relative loudness — interpret with the device/QC note.',
      }),
      feat('pauses', 'Pause count', r.pauseCount, '', 'none', null, {
        note: 'Silent gaps ≥ 180 ms — frequent pauses can reflect word-finding or apraxia.',
      }),
    )
  }

  const overallFlag = raw.quality.tooShort ? 'INVALID' : rollUp(features)

  return {
    task: raw.task,
    overallFlag,
    features,
    meta: {
      engine: ENGINE_ID,
      durationSeconds: round(raw.quality.durationSeconds, 2) ?? 0,
      sampleRate: 0, // filled by the route (it owns the input sample rate)
      voicedFraction: round(raw.quality.voicedFraction, 3) ?? 0,
      clipped: raw.quality.clipped,
      tooShort: raw.quality.tooShort,
    },
  }
}

function tremorFlag(hz: number | null, strength: number | null): SDNEFlag {
  if (hz === null || strength === null) return 'INVALID'
  const inBand = hz >= TREMOR_BAND_HZ.lo && hz <= TREMOR_BAND_HZ.hi
  if (!inBand) return 'GREEN'
  if (strength >= TREMOR_STRENGTH_RED) return 'RED'
  if (strength >= TREMOR_STRENGTH_YELLOW) return 'YELLOW'
  return 'GREEN'
}

function tremorNote(hz: number | null, strength: number | null): string {
  if (hz === null || strength === null) return 'No stable pitch contour to assess tremor.'
  const inBand = hz >= TREMOR_BAND_HZ.lo && hz <= TREMOR_BAND_HZ.hi
  if (!inBand) return `Dominant F0 modulation at ${hz.toFixed(1)} Hz (outside the 4–8 Hz tremor band).`
  return `4–8 Hz pitch modulation detected (strength ${(strength ?? 0).toFixed(2)}) — possible vocal tremor.`
}

function round(v: number | null | undefined, digits: number): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null
  const p = Math.pow(10, digits)
  return Math.round(v * p) / p
}

/**
 * Master switch. Default OFF until the bake-off validates thresholds — set
 * VOICE_BIOMARKERS_ENABLED to "true"/"1"/"on" to enable the route.
 */
export function isVoiceBiomarkersEnabled(): boolean {
  const flag = process.env.VOICE_BIOMARKERS_ENABLED?.trim().toLowerCase()
  return flag === 'true' || flag === '1' || flag === 'on'
}

export type { VoiceTask }
