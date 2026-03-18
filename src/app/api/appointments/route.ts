import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { getPool } from '@/lib/db'
import { from } from '@/lib/db-query'

// Demo appointment templates — generated relative to the requested date
const DEMO_TEMPLATES = [
  { time: '08:30', duration: 30, type: 'follow-up', status: 'confirmed', site: 'Meridian Neurology', reason: "Parkinson's tremor assessment", patient: { firstName: 'Linda', lastName: 'Martinez', mrn: 'MRN-2024-001', gender: 'female', dob: '1958-03-15', phone: '(555) 234-5678', email: 'linda.martinez@email.com', referringPhysician: 'Dr. Sarah Chen', referralReason: 'Progressive tremor evaluation' } },
  { time: '09:00', duration: 30, type: 'new-consult', status: 'scheduled', site: 'Meridian Neurology', reason: 'Headache evaluation', patient: { firstName: 'Robert', lastName: 'Chen', mrn: 'MRN-2024-012', gender: 'male', dob: '1985-07-22', phone: '(555) 345-6789', email: 'robert.chen@email.com', referringPhysician: 'Dr. Michael Torres', referralReason: 'Chronic migraine workup' } },
  { time: '09:30', duration: 30, type: 'follow-up', status: 'confirmed', site: 'Meridian Neurology', reason: 'MS follow-up', patient: { firstName: 'Sarah', lastName: 'Kim', mrn: 'MRN-2024-003', gender: 'female', dob: '1990-11-08', phone: '(555) 456-7890', email: 'sarah.kim@email.com', referringPhysician: 'Dr. James Liu', referralReason: 'Multiple sclerosis management' } },
  { time: '10:15', duration: 45, type: 'new-consult', status: 'scheduled', site: 'Meridian Neurology', reason: 'Seizure evaluation', patient: { firstName: 'James', lastName: 'Wilson', mrn: 'MRN-2024-014', gender: 'male', dob: '1972-04-30', phone: '(555) 567-8901', email: 'james.wilson@email.com', referringPhysician: 'Dr. Emily Hart', referralReason: 'New-onset seizure workup' } },
  { time: '11:00', duration: 30, type: 'follow-up', status: 'confirmed', site: 'Meridian Neurology', reason: 'Migraine management', patient: { firstName: 'Maria', lastName: 'Garcia', mrn: 'MRN-2024-005', gender: 'female', dob: '1995-09-12', phone: '(555) 678-9012', email: 'maria.garcia@email.com', referringPhysician: 'Dr. David Park', referralReason: 'Chronic migraine follow-up' } },
  { time: '13:30', duration: 45, type: 'new-consult', status: 'scheduled', site: 'Meridian Neurology', reason: 'Memory concerns', patient: { firstName: 'David', lastName: 'Thompson', mrn: 'MRN-2024-016', gender: 'male', dob: '1950-02-18', phone: '(555) 789-0123', email: 'david.thompson@email.com', referringPhysician: 'Dr. Lisa Wong', referralReason: 'Cognitive decline evaluation' } },
  { time: '14:15', duration: 30, type: 'follow-up', status: 'confirmed', site: 'Meridian Neurology', reason: 'Epilepsy med review', patient: { firstName: 'Helen', lastName: 'Park', mrn: 'MRN-2024-007', gender: 'female', dob: '1988-06-25', phone: '(555) 890-1234', email: 'helen.park@email.com', referringPhysician: 'Dr. Robert Kim', referralReason: 'Seizure medication adjustment' } },
  { time: '15:00', duration: 30, type: 'follow-up', status: 'in-progress', site: 'Meridian Neurology', reason: 'Essential tremor', patient: { firstName: 'Frank', lastName: 'Russo', mrn: 'MRN-2024-008', gender: 'male', dob: '1965-12-03', phone: '(555) 901-2345', email: 'frank.russo@email.com', referringPhysician: 'Dr. Anna Martinez', referralReason: 'ET management' } },
]

/** Generate demo appointments anchored to a specific date */
function generateDemoAppointments(dateStr: string) {
  return DEMO_TEMPLATES.map((t, i) => ({
    id: `demo-${dateStr}-${i}`,
    appointmentDate: dateStr,
    appointmentTime: t.time,
    durationMinutes: t.duration,
    appointmentType: t.type,
    status: t.status,
    hospitalSite: t.site,
    reasonForVisit: t.reason,
    schedulingNotes: null,
    visitId: null,
    priorVisitId: null,
    patient: {
      id: `demo-patient-${i}`,
      mrn: t.patient.mrn,
      firstName: t.patient.firstName,
      lastName: t.patient.lastName,
      name: `${t.patient.firstName} ${t.patient.lastName}`,
      dateOfBirth: t.patient.dob,
      age: Math.floor((Date.now() - new Date(t.patient.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)),
      gender: t.patient.gender,
      phone: t.patient.phone,
      email: t.patient.email,
      referringPhysician: t.patient.referringPhysician,
      referralReason: t.patient.referralReason,
    },
    priorVisit: null,
  }))
}

/** Generate demo appointments for a date range (weekdays only) */
function generateDemoForRange(startDate: string, endDate: string) {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  const all: ReturnType<typeof generateDemoAppointments> = []
  const current = new Date(start)
  while (current <= end) {
    const dow = current.getDay()
    if (dow >= 1 && dow <= 5) {
      const ds = current.toISOString().split('T')[0]
      all.push(...generateDemoAppointments(ds))
    }
    current.setDate(current.getDate() + 1)
  }
  return all
}

// GET /api/appointments - Get appointments with optional filters
export async function GET(request: NextRequest) {
  try {
    // Auth is optional for GET (demo app) — allow anonymous reads
    await getUser().catch(() => null)

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const patientId = searchParams.get('patientId')
    const status = searchParams.get('status')
    const date = searchParams.get('date') // Single date query

    // Build SQL with JOINs (replaces Supabase nested relation syntax)
    const conditions: string[] = []
    const values: unknown[] = []
    let paramIdx = 0

    if (date) {
      conditions.push(`a."appointment_date" = $${++paramIdx}`)
      values.push(date)
    } else if (startDate && endDate) {
      conditions.push(`a."appointment_date" >= $${++paramIdx}`)
      values.push(startDate)
      conditions.push(`a."appointment_date" <= $${++paramIdx}`)
      values.push(endDate)
    } else if (startDate) {
      conditions.push(`a."appointment_date" >= $${++paramIdx}`)
      values.push(startDate)
    }

    if (patientId) {
      conditions.push(`a."patient_id" = $${++paramIdx}`)
      values.push(patientId)
    }

    if (status && status !== 'All') {
      conditions.push(`a."status" = $${++paramIdx}`)
      values.push(status.toLowerCase())
    }

    const whereClause = conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''

    const sql = `
      SELECT
        a.*,
        row_to_json(p.*) AS patient,
        row_to_json(v.*) AS prior_visit,
        cn."ai_summary" AS prior_visit_ai_summary
      FROM "appointments" a
      LEFT JOIN "patients" p ON p."id" = a."patient_id"
      LEFT JOIN "visits" v ON v."id" = a."prior_visit_id"
      LEFT JOIN "clinical_notes" cn ON cn."visit_id" = v."id"
      ${whereClause}
      ORDER BY a."appointment_date" ASC, a."appointment_time" ASC
    `

    let appointments: any[] = []
    try {
      const pool = await getPool()
      const { rows } = await pool.query(sql, values)

      // Transform data to match frontend expectations
      appointments = (rows || []).map((apt: any) => ({
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
          aiSummary: apt.prior_visit_ai_summary || null,
        } : null,
      }))
    } catch (dbError) {
      console.error('DB query failed, using demo data:', dbError)
    }

    // Fallback: generate demo appointments when DB has none for the requested range
    if (appointments.length === 0 && !patientId) {
      if (date) {
        appointments = generateDemoAppointments(date)
      } else if (startDate && endDate) {
        appointments = generateDemoForRange(startDate, endDate)
      } else if (startDate) {
        appointments = generateDemoAppointments(startDate)
      } else {
        // No date filter — generate for today
        const today = new Date().toISOString().split('T')[0]
        appointments = generateDemoAppointments(today)
      }
    }

    return NextResponse.json({ appointments })
  } catch (error) {
    console.error('Error in appointments API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/appointments - Create a new appointment
export async function POST(request: NextRequest) {
  try {

    // Check authentication
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      patientId,
      appointmentDate,
      appointmentTime,
      durationMinutes = 30,
      appointmentType,
      hospitalSite = 'Meridian Neurology',
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
    const { data, error } = await from('appointments')
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
