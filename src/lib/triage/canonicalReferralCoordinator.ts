import {
  buildBoundExtractionTriageRequest,
  type BoundExtractionTriageRequest,
} from './boundExtractionRequest'
import { TriageStartError } from './pollClient'
import {
  nextStepAfterExtraction,
  type PostExtractionDecision,
} from './referralFlowPolicy'
import type { ClinicalExtraction } from './types'

export function coordinateCompletedExtraction(
  extraction: ClinicalExtraction,
): {
  decision: PostExtractionDecision
  triageRequest: BoundExtractionTriageRequest
} {
  return {
    decision: nextStepAfterExtraction(extraction),
    triageRequest: buildBoundExtractionTriageRequest(extraction),
  }
}

export async function triageBoundExtraction<T>(
  extraction: ClinicalExtraction,
  transport: (request: BoundExtractionTriageRequest) => Promise<T>,
): Promise<T> {
  const { triageRequest } = coordinateCompletedExtraction(extraction)
  return transport(triageRequest)
}

export function retainedSafetyHoldFromError(
  error: unknown,
): {
  carePathway: 'emergency_now' | 'same_day_clinician_review'
  outpatientScoringBlocked: true
  humanReviewHold: true
} | null {
  if (!(error instanceof TriageStartError)) return null
  if (
    error.safetyPathway !== 'emergency_now' &&
    error.safetyPathway !== 'same_day_clinician_review'
  ) {
    return null
  }
  return {
    carePathway: error.safetyPathway,
    outpatientScoringBlocked: true,
    humanReviewHold: true,
  }
}
