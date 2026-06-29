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
 * The red-flag + out-of-scope lexicons are SPECIALTY-SPECIFIC and live in
 * specialty.ts (neuro today; oab/urology is a data swap). This file holds the
 * mechanism + the standing response copy.
 *
 * Full design: ~/ClaudeSync/projects/OPSample/neuro-faq-voice/safety_architecture.md §2–3
 *
 * Tuning principle: HIGH RECALL for red flags. Over-triggering ("call 911 to be
 * safe") is the safe failure direction; under-triggering is not.
 */

import {
  getActiveSpecialty,
  getRedFlagBanks,
  getOutOfScopePatterns,
} from './specialty'
import type { SpecialtyConfig } from './types'

export type GuardrailVerdict =
  | { kind: 'red_flag'; reason: string; selfHarm: boolean }
  | { kind: 'out_of_scope'; reason: string }
  | { kind: 'pass' }

/**
 * Run the deterministic gates on a single user utterance for the given
 * specialty (defaults to the active one). Returns the first firing verdict.
 */
export function checkGuardrails(
  rawUtterance: string,
  specialty: SpecialtyConfig = getActiveSpecialty(),
): GuardrailVerdict {
  const text = rawUtterance.toLowerCase().trim()

  // Gate 0 — red flags (highest priority). Banks are ordered: self-harm, acute,
  // then specialty-specific. First match wins.
  for (const bank of getRedFlagBanks(specialty)) {
    const hit = bank.patterns.find((p) => p.test(text))
    if (hit) {
      return { kind: 'red_flag', reason: `${bank.category}:${hit.source}`, selfHarm: !!bank.selfHarm }
    }
  }

  // Gate 1 — out of scope (clinical judgment).
  const oos = getOutOfScopePatterns(specialty).find((p) => p.test(text))
  if (oos) return { kind: 'out_of_scope', reason: `judgment:${oos.source}` }

  return { kind: 'pass' }
}

// ── Standing response copy ───────────────────────────────────────────────────
// Phone numbers are env-driven so production is a config change, not a code edit.

export const CLINIC_NUMBER = process.env.FAQ_CLINIC_NUMBER || '[CLINIC_NUMBER]'
export const AFTER_HOURS_NUMBER = process.env.FAQ_AFTER_HOURS_NUMBER || '[AFTER_HOURS_NUMBER]'

export const EMERGENCY_RESPONSE =
  'This sounds like it could be a medical emergency. Please stop and call 911 right now, ' +
  "or your provider's emergency line. I'm an automated assistant and I can't help with emergencies."

export const SELF_HARM_APPEND =
  " If you're having thoughts of harming yourself, please call or text 988 — the Suicide and Crisis Lifeline — " +
  'or text HOME to 741741. You deserve support right now.'

export const REFUSE_AND_ROUTE_RESPONSE =
  "I'm sorry — that's a question I can't answer safely, because it depends on your specific situation. " +
  `The best thing is to ask your care team. You can call the clinic at ${CLINIC_NUMBER}, ` +
  `or the after-hours line at ${AFTER_HOURS_NUMBER}. And if it ever feels urgent, call 911.`

export const GENERAL_INFO_TAG =
  'This is general information, not medical advice — please check with your care team about your own situation.'
