/**
 * Visit -> Follow-Up trigger helper.
 *
 * Called (non-blocking) after a visit is signed. Makes an internal fetch to
 * POST /api/follow-up/from-visit to create a pending follow-up session
 * seeded with real patient and clinical data from the completed visit.
 */

import { getPool } from '@/lib/db'
import { from } from '@/lib/db-query'
import type { MedicationInfo, PatientScenario } from '@/lib/follow-up/types'

/**
 * Creates a follow-up session record directly (no HTTP round-trip).
 * Non-throwing — logs errors and returns null on failure.
 */
export async function triggerFollowUpFromVisit(
  visitId: string,
): Promise<string | null> {
  try {
    const pool = await getPool()

    const { rows } = await pool.query(
      `
      SELECT
        v."id"             AS visit_id,
        v."patient_id",
        v."visit_date",
        v."chief_complaint",
        p."first_name",
        p."last_name",
        p."date_of_birth",
        p."gender",
        cn."assessment",
        cn."plan",
        cn."ai_summary",
        cn."medications"
      FROM "visits" v
      LEFT JOIN "patients" p       ON p."id" = v."patient_id"
      LEFT JOIN "clinical_notes" cn ON cn."visit_id" = v."id"
      WHERE v."id" = $1
      LIMIT 1
      `,
      [visitId],
    )

    const row = rows[0]
    if (!row) {
      console.warn('[visitTrigger] Visit not found:', visitId)
      return null
    }

    // Build patient context
    const age = row.date_of_birth
      ? Math.floor(
          (Date.now() - new Date(row.date_of_birth).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000),
        )
      : 0

    const medications: MedicationInfo[] = []
    if (row.medications && Array.isArray(row.medications)) {
      for (const m of row.medications) {
        medications.push({
          name: m.name || m.medication || 'Unknown',
          dose: m.dose || m.dosage || '',
          isNew: m.isNew ?? m.is_new ?? false,
        })
      }
    }

    const summaryParts: string[] = []
    if (row.chief_complaint) {
      const cc = Array.isArray(row.chief_complaint)
        ? row.chief_complaint.join(', ')
        : row.chief_complaint
      summaryParts.push(`CC: ${cc}`)
    }
    if (row.assessment) summaryParts.push(`Assessment: ${row.assessment}`)
    if (row.plan) summaryParts.push(`Plan: ${row.plan}`)

    const visitSummary =
      row.ai_summary || summaryParts.join('. ') || 'Visit completed'

    const patientName =
      `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Patient'

    const visitDate = row.visit_date
      ? new Date(row.visit_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]

    const sessionId = crypto.randomUUID()

    const { data: session, error: insertError } = await from('followup_sessions')
      .insert({
        id: sessionId,
        patient_id: row.patient_id || null,
        patient_name: patientName,
        patient_age: age,
        patient_gender: row.gender || 'Unknown',
        diagnosis:
          row.assessment ||
          (Array.isArray(row.chief_complaint)
            ? row.chief_complaint.join(', ')
            : row.chief_complaint) ||
          'Not documented',
        visit_date: visitDate,
        provider_name: 'Provider',
        medications,
        visit_summary: visitSummary,
        follow_up_method: 'sms',
        status: 'idle',
        current_module: 'greeting',
        transcript: [],
        visit_id: visitId,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[visitTrigger] DB insert error:', insertError)
      return null
    }

    console.log(
      `[visitTrigger] Follow-up session ${session?.id || sessionId} created for visit ${visitId}`,
    )
    return session?.id || sessionId
  } catch (err) {
    console.error('[visitTrigger] exception:', err)
    return null
  }
}
