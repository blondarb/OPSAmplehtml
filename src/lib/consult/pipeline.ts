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
import { getPool } from '@/lib/db'
import type { NeurologyConsult, TriageConsultUpdate } from './types'
import { getTenantServer } from '@/lib/tenant'

// ─────────────────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateConsultResult {
  data: NeurologyConsult | null
  error?: string
}

/**
 * Create a new consult record. If triage data is already available (because
 * the caller passes a TriageConsultUpdate), the record is created in state
 * 'triage_complete'; otherwise it starts in 'triage_pending'.
 *
 * Returns { data, error } so callers can surface specific failure reasons.
 */
export async function createConsult(
  referralText?: string,
  triageUpdate?: TriageConsultUpdate,
  patientId?: string,
  tenantId = getTenantServer(),
): Promise<CreateConsultResult> {
  const now = new Date().toISOString()
  const status = triageUpdate ? 'triage_complete' : 'triage_pending'

  const insertData: Record<string, unknown> = {
    tenant_id: tenantId,
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
    // Map DB error codes to actionable messages
    const pgCode = (error as { code?: string }).code
    let userMessage = 'Failed to save the consult record to the database.'
    if (pgCode === '23503') {
      userMessage = 'A linked record (patient or triage session) could not be found. Please retry the triage step.'
    } else if (pgCode === '23505') {
      userMessage = 'A consult record for this triage session already exists.'
    } else if (pgCode === '23514') {
      userMessage = 'Invalid consult data — a database constraint was violated. Please retry.'
    } else if (pgCode === '08006' || pgCode === '08001' || pgCode === '57P01') {
      userMessage = 'Database connection issue. Please wait a moment and try again.'
    } else if (pgCode === '42P01') {
      userMessage = 'A required database table is missing. Please contact support.'
    }
    return { data: null, error: userMessage }
  }

  return { data: data as NeurologyConsult }
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
  tenantId: string,
  expectedPatientId: string | null,
  processingAttemptCount: number,
): Promise<boolean> {
  try {
    const now = new Date().toISOString()
    const result = await (await getPool()).query(
      `UPDATE neurology_consults
          SET status = 'triage_complete',
              triage_session_id = $3,
              triage_urgency = $5,
              triage_tier_display = $6,
              triage_summary = $7,
              triage_chief_complaint = $8,
              triage_red_flags = $9,
              triage_subspecialty = $10,
              triage_completed_at = $11,
              updated_at = $11
        WHERE id = $1
          AND tenant_id = $2
          AND patient_id IS NOT DISTINCT FROM $4
          AND (triage_session_id IS NULL OR triage_session_id = $3)
          AND EXISTS (
            SELECT 1
              FROM triage_sessions session
             WHERE session.id = $3
               AND session.tenant_id = $2
               AND session.patient_id IS NOT DISTINCT FROM $4
               AND (
                 session.consult_id IS NULL
                 OR session.consult_id = $1
               )
               AND session.processing_status = 'pending'
               AND session.processing_attempt_count = $12
          )
      RETURNING id`,
      [
        consultId,
        tenantId,
        update.triage_session_id,
        expectedPatientId,
        update.triage_urgency,
        update.triage_tier_display,
        update.triage_summary,
        update.triage_chief_complaint,
        update.triage_red_flags,
        update.triage_subspecialty,
        now,
        processingAttemptCount,
      ],
    )
    return result.rowCount === 1 && result.rows[0]?.id === consultId
  } catch (error) {
    console.error('[pipeline] linkTriageToConsult error:', error)
    return false
  }
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
  tenantId?: string,
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

  let query = from('neurology_consults')
    .update(updateData)
    .eq('id', consultId)
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { error } = await query

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
export async function markHistorianStarted(
  consultId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await from('neurology_consults')
    .update({
      status: 'historian_in_progress',
      updated_at: new Date().toISOString(),
    })
    .eq('id', consultId)
    .eq('tenant_id', tenantId)
    .select('id')
    .single()

  if (error || !data) {
    console.error('[pipeline] markHistorianStarted error:', error)
    return false
  }
  return true
}

/**
 * Link a completed historian session to a consult.
 * Advances status to 'historian_complete'.
 *
 * `interviewCompletionStatus` distinguishes natural completion from early
 * end so downstream consumers can treat partial intakes differently.
 */
export async function linkHistorianToConsult(
  consultId: string,
  historianSessionId: string,
  summary: string,
  structuredOutput: Record<string, unknown>,
  redFlags: Array<{ flag: string; severity: string; context: string }>,
  safetyEscalated: boolean,
  interviewCompletionStatus: 'complete' | 'ended_early' | null = null,
): Promise<boolean> {
  // Pre-stringify jsonb fields. The shared query builder auto-stringifies
  // plain objects but passes arrays through raw; historian_red_flags is a
  // jsonb array, so without this the update fails and the consult never
  // advances to 'historian_complete'.
  const toJSON = (v: unknown) => (v != null ? JSON.stringify(v) : null)

  const { error } = await from('neurology_consults')
    .update({
      historian_session_id: historianSessionId,
      historian_summary: summary,
      historian_structured_output: toJSON(structuredOutput),
      historian_red_flags: toJSON(redFlags),
      historian_safety_escalated: safetyEscalated,
      historian_completed_at: new Date().toISOString(),
      interview_completion_status: interviewCompletionStatus,
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
export async function markSDNERequested(
  consultId: string,
  tenantId?: string,
): Promise<boolean> {
  let query = from('neurology_consults')
    .update({
      status: 'sdne_pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', consultId)
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { error } = await query

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
  tenantId?: string,
): Promise<boolean> {
  let query = from('neurology_consults')
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
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { error } = await query

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
export async function getConsult(
  consultId: string,
  tenantId?: string,
): Promise<NeurologyConsult | null> {
  let query = from('neurology_consults')
    .select()
    .eq('id', consultId)
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data, error } = await query.single()

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
  patientId: string | undefined,
  limit: number,
  tenantId: string,
): Promise<NeurologyConsult[]> {
  let query = from('neurology_consults')
    .select()
    .eq('tenant_id', tenantId)
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
