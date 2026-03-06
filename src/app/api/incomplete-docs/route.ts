import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { getTenantServer } from '@/lib/tenant'
import { from } from '@/lib/db-query'

// GET /api/incomplete-docs — Scan for unsigned/incomplete clinical notes
export async function GET() {
  try {
    const tenant = getTenantServer()

    const incompleteItems: Array<{
      type: string
      patient_name: string
      patient_id: string | null
      visit_id: string | null
      note_id: string | null
      description: string
      visit_date: string | null
      missing_sections: string[]
    }> = []

    // 1. Unsigned notes: clinical_notes where signed_at is NULL
    //    and the visit was more than 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: unsignedNotes } = await from('clinical_notes')
      .select(`
        id,
        visit_id,
        signed_at,
        assessment,
        plan,
        hpi,
        created_at,
        visit:visits (
          id,
          visit_date,
          patient_id,
          patient:patients (
            first_name,
            last_name
          )
        )
      `)
      .is('signed_at', null)
      .lt('created_at', twentyFourHoursAgo)
      .limit(20)

    if (unsignedNotes) {
      for (const note of unsignedNotes) {
        const visit = note.visit as any
        const patient = visit?.patient
        const patientName = patient
          ? `${patient.first_name} ${patient.last_name}`
          : 'Unknown Patient'

        const missingSections: string[] = []
        if (!note.assessment) missingSections.push('Assessment')
        if (!note.plan) missingSections.push('Plan')
        if (!note.hpi) missingSections.push('HPI')

        incompleteItems.push({
          type: missingSections.length > 0 ? 'missing_sections' : 'unsigned',
          patient_name: patientName,
          patient_id: visit?.patient_id || null,
          visit_id: visit?.id || null,
          note_id: note.id,
          description: missingSections.length > 0
            ? `Unsigned note with missing sections: ${missingSections.join(', ')}`
            : 'Note awaiting signature (>24 hours)',
          visit_date: visit?.visit_date || null,
          missing_sections: missingSections,
        })
      }
    }

    // 2. Visits with no clinical note at all (visit > 24hrs ago, status completed or in-progress)
    const { data: visitsWithoutNotes } = await from('visits')
      .select(`
        id,
        visit_date,
        visit_type,
        patient_id,
        patient:patients (
          first_name,
          last_name
        )
      `)
      .lt('visit_date', twentyFourHoursAgo.split('T')[0])
      .limit(20)

    if (visitsWithoutNotes) {
      // Check which of these visits have clinical notes
      const visitIds = visitsWithoutNotes.map((v: any) => v.id)
      if (visitIds.length > 0) {
        const { data: existingNotes } = await from('clinical_notes')
          .select('visit_id')
          .in('visit_id', visitIds)

        const visitIdsWithNotes = new Set((existingNotes || []).map((n: any) => n.visit_id))

        for (const visit of visitsWithoutNotes) {
          if (!visitIdsWithNotes.has(visit.id)) {
            const patient = visit.patient as any
            const patientName = patient
              ? `${patient.first_name} ${patient.last_name}`
              : 'Unknown Patient'

            incompleteItems.push({
              type: 'no_note',
              patient_name: patientName,
              patient_id: visit.patient_id,
              visit_id: visit.id,
              note_id: null,
              description: `Visit on ${visit.visit_date} has no clinical note`,
              visit_date: visit.visit_date,
              missing_sections: [],
            })
          }
        }
      }
    }

    return NextResponse.json({
      incomplete_docs: incompleteItems,
      count: incompleteItems.length,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
