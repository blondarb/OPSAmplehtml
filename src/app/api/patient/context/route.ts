import { NextResponse } from 'next/server'
import { rpc } from '@/lib/db-query'
import { getPool } from '@/lib/db'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'


export async function GET(request: Request) {
  try {
    const access = await authorizeClinicalAccess({
      action: 'patient.context_read',
      allowedRoles: ['viewer', 'scheduler', 'clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }

    const { searchParams } = new URL(request.url)
    const patientId = searchParams.get('patient_id')

    if (!patientId) {
      return NextResponse.json({ error: 'patient_id is required' }, { status: 400 })
    }


    const pool = await getPool()
    const { rows: patientRows } = await pool.query(
      `SELECT id
         FROM patients
        WHERE id = $1
          AND tenant_id = $2
        LIMIT 1`,
      [patientId, access.context.tenantId],
    )
    if (!patientRows[0]) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    const { data, error } = await rpc('get_patient_context_for_portal', {
      p_patient_id: patientId,
    })

    if (error) {
      console.error('[patient/context] context lookup failed')
      return NextResponse.json(
        { error: 'Failed to fetch patient context' },
        { status: 500 },
      )
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    return NextResponse.json({
      patientName: row.patient_name,
      referralReason: row.referral_reason || null,
      lastVisitDate: row.last_visit_date || null,
      lastVisitType: row.last_visit_type || null,
      lastNoteExcerpt: row.last_note_hpi
        ? row.last_note_hpi
          + (row.last_note_assessment ? '\n\nAssessment: ' + row.last_note_assessment : '')
        : null,
      lastNotePlan: row.last_note_plan || null,
      allergies: row.last_note_allergies || null,
      diagnoses: row.active_diagnoses || null,
      lastNoteSummary: row.last_note_summary || null,
    })
  } catch {
    console.error('[patient/context] request failed')
    return NextResponse.json(
      { error: 'Failed to fetch patient context' },
      { status: 500 },
    )
  }
}
