import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { from } from '@/lib/db-query'
import type { PatientScenario, MedicationInfo } from '@/lib/follow-up/types'

/**
 * POST /api/follow-up/from-visit
 *
 * Creates a follow-up session seeded with real patient/visit data.
 * Called automatically after a visit is signed, or manually by staff.
 *
 * Body: { visitId: string }
 * Returns: { session: { id, patient_context }, message: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { visitId } = body

    if (!visitId) {
      return NextResponse.json(
        { error: 'visitId is required' },
        { status: 400 },
      )
    }

    // Fetch visit + patient + clinical note in a single query
    const pool = await getPool()
    const { rows } = await pool.query(
      `
      SELECT
        v."id"            AS visit_id,
        v."patient_id",
        v."visit_date",
        v."visit_type",
        v."chief_complaint",
        v."status"        AS visit_status,
        p."first_name",
        p."last_name",
        p."date_of_birth",
        p."gender",
        cn."hpi",
        cn."assessment",
        cn."plan",
        cn."ai_summary",
        cn."medications"
      FROM "visits" v
      LEFT JOIN "patients" p      ON p."id" = v."patient_id"
      LEFT JOIN "clinical_notes" cn ON cn."visit_id" = v."id"
      WHERE v."id" = $1
      LIMIT 1
      `,
      [visitId],
    )

    const row = rows[0]
    if (!row) {
      return NextResponse.json(
        { error: 'Visit not found' },
        { status: 404 },
      )
    }

    // Calculate age
    const age = row.date_of_birth
      ? Math.floor(
          (Date.now() - new Date(row.date_of_birth).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000),
        )
      : null

    // Parse medications from clinical note JSON (if stored) into MedicationInfo[]
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

    // Build a visit summary from clinical note fields
    const summaryParts: string[] = []
    if (row.chief_complaint) {
      const cc = Array.isArray(row.chief_complaint)
        ? row.chief_complaint.join(', ')
        : row.chief_complaint
      summaryParts.push(`CC: ${cc}`)
    }
    if (row.assessment) {
      summaryParts.push(`Assessment: ${row.assessment}`)
    }
    if (row.plan) {
      summaryParts.push(`Plan: ${row.plan}`)
    }
    const visitSummary =
      row.ai_summary || summaryParts.join('. ') || 'Visit completed'

    // Build patient context using the same shape the conversation engine expects
    const patientContext: PatientScenario = {
      id: row.patient_id || visitId,
      name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Patient',
      age: age ?? 0,
      gender: row.gender || 'Unknown',
      diagnosis:
        row.assessment ||
        (Array.isArray(row.chief_complaint)
          ? row.chief_complaint.join(', ')
          : row.chief_complaint) ||
        'Not documented',
      visitDate: row.visit_date
        ? new Date(row.visit_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      providerName: 'Provider', // Could be enriched from a providers table
      medications,
      visitSummary,
    }

    // Create a followup_sessions record in pending state
    const sessionId = crypto.randomUUID()
    const { data: session, error: insertError } = await from('followup_sessions')
      .insert({
        id: sessionId,
        patient_id: row.patient_id || null,
        patient_name: patientContext.name,
        patient_age: patientContext.age,
        patient_gender: patientContext.gender,
        diagnosis: patientContext.diagnosis,
        visit_date: patientContext.visitDate,
        provider_name: patientContext.providerName,
        medications: patientContext.medications,
        visit_summary: patientContext.visitSummary,
        follow_up_method: 'sms',
        status: 'idle',
        current_module: 'greeting',
        transcript: [],
        // Link back to the originating visit
        visit_id: visitId,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[from-visit] DB insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to create follow-up session' },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        session: {
          id: session?.id || sessionId,
          patient_context: patientContext,
        },
        message: 'Follow-up session created from visit',
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('[from-visit] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
