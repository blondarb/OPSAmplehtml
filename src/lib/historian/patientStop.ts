/**
 * Narrow backstop for unambiguous spoken requests to end the interview.
 * Ambiguous phrases are whole-utterance matches so answers such as "that's
 * all the medications I take" cannot terminate the session.
 */
const WHOLE_UTTERANCE_STOP_PATTERNS = [
  /^(?:no )?(?:i think )?that(?:'s| is) all(?: for (?:today|now))?(?: thanks| thank you)?$/,
  /^(?:i think )?(?:we(?:'re| are)|i(?:'m| am)) done(?: for (?:today|now)| with (?:the|this) interview)?(?: thanks| thank you)?$/,
  /^are we finished(?: for (?:today|now)| with (?:the|this) interview)?$/,
  /^i (?:want|would like) to stop(?: now| for today| (?:the|this) interview)?$/,
  /^please stop(?: now| asking (?:me )?questions| (?:the|this) interview)?$/,
  /^i (?:do not|don't) want to continue(?: with )?(?:the|this) interview$/,
] as const

const EXPLICIT_INTERVIEW_STOP_PATTERNS = [
  /(?:^|\s)(?:please )?stop (?:the|this) interview(?:\s|$)/,
  /(?:^|\s)(?:please )?end (?:the|this) interview(?:\s|$)/,
  /(?:^|\s)i (?:do not|don't) want to continue (?:with )?(?:the|this) interview(?:\s|$)/,
] as const

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function hasExplicitPatientStopRequest(text: string): boolean {
  const normalized = normalize(text)
  return WHOLE_UTTERANCE_STOP_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    EXPLICIT_INTERVIEW_STOP_PATTERNS.some((pattern) => pattern.test(normalized))
}
