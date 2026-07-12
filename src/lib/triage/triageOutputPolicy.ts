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
