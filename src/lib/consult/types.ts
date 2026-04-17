/**
 * Types for the Integrated Neuro Intake Engine — Phase 1
 *
 * A NeurologyConsult tracks a single patient referral through the full
 * intake pipeline: Triage → Intake Agent → AI Historian.
 *
 * The consult record is the backbone for all downstream phases
 * (localizer, scales, red flag escalation, report generator).
 */

/**
 * Pipeline status values, ordered by progression.
 * A consult moves forward through these states; it never moves backward.
 */
export type ConsultStatus =
  | 'triage_pending'       // Created, awaiting triage
  | 'triage_complete'      // Triage scored; ready to trigger intake
  | 'intake_pending'       // Intake queued; awaiting patient contact
  | 'intake_in_progress'   // Intake agent actively conversing with patient
  | 'intake_complete'      // Intake conversation finished
  | 'historian_pending'    // Historian queued; patient not yet in interview
  | 'historian_in_progress'// Historian WebRTC session is live
  | 'historian_complete'   // Historian interview saved; structured output available
  | 'sdne_pending'         // SDNE exam requested; awaiting completion
  | 'sdne_complete'        // SDNE results received and linked
  | 'complete'             // All pipeline stages done; ready for physician review

/**
 * Full consult record as stored in the neurology_consults table.
 */
export interface NeurologyConsult {
  id: string
  patient_id: string | null

  status: ConsultStatus

  // ── Triage phase ──────────────────────────────────────────────────
  triage_session_id: string | null
  triage_urgency: string | null         // TriageTier value (e.g. 'urgent')
  triage_tier_display: string | null    // Display label (e.g. 'URGENT')
  triage_summary: string | null         // Human-readable summary for downstream steps
  triage_chief_complaint: string | null // Extracted chief complaint text
  triage_red_flags: string[] | null     // Red flag array from triage
  triage_subspecialty: string | null    // Recommended subspecialty
  triage_completed_at: string | null

  // ── Intake / Follow-up phase ──────────────────────────────────────
  intake_session_id: string | null
  intake_status: string | null          // Mirrors followup_sessions.status
  intake_summary: string | null         // Summary extracted from intake conversation
  intake_escalation_level: string | null// urgent | same_day | next_visit | informational
  intake_transcript_excerpt: string | null
  intake_completed_at: string | null

  // ── AI Historian phase ────────────────────────────────────────────
  historian_session_id: string | null
  historian_summary: string | null      // narrative_summary from historian
  historian_structured_output: Record<string, unknown> | null  // Full OLDCARTS output
  historian_red_flags: Array<{ flag: string; severity: string; context: string }> | null
  historian_safety_escalated: boolean
  historian_completed_at: string | null
  // 'complete' when AI fired save_interview_output naturally; 'ended_early'
  // when the patient clicked End Interview before the AI finished. null for
  // legacy rows or consults that never reached the historian step.
  interview_completion_status: 'complete' | 'ended_early' | null

  // ── SDNE (Standardized Digital Neurologic Exam) phase ─────────────
  sdne_session_id: string | null
  sdne_session_flag: string | null       // Overall flag: GREEN/YELLOW/RED
  sdne_domain_flags: Record<string, string> | null  // Domain → flag mapping
  sdne_detected_patterns: Array<{ description: string; confidence: string }> | null
  sdne_completed_at: string | null

  // ── Source data ───────────────────────────────────────────────────
  referral_text: string | null          // Original referral text that was triaged
  notes: string | null                  // Clinician notes / free-form annotations

  // ── Timestamps ────────────────────────────────────────────────────
  created_at: string
  updated_at: string
}

/**
 * Data needed to link a completed triage result to a consult record.
 * Passed from the triage API route to the pipeline helper after triage
 * scores are calculated and the triage_sessions row is saved.
 */
export interface TriageConsultUpdate {
  triage_session_id: string
  triage_urgency: string
  triage_tier_display: string
  triage_summary: string
  triage_chief_complaint: string
  triage_red_flags: string[]
  triage_subspecialty: string
}

/**
 * Intake context derived from a consult's triage data.
 * Returned by POST /api/consults/[id]/initiate-intake so the UI can
 * pre-populate the intake agent with triage findings.
 */
export interface ConsultIntakeContext {
  consult_id: string
  triage_urgency: string
  triage_tier_display: string
  chief_complaint: string
  triage_summary: string
  red_flags: string[]
  subspecialty: string
  referral_text: string | null
}

/**
 * Context strings passed to buildHistorianSystemPrompt() when a consult
 * record is available. Both fields map directly to that function's params.
 */
export interface HistorianConsultContext {
  referralReason: string
  patientContext: string
}
