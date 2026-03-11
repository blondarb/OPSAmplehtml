import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { getPool } from '@/lib/db'
import { from } from '@/lib/db-query'

// GET /api/appointments/[id] - Get a single appointment
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Check authentication
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const pool = await getPool()
    const sql = `
      SELECT
        a.*,
        row_to_json(p.*) AS patient,
        row_to_json(v.*) AS visit,
        row_to_json(pv.*) AS prior_visit,
        (SELECT json_agg(cn.*) FROM "clinical_notes" cn WHERE cn."visit_id" = v."id") AS visit_clinical_notes,
        (SELECT json_agg(cn.*) FROM "clinical_notes" cn WHERE cn."visit_id" = pv."id") AS prior_visit_clinical_notes
      FROM "appointments" a
      LEFT JOIN "patients" p ON p."id" = a."patient_id"
      LEFT JOIN "visits" v ON v."id" = a."visit_id"
      LEFT JOIN "visits" pv ON pv."id" = a."prior_visit_id"
      WHERE a."id" = $1
      LIMIT 1
    `
    const { rows } = await pool.query(sql, [id])

    if (!rows.length) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    const row = rows[0]
    // Attach clinical_notes arrays to visit/prior_visit objects
    if (row.visit) row.visit.clinical_notes = row.visit_clinical_notes || []
    if (row.prior_visit) row.prior_visit.clinical_notes = row.prior_visit_clinical_notes || []
    delete row.visit_clinical_notes
    delete row.prior_visit_clinical_notes

    return NextResponse.json({ appointment: row })
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

    // Check authentication
    const user = await getUser()
    if (!user) {
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

    const { data, error } = await from('appointments')
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

    // Check authentication
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Soft delete by setting status to 'cancelled'
    const { data, error } = await from('appointments')
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
