import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/appointments - Get appointments with optional filters
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const patientId = searchParams.get('patientId')
    const status = searchParams.get('status')
    const date = searchParams.get('date') // Single date query

    // Build query
    let query = supabase
      .from('appointments')
      .select(`
        *,
        patient:patients (
          id,
          mrn,
          first_name,
          last_name,
          date_of_birth,
          gender,
          phone,
          email,
          referring_physician,
          referral_reason
        ),
        prior_visit:visits!appointments_prior_visit_id_fkey (
          id,
          visit_date,
          visit_type,
          clinical_notes (
            ai_summary
          )
        )
      `)
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true })

    // Apply filters
    if (date) {
      query = query.eq('appointment_date', date)
    } else if (startDate && endDate) {
      query = query.gte('appointment_date', startDate).lte('appointment_date', endDate)
    } else if (startDate) {
      query = query.gte('appointment_date', startDate)
    }

    if (patientId) {
      query = query.eq('patient_id', patientId)
    }

    if (status && status !== 'All') {
      query = query.eq('status', status.toLowerCase())
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching appointments:', error)
      return NextResponse.json({ error: 'Failed to fetch appointments', details: error.message, code: error.code }, { status: 500 })
    }

    // Transform data to match frontend expectations
    const appointments = (data || []).map(apt => ({
      id: apt.id,
      appointmentDate: apt.appointment_date,
      appointmentTime: apt.appointment_time,
      durationMinutes: apt.duration_minutes,
      appointmentType: apt.appointment_type,
      status: apt.status,
      hospitalSite: apt.hospital_site,
      reasonForVisit: apt.reason_for_visit,
      schedulingNotes: apt.scheduling_notes,
      visitId: apt.visit_id,
      priorVisitId: apt.prior_visit_id,
      patient: apt.patient ? {
        id: apt.patient.id,
        mrn: apt.patient.mrn,
        firstName: apt.patient.first_name,
        lastName: apt.patient.last_name,
        name: `${apt.patient.first_name} ${apt.patient.last_name}`,
        dateOfBirth: apt.patient.date_of_birth,
        age: apt.patient.date_of_birth
          ? Math.floor((Date.now() - new Date(apt.patient.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
          : null,
        gender: apt.patient.gender,
        phone: apt.patient.phone,
        email: apt.patient.email,
        referringPhysician: apt.patient.referring_physician,
        referralReason: apt.patient.referral_reason,
      } : null,
      priorVisit: apt.prior_visit ? {
        id: apt.prior_visit.id,
        visitDate: apt.prior_visit.visit_date,
        visitType: apt.prior_visit.visit_type,
        aiSummary: Array.isArray(apt.prior_visit.clinical_notes)
          ? apt.prior_visit.clinical_notes?.[0]?.ai_summary || null
          : apt.prior_visit.clinical_notes?.ai_summary || null,
      } : null,
    }))

    return NextResponse.json({ appointments })
  } catch (error) {
    console.error('Error in appointments API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/appointments - Create a new appointment
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      patientId,
      appointmentDate,
      appointmentTime,
      durationMinutes = 30,
      appointmentType,
      hospitalSite = 'Main Campus',
      reasonForVisit,
      priorVisitId,
      schedulingNotes,
    } = body

    // Validate required fields
    if (!patientId || !appointmentDate || !appointmentTime || !appointmentType) {
      return NextResponse.json(
        { error: 'Missing required fields: patientId, appointmentDate, appointmentTime, appointmentType' },
        { status: 400 }
      )
    }

    // Create appointment
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        patient_id: patientId,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        duration_minutes: durationMinutes,
        appointment_type: appointmentType,
        status: 'scheduled',
        hospital_site: hospitalSite,
        reason_for_visit: reasonForVisit,
        prior_visit_id: priorVisitId,
        scheduling_notes: schedulingNotes,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating appointment:', error)
      return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 })
    }

    return NextResponse.json({ appointment: data }, { status: 201 })
  } catch (error) {
    console.error('Error in appointments API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
