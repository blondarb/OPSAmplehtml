/**
 * Neuro FAQ Voice — deterministic safety guardrails (Gate 0 + Gate 1).
 *
 * POC SKELETON — review before any non-internal use.
 *
 * These run on the RAW transcript BEFORE any model call. They are the
 * non-bypassable floor of the layered safety design. The LLM classifier
 * (Gate 2) and corpus grounding (Gate 3) run AFTER and can only narrow
 * scope further — never expand it.
 *
 * Full design: ~/ClaudeSync/projects/OPSample/neuro-faq-voice/safety_architecture.md §2–3
 *
 * Tuning principle: HIGH RECALL for red flags. Over-triggering ("call 911 to be
 * safe") is the safe failure direction; under-triggering is not.
 */

export type GuardrailVerdict =
  | { kind: 'red_flag'; reason: string; selfHarm: boolean }
  | { kind: 'out_of_scope'; reason: string }
  | { kind: 'pass' }

// ── Gate 0: red-flag lexicon (emergency — overrides everything) ──────────────
// Seeded from src/hooks/useRealtimeSession.ts SAFETY_KEYWORDS + BE-FAST stroke
// language + active-seizure language. Word-boundary matched, case-insensitive.

const SELF_HARM_PATTERNS = [
  /kill myself/, /want to die/, /hurt myself/, /end my life/,
  /\bsuicid/, /self-?harm/, /don'?t want to (live|be here)/,
  /hurt someone/, /kill someone/,
]

const STROKE_PATTERNS = [
  /face (is )?(drooping|droop|numb)/, /one side (of my|is)/,
  /slurred speech/, /can'?t (speak|talk|understand|see)/,
  /sudden (numbness|weakness|vision|dizziness)/,
  /weak(ness)? in my (arm|leg|face)/, /can'?t (lift|move) my (arm|leg)/,
  /lost (my )?(vision|balance)/, /worst headache of my life/,
  /thunderclap/, /sudden severe headache/, /am i having a stroke/,
]

const SEIZURE_PATTERNS = [
  /having a seizure/, /won'?t stop shaking/, /seizure won'?t stop/,
  /\bseizing\b/, /convulsing/, /seizure (lasting|longer than|for more than)/,
  /back to back seizures/, /won'?t wake up/,
]

const ACUTE_PATTERNS = [
  /can'?t breathe/, /chest pain/, /passing out/, /unconscious/,
  /unresponsive/, /getting worse (fast|quickly)/,
]

// ── Gate 1: out-of-scope pre-filter (clinical judgment — refuse + route) ─────
// Narrow + high-precision on purpose. Ambiguous cases fall through to the
// LLM classifier (Gate 2). Do NOT broaden these to catch nuance.

const OUT_OF_SCOPE_PATTERNS = [
  /change my (dose|dosage|medication)/, /(increase|decrease|double) my (dose|medication)/,
  /skip my (pill|dose|medication)/, /stop taking my/,
  /should i (go to|stop|start|take|change)/,
  /is my .* getting worse/, /do i (still )?need (my|the)/,
  /is this (a )?side effect/, /is this normal for my/,
]

function anyMatch(text: string, patterns: RegExp[]): RegExp | null {
  return patterns.find((p) => p.test(text)) ?? null
}

/**
 * Run the deterministic gates on a single user utterance.
 * Returns the first firing verdict, or { kind: 'pass' }.
 */
export function checkGuardrails(rawUtterance: string): GuardrailVerdict {
  const text = rawUtterance.toLowerCase().trim()

  // Gate 0 — red flags (highest priority)
  if (anyMatch(text, SELF_HARM_PATTERNS)) {
    return { kind: 'red_flag', reason: 'self_harm_language', selfHarm: true }
  }
  const stroke = anyMatch(text, STROKE_PATTERNS)
  if (stroke) return { kind: 'red_flag', reason: `stroke:${stroke.source}`, selfHarm: false }
  const seizure = anyMatch(text, SEIZURE_PATTERNS)
  if (seizure) return { kind: 'red_flag', reason: `seizure:${seizure.source}`, selfHarm: false }
  const acute = anyMatch(text, ACUTE_PATTERNS)
  if (acute) return { kind: 'red_flag', reason: `acute:${acute.source}`, selfHarm: false }

  // Gate 1 — out of scope (clinical judgment)
  const oos = anyMatch(text, OUT_OF_SCOPE_PATTERNS)
  if (oos) return { kind: 'out_of_scope', reason: `judgment:${oos.source}` }

  return { kind: 'pass' }
}

// ── Standing response copy (POC placeholders — wire real numbers in prod) ────

export const CLINIC_NUMBER = '[CLINIC_NUMBER]'
export const AFTER_HOURS_NUMBER = '[AFTER_HOURS_NUMBER]'

export const EMERGENCY_RESPONSE =
  'This sounds like it could be a medical emergency. Please stop and call 911 right now, ' +
  "or your provider's emergency line. I'm an automated assistant and I can't help with emergencies."

export const SELF_HARM_APPEND =
  " If you're having thoughts of harming yourself, please call or text 988 — the Suicide and Crisis Lifeline — " +
  'or text HOME to 741741. You deserve support right now.'

export const REFUSE_AND_ROUTE_RESPONSE =
  "I'm sorry — that's a question I can't answer safely, because it depends on your specific situation. " +
  `The best thing is to ask your neurology care team. You can call the clinic at ${CLINIC_NUMBER}, ` +
  `or the after-hours line at ${AFTER_HOURS_NUMBER}. And if it ever feels urgent, call 911.`

export const GENERAL_INFO_TAG =
  'This is general information, not medical advice — please check with your care team about your own situation.'
