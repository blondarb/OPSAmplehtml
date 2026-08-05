import type { HistorianHandoffDisplay } from './referralHandoff'

/**
 * Pure derivation of the referred-mode card's text content, split out of
 * NeurologicHistorian.tsx so it can be unit tested without a DOM environment
 * (this repo has none — see referralHandoff.test.ts / triageHandoffPayload.test.ts
 * for the same pattern).
 *
 * Deliberately does NOT parse, color-code, or validate `tierDisplay` — it is
 * free text generated upstream by the triage flow (see
 * src/lib/triage/tierPresentation.ts), and this card's job is "confirm what
 * was loaded," not "validate that triage's output made sense." A
 * self-contradictory string (e.g. "INSUFFICIENT DATA — Return to Referring
 * Provider for Clarification (Red Flag Override)") is rendered verbatim.
 */
export interface ReferredCardContent {
  /** Never blank — falls back to a generic label so the card never shows an
   * empty line where a patient name should be. */
  patientLabel: string
  /** Null when tierDisplay is absent/whitespace-only — the tier line is
   * omitted entirely rather than rendering "Triage: " with nothing after it. */
  tierLine: string | null
  /** Never blank — falls back to an explicit "not captured" message so a
   * missing focus is visible and honest rather than a silent blank space. */
  focusText: string
}

export function deriveReferredCardContent(
  display: HistorianHandoffDisplay | null,
): ReferredCardContent {
  const patientLabel = display?.patientLabel?.trim() || 'Referred patient'

  const tier = display?.tierDisplay?.trim()
  const tierLine = tier ? `Triage: ${tier}` : null

  const focus = display?.focusHint?.trim()
  const focusText =
    focus || 'Reason for referral not captured — review with the patient during the interview.'

  return { patientLabel, tierLine, focusText }
}
