import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { from } from '@/lib/db-query'

// POST /api/visits - Create a new visit (when starting an appointment)
export async function POST(request: NextRequest) {
  try {

    // Check authentication
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      appointmentId,
      patientId,
      chiefComplaint,
      visitType = 'new_patient',
      providerName,
      priorVisitId,
    } = body

    // Validate required fields
    if (!patientId) {
      return NextResponse.json({ error: 'patientId is required' }, { status: 400 })
    }

    // Prevent duplicate visits for the same appointment
    if (appointmentId) {
      const { data: existing } = await from('appointments')
        .select('visit_id')
        .eq('id', appointmentId)
        .single()

      if (existing?.visit_id) {
        return NextResponse.json(
          { error: 'This appointment already has an active visit', visitId: existing.visit_id },
          { status: 409 }
        )
      }
    }

    // Map appointment types to valid visit_type values
    const visitTypeMap: Record<string, string> = {
      'new-consult': 'new_patient',
      'follow-up': 'follow_up',
      '3-month-follow-up': 'follow_up',
      '6-month-follow-up': 'follow_up',
      'urgent': 'urgent',
      'telehealth': 'telehealth',
    }
    const mappedVisitType = visitTypeMap[visitType] || visitType

    // Create the visit (only insert columns that exist in the visits table)
    const { data: visit, error: visitError } = await from('visits')
      .insert({
        patient_id: patientId,
        user_id: user.id,
        visit_date: new Date().toISOString().split('T')[0],
        visit_type: mappedVisitType,
        chief_complaint: chiefComplaint || [],
        status: 'in_progress',
      })
      .select()
      .single()

    if (visitError) {
      console.error('Error creating visit:', visitError)
      return NextResponse.json({ error: 'Failed to create visit' }, { status: 500 })
    }

    // Create an empty clinical note for the visit
    const { data: clinicalNote, error: noteError } = await from('clinical_notes')
      .insert({
        visit_id: visit.id,
        status: 'draft',
      })
      .select()
      .single()

    if (noteError) {
      console.error('Error creating clinical note:', noteError)
      // Don't fail the whole request, visit is still created
    }

    // Update the appointment to link to this visit and mark as in-progress
    if (appointmentId) {
      await from('appointments')
        .update({
          visit_id: visit.id,
          status: 'in_progress',
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointmentId)
    }

    return NextResponse.json({
      visit: {
        ...visit,
        clinicalNote: clinicalNote || null,
      }
    }, { status: 201 })
  } catch (error) {
    console.error('Error in visits API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
