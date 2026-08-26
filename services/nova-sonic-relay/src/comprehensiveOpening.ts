export const COMPREHENSIVE_AGE_NUDGE =
  '[INTERNAL INTERVIEW STATE — do not speak this note aloud: the patient has answered why they were referred. Ask only how old they are next. Do not repeat the referral question. If the patient stated an active emergency or asked to stop, follow the safety or stopping protocol instead.]'

const ACTIVE_SAFETY_OR_STOP =
  /\b(want to die|hurt myself|hurt someone|worst headache of my life|can(?:not|'t) move (?:my )?(?:arm|leg)|having a seizure|can(?:not|'t) breathe|stop (?:the )?interview|i(?:'m| am) done|that(?:'s| is) all)\b/i

export type ComprehensiveOpeningAction = 'ignore' | 'ask_age' | 'suppress'

/**
 * The live Nova model has been observed repeating the referral opener even
 * after a clear answer. The relay sees finalized patient ASR before Nova's
 * next turn, so Comprehensive mode uses one internal state transition to
 * make referral -> age deterministic. Safety/stop language always wins.
 */
export function comprehensiveOpeningAction(
  interviewMode: 'standard' | 'comprehensive',
  alreadySettled: boolean,
  userText: string,
): ComprehensiveOpeningAction {
  if (interviewMode !== 'comprehensive' || alreadySettled || !userText.trim()) return 'ignore'
  return ACTIVE_SAFETY_OR_STOP.test(userText) ? 'suppress' : 'ask_age'
}
