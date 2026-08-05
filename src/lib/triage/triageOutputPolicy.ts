import { TIER_DISPLAY, type TriageResult } from './types'

export interface TriageOutputPolicy {
  showPreVisitWorkup: boolean
  showOutpatientRouting: boolean
  showMissingInformation: boolean
  timeframe: string
  safetyConflict: boolean
  dataConflict: boolean
  insufficientDataHold: boolean
  requiresHumanReviewHold: boolean
  schedulingLocked: boolean
}

export const DATA_CONFLICT_INFORMATION =
  'Conflicting clinical information requires clinician reconciliation.'
export const INSUFFICIENT_DATA_INFORMATION =
  'Referral information is insufficient for a safe outpatient disposition.'

/**
 * Used INSTEAD of INSUFFICIENT_DATA_INFORMATION when the hold came from our own
 * independent safety check failing rather than from a thin referral, and the
 * scoring model named no concrete missing items.
 *
 * The distinction is not cosmetic. The copied report is pasted into charts and
 * sent back to referring providers; telling a PCP their referral was inadequate
 * when our model call simply failed is both false and a reason for them to stop
 * referring. Production incident 2026-08-05: a transient safety-extractor
 * failure on a complete MS workup (UMN signs, RAPD, Babinski, posterior column
 * findings) produced exactly that message.
 */
export const INTERNAL_SAFETY_FAILURE_INFORMATION =
  'The independent safety check did not complete. This is a system issue, not a gap in the referral — no additional information has been identified as missing.'

export function triageOutputPolicy(
  result: Pick<
    TriageResult,
    | 'care_pathway'
    | 'triage_tier'
    | 'emergent_override'
    | 'insufficient_data'
    | 'review_requirement'
    | 'missing_information'
    | 'data_quality'
    | 'scheduling_locked'
  >,
): TriageOutputPolicy {
  const pathwayEmergency = result.care_pathway === 'emergency_now'
  const tierEmergency = result.triage_tier === 'emergent'
  const overrideEmergency = result.emergent_override
  const reviewEmergency = result.review_requirement === 'emergency_action'
  const anyEmergencyMarker =
    pathwayEmergency ||
    tierEmergency ||
    overrideEmergency ||
    reviewEmergency
  const safetyConflict =
    (pathwayEmergency && !tierEmergency) ||
    (!pathwayEmergency &&
      (tierEmergency || overrideEmergency || reviewEmergency))
  const dataConflict = result.data_quality === 'conflicting'
  const insufficientDataHold =
    result.data_quality === 'insufficient' ||
    result.insufficient_data ||
    result.care_pathway === 'undetermined' ||
    result.triage_tier === 'insufficient_data'
  const requiresHumanReviewHold =
    anyEmergencyMarker ||
    safetyConflict ||
    dataConflict ||
    insufficientDataHold
  const timeframe = anyEmergencyMarker
    ? 'Emergency evaluation now'
    : result.care_pathway === 'same_day_clinician_review'
      ? 'Same-day clinician review'
      : TIER_DISPLAY[result.triage_tier].timeframe

  return {
    showPreVisitWorkup:
      !anyEmergencyMarker && !dataConflict && !insufficientDataHold,
    showOutpatientRouting:
      !anyEmergencyMarker && !dataConflict && !insufficientDataHold,
    showMissingInformation:
      Boolean(result.missing_information?.length) ||
      dataConflict ||
      insufficientDataHold,
    timeframe,
    safetyConflict,
    dataConflict,
    insufficientDataHold,
    requiresHumanReviewHold,
    schedulingLocked:
      requiresHumanReviewHold || result.scheduling_locked !== false,
  }
}
