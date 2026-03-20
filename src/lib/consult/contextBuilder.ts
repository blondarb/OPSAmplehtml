/**
 * Context string builders for the Integrated Neuro Intake Engine.
 *
 * These functions transform a NeurologyConsult record into the specific
 * string formats expected by the intake agent and the AI Historian,
 * ensuring each downstream step has the richest possible context from
 * earlier pipeline stages.
 */

import type { NeurologyConsult, ConsultIntakeContext, HistorianConsultContext } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Intake agent context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the intake context object from a consult's triage data.
 * Returned by POST /api/consults/[id]/initiate-intake so the UI can
 * pre-populate the intake agent with triage findings.
 */
export function buildIntakeContextFromConsult(consult: NeurologyConsult): ConsultIntakeContext {
  return {
    consult_id: consult.id,
    triage_urgency: consult.triage_urgency || 'routine',
    triage_tier_display: consult.triage_tier_display || 'ROUTINE',
    chief_complaint: consult.triage_chief_complaint || 'Neurological consultation',
    triage_summary: consult.triage_summary || '',
    red_flags: consult.triage_red_flags || [],
    subspecialty: consult.triage_subspecialty || 'General Neurology',
    referral_text: consult.referral_text,
  }
}

/**
 * Build a PatientScenario-compatible visit_summary field from triage data.
 * This is injected into the intake agent's patient context so the agent
 * opens the conversation aware of the triage priority and chief complaint.
 *
 * Example output:
 *   "Triage: URGENT. Chief complaint: New-onset seizure with LOC.
 *    Referred to Epilepsy. Red flags: Loss of consciousness, post-ictal confusion."
 */
export function buildTriageSummaryText(consult: NeurologyConsult): string {
  const parts: string[] = []

  if (consult.triage_tier_display) {
    parts.push(`Triage priority: ${consult.triage_tier_display}`)
  }
  if (consult.triage_chief_complaint) {
    parts.push(`Chief complaint: ${consult.triage_chief_complaint}`)
  }
  if (consult.triage_subspecialty) {
    parts.push(`Referred to: ${consult.triage_subspecialty}`)
  }
  if (consult.triage_red_flags && consult.triage_red_flags.length > 0) {
    // Include up to 3 red flags to keep the summary concise
    parts.push(`Red flags: ${consult.triage_red_flags.slice(0, 3).join('; ')}`)
  }

  return parts.length > 0 ? parts.join('. ') + '.' : 'Neurological consultation.'
}

// ─────────────────────────────────────────────────────────────────────────────
// Historian context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the historian system prompt context from a consult record.
 *
 * Maps to the two parameters of buildHistorianSystemPrompt():
 *   - referralReason: drives the opening question ("you were referred for...")
 *   - patientContext: appended as a PATIENT CONTEXT block in the prompt
 *
 * The historian uses this to:
 *   1. Open with the correct chief complaint
 *   2. Know the triage urgency level so it can appropriately prioritize red flags
 *   3. Avoid re-asking information already collected by the intake agent
 *   4. Flag findings that contradict or confirm triage observations
 */
export function buildHistorianContextFromConsult(
  consult: NeurologyConsult,
): HistorianConsultContext {
  // Referral reason — drives the historian's opening question
  const referralReason =
    consult.triage_chief_complaint ||
    (consult.triage_summary
      ? consult.triage_summary.substring(0, 200)
      : 'Neurological consultation')

  // Build the patient context block line by line
  const lines: string[] = []

  if (consult.triage_tier_display && consult.triage_urgency) {
    lines.push(`TRIAGE PRIORITY: ${consult.triage_tier_display} (${consult.triage_urgency})`)
    lines.push(
      `NOTE: This patient has been triaged as ${consult.triage_tier_display.toLowerCase()}. ` +
        `Pay particular attention to any findings that could explain or escalate this urgency.`,
    )
  }

  if (consult.triage_subspecialty) {
    lines.push(`REFERRED TO: ${consult.triage_subspecialty}`)
  }

  if (consult.triage_summary) {
    lines.push(`\nTRIAGE SUMMARY (from referring clinician):\n${consult.triage_summary}`)
  }

  // Red flags from triage — instruct historian to probe these specifically
  if (consult.triage_red_flags && consult.triage_red_flags.length > 0) {
    lines.push(`\nRED FLAGS IDENTIFIED BY TRIAGE:`)
    consult.triage_red_flags.forEach(flag => lines.push(`  • ${flag}`))
    lines.push(
      `Ask targeted follow-up questions to characterize each of these red flags ` +
        `(onset, severity, progression, associated symptoms).`,
    )
  }

  // Intake agent findings, if the intake step was completed first
  if (consult.intake_summary) {
    lines.push(`\nINTAKE AGENT SUMMARY (gathered before this interview):`)
    lines.push(consult.intake_summary)
    lines.push(
      `Use this context to avoid re-asking questions the patient already answered. ` +
        `Focus on gaps and clarifications.`,
    )
  }

  if (consult.intake_escalation_level && consult.intake_escalation_level !== 'none') {
    lines.push(
      `\nINTAKE ESCALATION: ${consult.intake_escalation_level.toUpperCase()} — ` +
        `the intake agent flagged a concern at this level. Probe carefully.`,
    )
  }

  // SDNE exam results, if available
  if (consult.sdne_session_flag) {
    lines.push(`\nSDNE DIGITAL NEUROLOGIC EXAM RESULTS:`)
    lines.push(`  Overall flag: ${consult.sdne_session_flag}`)

    if (consult.sdne_domain_flags) {
      const flagged = Object.entries(consult.sdne_domain_flags)
        .filter(([, flag]) => flag !== 'GREEN' && flag !== 'NOT_PERFORMED')
      if (flagged.length > 0) {
        lines.push(`  Abnormal domains:`)
        flagged.forEach(([domain, flag]) => lines.push(`    • ${domain}: ${flag}`))
      }
    }

    if (consult.sdne_detected_patterns && consult.sdne_detected_patterns.length > 0) {
      lines.push(`  Detected patterns:`)
      consult.sdne_detected_patterns.forEach(p =>
        lines.push(`    • ${p.description} (${p.confidence} confidence)`),
      )
    }
  }

  const patientContext = lines.join('\n')

  return { referralReason, patientContext }
}

// ─────────────────────────────────────────────────────────────────────────────
// SDNE context for report generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an SDNE summary section for inclusion in the unified report.
 * Returns null if no SDNE data is available.
 */
export function buildSDNESummaryForReport(consult: NeurologyConsult): string | null {
  if (!consult.sdne_session_flag) return null

  const lines: string[] = []
  lines.push('STANDARDIZED DIGITAL NEUROLOGIC EXAM (SDNE Core-15)')
  lines.push(`Overall: ${consult.sdne_session_flag}`)

  if (consult.sdne_domain_flags) {
    lines.push('')
    lines.push('Domain Results:')
    for (const [domain, flag] of Object.entries(consult.sdne_domain_flags)) {
      if (domain === 'Setup') continue // Skip setup/calibration in clinical report
      lines.push(`  ${domain}: ${flag}`)
    }
  }

  if (consult.sdne_detected_patterns && consult.sdne_detected_patterns.length > 0) {
    lines.push('')
    lines.push('Detected Patterns:')
    consult.sdne_detected_patterns.forEach(p =>
      lines.push(`  • ${p.description} (${p.confidence} confidence)`),
    )
  }

  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Triage chief complaint extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive a short chief complaint string from triage API response data.
 *
 * The triage API doesn't return a dedicated "chief_complaint" field, so
 * we derive it from available signals in priority order:
 *   1. First clinical_reason (tends to be the most salient finding)
 *   2. First 150 chars of the referral text (truncated to a sentence boundary)
 *   3. Subspecialty recommendation as a fallback
 */
export function deriveChiefComplaint(
  clinicalReasons: string[],
  referralText: string,
  subspecialtyRecommendation: string,
): string {
  // Option 1: Use first clinical reason — usually a concise clinical statement
  if (clinicalReasons && clinicalReasons.length > 0 && clinicalReasons[0].length < 200) {
    return clinicalReasons[0]
  }

  // Option 2: Extract first sentence from referral text
  if (referralText) {
    const firstSentence = referralText.split(/[.!?]/)[0].trim()
    if (firstSentence.length >= 20 && firstSentence.length <= 200) {
      return firstSentence
    }
    if (referralText.length >= 20) {
      return referralText.substring(0, 150).trim() + (referralText.length > 150 ? '...' : '')
    }
  }

  // Option 3: Subspecialty fallback
  return subspecialtyRecommendation
    ? `${subspecialtyRecommendation} consultation`
    : 'Neurological consultation'
}

/**
 * Build a concise human-readable triage summary for storage in the consult
 * record. This is what downstream steps (intake agent, historian) will read.
 */
export function buildTriageSummaryForConsult(
  triageTierDisplay: string,
  clinicalReasons: string[],
  suggestedWorkup: string[],
  subspecialtyRecommendation: string,
  subspecialtyRationale: string,
): string {
  const lines: string[] = []

  lines.push(`Triage tier: ${triageTierDisplay}`)

  if (clinicalReasons && clinicalReasons.length > 0) {
    lines.push(`\nClinical assessment:`)
    clinicalReasons.slice(0, 5).forEach(r => lines.push(`  • ${r}`))
  }

  if (suggestedWorkup && suggestedWorkup.length > 0) {
    lines.push(`\nSuggested workup:`)
    suggestedWorkup.slice(0, 4).forEach(w => lines.push(`  • ${w}`))
  }

  if (subspecialtyRecommendation) {
    lines.push(`\nRecommended subspecialty: ${subspecialtyRecommendation}`)
  }

  if (subspecialtyRationale) {
    lines.push(`Rationale: ${subspecialtyRationale}`)
  }

  return lines.join('\n')
}
