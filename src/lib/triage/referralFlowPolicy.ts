import type { ClinicalExtraction } from './types'

export type PostExtractionStep = 'review' | 'triage' | 'human_review'

export interface PostExtractionDecision {
  nextStep: PostExtractionStep
  immediateCarePathway:
    | 'emergency_now'
    | 'same_day_clinician_review'
    | null
  humanReviewHold: boolean
  approvalBlockedReason: string | null
}

export function nextStepAfterExtraction(
  extraction: Pick<ClinicalExtraction, 'coverage_status' | 'packet_safety'>,
): PostExtractionDecision {
  const immediateCarePathway =
    extraction.packet_safety?.care_pathway === 'emergency_now' ||
    extraction.packet_safety?.care_pathway === 'same_day_clinician_review'
      ? extraction.packet_safety.care_pathway
      : null
  const coverageReady =
    extraction.coverage_status === 'complete' ||
    extraction.coverage_status === 'not_applicable'
  const immediateSafetyHold =
    extraction.packet_safety?.clinician_hold === true ||
    immediateCarePathway !== null

  return {
    nextStep: immediateCarePathway
      ? 'triage'
      : coverageReady
        ? 'review'
        : 'human_review',
    immediateCarePathway,
    humanReviewHold: !coverageReady || immediateSafetyHold,
    approvalBlockedReason: !coverageReady
      ? 'Complete source coverage has not been verified. Immediate safety action still applies when shown, but outpatient approval and scheduling remain blocked.'
      : immediateSafetyHold
        ? 'Immediate safety action is active. Outpatient approval and scheduling remain blocked until the governed safety workflow is resolved.'
        : null,
  }
}
