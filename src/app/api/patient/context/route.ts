import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const patientId = searchParams.get('patient_id')

    if (!patientId) {
      return NextResponse.json({ error: 'patient_id is required' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data, error } = await supabase.rpc('get_patient_context_for_portal', {
      p_patient_id: patientId,
    })

    if (error) {
      console.error('Error fetching patient context:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
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
  } catch (error: any) {
    console.error('Patient context API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch patient context' },
      { status: 500 },
    )
  }
}
