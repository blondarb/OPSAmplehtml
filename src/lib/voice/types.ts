/**
 * Acoustic speech-biomarker types — shared across the analysis engine,
 * the /api/ai/voice-biomarkers route, and the UI card.
 *
 * Phase A scaffold (2026-06-30). See
 * docs/plans/2026-06-30-acoustic-speech-biomarkers-spec.md.
 *
 * IMPORTANT: this is a SCREENING signal, not a diagnosis. Every value here is a
 * measured acoustic feature that flags for clinician review — nothing more.
 */

import type { SDNEFlag } from '@/lib/sdneTypes'

/** The guided voice task a recording captures. */
export type VoiceTask =
  | 'sustained_vowel' // sustained /a/ ("ahhh") — phonation stability, tremor, jitter/shimmer/HNR
  | 'ddk'             // "pa-ta-ka" diadochokinesis — articulatory rate & regularity
  | 'reading'         // read a sentence aloud — loudness, monopitch, rate, pauses

export const VOICE_TASK_LABELS: Record<VoiceTask, string> = {
  sustained_vowel: 'Sustained Vowel (/a/)',
  ddk: 'Pa-Ta-Ka (DDK)',
  reading: 'Reading Passage',
}

/** The prompt + target duration shown to the patient for each task. */
export const VOICE_TASK_PROMPTS: Record<VoiceTask, { instruction: string; sampleText?: string; targetSeconds: number }> = {
  sustained_vowel: {
    instruction: 'Take a breath and say "ahhh" steadily for as long as you can.',
    targetSeconds: 6,
  },
  ddk: {
    instruction: 'Repeat "pa-ta-ka" as fast and as evenly as you can until the timer ends.',
    sampleText: 'pa-ta-ka pa-ta-ka pa-ta-ka …',
    targetSeconds: 8,
  },
  reading: {
    instruction: 'Read this sentence aloud at a comfortable, normal volume.',
    sampleText:
      'The rainbow is a division of white light into many beautiful colors. ' +
      'These take the shape of a long round arch, with its path high above.',
    targetSeconds: 20,
  },
}

/**
 * One measured feature within a panel. `value` is the raw number (or null when
 * the signal couldn't support an estimate — e.g. no voiced frames); `flag` is
 * the screening interpretation; `direction` records which way is abnormal.
 */
export interface BiomarkerFeature {
  key: string
  label: string
  value: number | null
  unit: string
  flag: SDNEFlag
  /** Which direction of `value` is clinically concerning. */
  direction: 'high' | 'low' | 'either' | 'none'
  /** Short clinician-facing note (what it screens for, or why it's null). */
  note?: string
  /**
   * True when this feature is an approximation that a Praat-grade engine would
   * compute more reliably (jitter/shimmer/HNR). Surfaced so the bake-off and
   * clinicians know not to over-trust the pure-TS value.
   */
  approximate?: boolean
}

/** The full result for one recorded task. */
export interface BiomarkerPanel {
  task: VoiceTask
  /** Worst feature flag, rolled up. */
  overallFlag: SDNEFlag
  features: BiomarkerFeature[]
  /** Capture/QC metadata so a clinician can judge signal quality. */
  meta: {
    engine: string
    durationSeconds: number
    sampleRate: number
    voicedFraction: number // 0–1 — fraction of frames with detectable pitch
    clipped: boolean       // input hit full-scale (recording too hot)
    tooShort: boolean      // not enough signal for a reliable estimate
  }
}
