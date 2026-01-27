import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/appointments/[id] - Get a single appointment
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        patient:patients (
          *
        ),
        visit:visits (
          *,
          clinical_notes (*)
        ),
        prior_visit:visits!appointments_prior_visit_id_fkey (
          *,
          clinical_notes (*)
        )
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching appointment:', error)
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    return NextResponse.json({ appointment: data })
  } catch (error) {
    console.error('Error in appointment API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/appointments/[id] - Update an appointment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      appointmentDate,
      appointmentTime,
      durationMinutes,
      appointmentType,
      status,
      hospitalSite,
      reasonForVisit,
      visitId,
      schedulingNotes,
    } = body

    // Build update object with only provided fields
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (appointmentDate !== undefined) updateData.appointment_date = appointmentDate
    if (appointmentTime !== undefined) updateData.appointment_time = appointmentTime
    if (durationMinutes !== undefined) updateData.duration_minutes = durationMinutes
    if (appointmentType !== undefined) updateData.appointment_type = appointmentType
    if (status !== undefined) updateData.status = status
    if (hospitalSite !== undefined) updateData.hospital_site = hospitalSite
    if (reasonForVisit !== undefined) updateData.reason_for_visit = reasonForVisit
    if (visitId !== undefined) updateData.visit_id = visitId
    if (schedulingNotes !== undefined) updateData.scheduling_notes = schedulingNotes

    const { data, error } = await supabase
      .from('appointments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating appointment:', error)
      return NextResponse.json({ error: 'Failed to update appointment' }, { status: 500 })
    }

    return NextResponse.json({ appointment: data })
  } catch (error) {
    console.error('Error in appointment API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/appointments/[id] - Cancel an appointment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Soft delete by setting status to 'cancelled'
    const { data, error } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error cancelling appointment:', error)
      return NextResponse.json({ error: 'Failed to cancel appointment' }, { status: 500 })
    }

    return NextResponse.json({ appointment: data, message: 'Appointment cancelled' })
  } catch (error) {
    console.error('Error in appointment API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
