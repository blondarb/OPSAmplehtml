import { TIER_DISPLAY, type CarePathway, type ReviewRequirement, type TriageTier } from './types'

export const EMERGENCY_TIMEFRAME = 'Emergency evaluation now'
export const IMMEDIATE_REVIEW_TIMEFRAME = 'Clinician review now — do not defer until later today'

/** Presentation of an authoritative disposition; never changes its clinical tier. */
export function dispositionPresentation(input: {
  tier: TriageTier
  carePathway?: CarePathway | string | null
  reviewRequirement?: ReviewRequirement | string | null
  emergentOverride?: boolean
  redFlagOverride?: boolean
}): { display: string; timeframe: string; immediateAction: boolean } {
  if (input.tier === 'emergent' || input.carePathway === 'emergency_now' ||
      input.reviewRequirement === 'emergency_action' || input.emergentOverride) {
    return { display: `EMERGENT — ${EMERGENCY_TIMEFRAME}`, timeframe: EMERGENCY_TIMEFRAME, immediateAction: true }
  }
  if (input.reviewRequirement === 'immediate_clinician_review' || input.carePathway === 'same_day_clinician_review') {
    return { display: `IMMEDIATE CLINICIAN REVIEW — ${IMMEDIATE_REVIEW_TIMEFRAME}`, timeframe: IMMEDIATE_REVIEW_TIMEFRAME, immediateAction: true }
  }
  if (input.carePathway === 'undetermined') {
    return { display: 'CLINICIAN REVIEW REQUIRED — disposition undetermined', timeframe: 'Clinician review required before outpatient disposition', immediateAction: false }
  }
  const config = TIER_DISPLAY[input.tier]
  return {
    display: `${config.label} — ${config.timeframe}${input.redFlagOverride ? ' (Red Flag Override)' : ''}`,
    timeframe: config.timeframe,
    immediateAction: false,
  }
}
