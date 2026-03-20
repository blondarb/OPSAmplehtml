/**
 * Pipeline orchestration helpers for the Integrated Neuro Intake Engine.
 *
 * Each function performs a focused DB operation corresponding to one
 * transition in the pipeline: Triage → Intake Agent → AI Historian.
 * All functions are non-throwing — they log errors and return null/false
 * so callers can treat DB failures as non-fatal (consistent with the
 * pattern used throughout this codebase).
 */

import { from } from '@/lib/db-query'
import type { NeurologyConsult, TriageConsultUpdate } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new consult record. If triage data is already available (because
 * the caller passes a TriageConsultUpdate), the record is created in state
 * 'triage_complete'; otherwise it starts in 'triage_pending'.
 */
export async function createConsult(
  referralText?: string,
  triageUpdate?: TriageConsultUpdate,
  patientId?: string,
): Promise<NeurologyConsult | null> {
  const now = new Date().toISOString()
  const status = triageUpdate ? 'triage_complete' : 'triage_pending'

  const insertData: Record<string, unknown> = {
    referral_text: referralText || null,
    patient_id: patientId || null,
    status,
    ...(triageUpdate && {
      triage_session_id: triageUpdate.triage_session_id,
      triage_urgency: triageUpdate.triage_urgency,
      triage_tier_display: triageUpdate.triage_tier_display,
      triage_summary: triageUpdate.triage_summary,
      triage_chief_complaint: triageUpdate.triage_chief_complaint,
      triage_red_flags: triageUpdate.triage_red_flags,
      triage_subspecialty: triageUpdate.triage_subspecialty,
      triage_completed_at: now,
    }),
  }

  const { data, error } = await from('neurology_consults')
    .insert(insertData)
    .select()
    .single()

  if (error) {
    console.error('[pipeline] createConsult error:', error)
    return null
  }

  return data as NeurologyConsult
}

// ─────────────────────────────────────────────────────────────────────────────
// Triage phase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Link a completed triage result to an existing consult record.
 * Advances status to 'triage_complete'.
 */
export async function linkTriageToConsult(
  consultId: string,
  update: TriageConsultUpdate,
): Promise<boolean> {
  const { error } = await from('neurology_consults')
    .update({
      status: 'triage_complete',
      triage_session_id: update.triage_session_id,
      triage_urgency: update.triage_urgency,
      triage_tier_display: update.triage_tier_display,
      triage_summary: update.triage_summary,
      triage_chief_complaint: update.triage_chief_complaint,
      triage_red_flags: update.triage_red_flags,
      triage_subspecialty: update.triage_subspecialty,
      triage_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', consultId)

  if (error) {
    console.error('[pipeline] linkTriageToConsult error:', error)
    return false
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Intake phase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Link an intake (follow-up) session to a consult and advance pipeline state.
 *
 * Call with status='intake_in_progress' when the first message fires.
 * Call with status='intake_complete' + summary when conversation_complete=true.
 */
export async function linkIntakeToConsult(
  consultId: string,
  intakeSessionId: string,
  status: 'intake_in_progress' | 'intake_complete',
  summary?: string,
  escalationLevel?: string | null,
): Promise<boolean> {
  const updateData: Record<string, unknown> = {
    intake_session_id: intakeSessionId,
    status,
    intake_status: status === 'intake_complete' ? 'completed' : 'in_progress',
    updated_at: new Date().toISOString(),
  }

  if (status === 'intake_complete') {
    updateData.intake_completed_at = new Date().toISOString()
    if (summary) updateData.intake_summary = summary
    if (escalationLevel !== undefined) updateData.intake_escalation_level = escalationLevel
  }

  const { error } = await from('neurology_consults')
    .update(updateData)
    .eq('id', consultId)

  if (error) {
    console.error('[pipeline] linkIntakeToConsult error:', error)
    return false
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Historian phase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mark a consult as 'historian_in_progress' when the WebRTC session starts.
 */
export async function markHistorianStarted(consultId: string): Promise<boolean> {
  const { error } = await from('neurology_consults')
    .update({
      status: 'historian_in_progress',
      updated_at: new Date().toISOString(),
    })
    .eq('id', consultId)

  if (error) {
    console.error('[pipeline] markHistorianStarted error:', error)
    return false
  }
  return true
}

/**
 * Link a completed historian session to a consult.
 * Advances status to 'historian_complete'.
 */
export async function linkHistorianToConsult(
  consultId: string,
  historianSessionId: string,
  summary: string,
  structuredOutput: Record<string, unknown>,
  redFlags: Array<{ flag: string; severity: string; context: string }>,
  safetyEscalated: boolean,
): Promise<boolean> {
  const { error } = await from('neurology_consults')
    .update({
      historian_session_id: historianSessionId,
      historian_summary: summary,
      historian_structured_output: structuredOutput,
      historian_red_flags: redFlags,
      historian_safety_escalated: safetyEscalated,
      historian_completed_at: new Date().toISOString(),
      status: 'historian_complete',
      updated_at: new Date().toISOString(),
    })
    .eq('id', consultId)

  if (error) {
    console.error('[pipeline] linkHistorianToConsult error:', error)
    return false
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// SDNE phase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mark a consult as 'sdne_pending' when a SDNE exam is requested.
 */
export async function markSDNERequested(consultId: string): Promise<boolean> {
  const { error } = await from('neurology_consults')
    .update({
      status: 'sdne_pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', consultId)

  if (error) {
    console.error('[pipeline] markSDNERequested error:', error)
    return false
  }
  return true
}

/**
 * Link completed SDNE session results to a consult.
 * Advances status to 'sdne_complete'.
 */
export async function linkSDNEToConsult(
  consultId: string,
  sdneSessionId: string,
  sessionFlag: string,
  domainFlags: Record<string, string>,
  detectedPatterns: Array<{ description: string; confidence: string }>,
): Promise<boolean> {
  const { error } = await from('neurology_consults')
    .update({
      sdne_session_id: sdneSessionId,
      sdne_session_flag: sessionFlag,
      sdne_domain_flags: domainFlags,
      sdne_detected_patterns: detectedPatterns,
      sdne_completed_at: new Date().toISOString(),
      status: 'sdne_complete',
      updated_at: new Date().toISOString(),
    })
    .eq('id', consultId)

  if (error) {
    console.error('[pipeline] linkSDNEToConsult error:', error)
    return false
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch a single consult by ID. Returns null if not found or on error. */
export async function getConsult(consultId: string): Promise<NeurologyConsult | null> {
  const { data, error } = await from('neurology_consults')
    .select()
    .eq('id', consultId)
    .single()

  if (error || !data) {
    if (error?.code !== 'PGRST116') {
      // PGRST116 = not found — expected, not an error worth logging
      console.error('[pipeline] getConsult error:', error)
    }
    return null
  }

  return data as NeurologyConsult
}

/** List recent consults, optionally filtered by patient. */
export async function listConsults(
  patientId?: string,
  limit = 20,
): Promise<NeurologyConsult[]> {
  let query = from('neurology_consults')
    .select()
    .order('created_at', { ascending: false })
    .limit(limit)

  if (patientId) {
    query = query.eq('patient_id', patientId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[pipeline] listConsults error:', error)
    return []
  }

  return (data as NeurologyConsult[]) || []
}
