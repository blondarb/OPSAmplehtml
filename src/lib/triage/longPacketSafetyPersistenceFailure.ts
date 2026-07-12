export const MODEL_SAFETY_EVIDENCE_PERSISTENCE_FAILED_REASON =
  'model_safety_evidence_persistence_failed_manual_hold'

export type ActionableLongPacketSafetyPathway =
  | 'emergency_now'
  | 'same_day_clinician_review'

const ERROR_MESSAGES: Record<ActionableLongPacketSafetyPathway, string> = {
  emergency_now:
    'MODEL_SAFETY_EVIDENCE_PERSISTENCE_FAILED:EMERGENCY_NOW: Immediate emergency action and human review are required.',
  same_day_clinician_review:
    'MODEL_SAFETY_EVIDENCE_PERSISTENCE_FAILED:SAME_DAY_CLINICIAN_REVIEW: Same-day clinician review is required.',
}

export function longPacketSafetyPersistenceFailureMessage(
  pathway: ActionableLongPacketSafetyPathway,
): string {
  return ERROR_MESSAGES[pathway]
}

export function parseLongPacketSafetyPersistenceFailure(
  value: unknown,
): ActionableLongPacketSafetyPathway | undefined {
  if (value === ERROR_MESSAGES.emergency_now) return 'emergency_now'
  if (value === ERROR_MESSAGES.same_day_clinician_review) {
    return 'same_day_clinician_review'
  }
  return undefined
}
