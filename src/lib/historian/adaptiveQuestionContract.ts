import { patientEvidenceQuestionContractIssues } from './patientEvidenceController'

export const ADAPTIVE_QUESTION_MAX_CHARS = 280
export const ADAPTIVE_QUESTION_MAX_ACK_CHARS = 90

export const ADAPTIVE_OPENING_QUESTION =
  "Hi, I'm Henry, and I'll help gather your history before your neurology visit. What brought you to be referred for this visit?"
export const ADAPTIVE_AGE_QUESTION = 'How old are you?'

export type AdaptiveQuestionIssue =
  | 'invalid_type'
  | 'too_long'
  | 'multiline'
  | 'question_shape'
  | 'unsolicited_example'
  | 'multiple_questions'
  | 'too_many_sentences'
  | 'acknowledgement_too_long'
  | 'formulaic_filler'
  | 'generic_symptom_reference'
  | 'diagnostic_assertion'
  | 'medical_advice'
  | 'clinical_redirect'

const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+/
const FORMULAIC_FILLER_RE = /\b(?:thanks? for (?:sharing|that)|thank you for (?:sharing|that)|i appreciate (?:you )?sharing|that(?:'s| is) helpful)\b/i
const GENERIC_SYMPTOM_RE = /\b(?:that|the|this) symptom\b/i
const DIAGNOSTIC_ASSERTION_RE = /\b(?:it sounds like|this sounds like|you (?:may|might|probably) have|this (?:may|might|could) be|your diagnosis is|i think (?:this|you) (?:is|have))\b/i
const MEDICAL_ADVICE_RE = /\b(?:you should|you need to|i recommend|my recommendation|start taking|stop taking|increase (?:the|your)|decrease (?:the|your))\b/i
const RESPONSE_REQUEST_SENTENCE_RE = /^\s*(?:(?:please\s+)?(?:tell|describe|explain|share|list|rate)\b|(?:can|could|would|will)\s+you\b|(?:what|when|where|who|why|how|which|do|does|did|is|are|was|were|have|has)\b)/i

/**
 * Deterministic speech-shape gate for a model-proposed adaptive question.
 * It deliberately does not decide the clinical content or order.  Claude's
 * conductor guidance and the independent reviewer own that reasoning; this
 * boundary only prevents the concrete UAT failures that must never be spoken.
 */
export function adaptiveQuestionIssues(value: unknown): AdaptiveQuestionIssue[] {
  if (typeof value !== 'string') return ['invalid_type']
  const text = value.trim()
  const issues: AdaptiveQuestionIssue[] = []
  if (!text || text.length > ADAPTIVE_QUESTION_MAX_CHARS) issues.push('too_long')
  if (/\r|\n/.test(text)) issues.push('multiline')

  const sharedIssues = patientEvidenceQuestionContractIssues(text)
  if (sharedIssues.some((issue) => issue.includes('exactly one terminal'))) issues.push('question_shape')
  if (sharedIssues.some((issue) => issue.includes('unsolicited example'))) issues.push('unsolicited_example')
  if (sharedIssues.some((issue) => issue.includes('second response obligation'))) issues.push('multiple_questions')

  const sentences = text.split(SENTENCE_SPLIT_RE).filter(Boolean)
  if (sentences.length > 2) issues.push('too_many_sentences')
  if (sentences.length === 2 && sentences[0].length > ADAPTIVE_QUESTION_MAX_ACK_CHARS) {
    issues.push('acknowledgement_too_long')
  }
  if (sentences.length === 2 && RESPONSE_REQUEST_SENTENCE_RE.test(sentences[0])) {
    issues.push('multiple_questions')
  }
  if (FORMULAIC_FILLER_RE.test(text)) issues.push('formulaic_filler')
  if (GENERIC_SYMPTOM_RE.test(text)) issues.push('generic_symptom_reference')
  if (DIAGNOSTIC_ASSERTION_RE.test(text)) issues.push('diagnostic_assertion')
  if (MEDICAL_ADVICE_RE.test(text)) issues.push('medical_advice')
  return [...new Set(issues)]
}

export function approvedAdaptiveQuestion(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return adaptiveQuestionIssues(text).length === 0 ? text : null
}

/**
 * The first two adaptive turns have application-owned clinical intents, but
 * Nova may phrase them naturally.  Keep those intents deterministic without
 * replacing a valid proposal after tool use (Nova Sonic may continue with its
 * original proposal even when a tool result contains different wording).
 */
export function approvedAdaptiveOpeningQuestion(value: unknown): string | null {
  const text = approvedAdaptiveQuestion(value)
  if (!text) return null
  const asksWhyHere =
    /\bwhy\b/i.test(text) ||
    /\bwhat\s+(?:brought|brings|bring|led)\b/i.test(text) ||
    /\b(?:reason|purpose)\b/i.test(text)
  const identifiesVisit = /\b(?:refer(?:red|ral)?|neurolog(?:y|ist)|appointment|visit)\b/i.test(text)
  const asksWhatBroughtPatientHere =
    /\bwhat\s+(?:brought|brings|bring|led)\s+you\b.*\b(?:in|here)\b/i.test(text)
  return asksWhyHere && (identifiesVisit || asksWhatBroughtPatientHere) ? text : null
}

export function approvedAdaptiveAgeQuestion(value: unknown): string | null {
  const text = approvedAdaptiveQuestion(value)
  if (!text) return null
  return /\bhow old are you\b/i.test(text) || /\bwhat(?:'s| is) your age\b/i.test(text)
    ? text
    : null
}

export function canonicalAdaptiveQuestion(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}
