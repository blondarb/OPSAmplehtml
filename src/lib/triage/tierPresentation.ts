import type { DimensionScores, TriageTier } from './types'

/**
 * Presentation-only mapping for the Neuro Navigator design system (nn.css).
 * Tier ORDER, names, and timeframes mirror the fixed rubric — this file must
 * never introduce scoring or threshold behavior. TIER_DISPLAY in types.ts
 * remains the source for the legacy/dark surfaces (validate pages, batch
 * panels); this map drives the light clinical UI on /triage.
 *
 * Tier colors are lightness-ordered CSS variables (see neuro-navigator.css)
 * so tiers separate in grayscale and for color-vision deficiency. Color is
 * never the only carrier: every rendering pairs it with number + name +
 * timeframe text.
 */
export interface TierPresentation {
  /** 1-based position, "Tier N of 7" */
  num: number
  /** Title-case display name */
  name: string
  /** CSS custom property carrying the tier ink color */
  colorVar: string
  /** CSS custom property carrying the tier wash background */
  bgVar: string
}

export const TIER_COUNT = 7

export const TIER_PRESENTATION: Record<TriageTier, TierPresentation> = {
  emergent: { num: 1, name: 'Emergent', colorVar: 'var(--nn-t1)', bgVar: 'var(--nn-t1-bg)' },
  urgent: { num: 2, name: 'Urgent', colorVar: 'var(--nn-t2)', bgVar: 'var(--nn-t2-bg)' },
  semi_urgent: { num: 3, name: 'Semi-urgent', colorVar: 'var(--nn-t3)', bgVar: 'var(--nn-t3-bg)' },
  routine_priority: { num: 4, name: 'Routine-priority', colorVar: 'var(--nn-t4)', bgVar: 'var(--nn-t4-bg)' },
  routine: { num: 5, name: 'Routine', colorVar: 'var(--nn-t5)', bgVar: 'var(--nn-t5-bg)' },
  non_urgent: { num: 6, name: 'Non-urgent', colorVar: 'var(--nn-t6)', bgVar: 'var(--nn-t6-bg)' },
  insufficient_data: { num: 7, name: 'Insufficient information', colorVar: 'var(--nn-t7)', bgVar: 'var(--nn-t7-bg)' },
}

/**
 * The published rubric weights, for display beside each dimension score.
 * Values restate the fixed formula (30/25/20/15/10) that lives in the
 * scoring engine — display only, never an input to scoring.
 */
export const DIMENSION_PRESENTATION: ReadonlyArray<{
  key: keyof DimensionScores
  label: string
  weight: string
}> = [
  { key: 'symptom_acuity', label: 'Symptom Acuity', weight: '30%' },
  { key: 'diagnostic_concern', label: 'Diagnostic Concern', weight: '25%' },
  { key: 'rate_of_progression', label: 'Rate of Progression', weight: '20%' },
  { key: 'functional_impairment', label: 'Functional Impairment', weight: '15%' },
  { key: 'red_flag_presence', label: 'Red Flag Presence', weight: '10%' },
]
