import { NextRequest, NextResponse } from 'next/server'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { getPool } from '@/lib/db'
import { from } from '@/lib/db-query'

// GET /api/patients/[id] - Get patient with full history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await authorizeClinicalAccess({
      action: 'patient.read',
      allowedRoles: ['viewer', 'scheduler', 'clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }
    const { id } = await params

    // Fetch patient basic info
    const { data: patient, error: patientError } = await from('patients')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', access.context.tenantId)
      .single()

    if (patientError || !patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    // Fetch medications
    const { data: medications } = await from('patient_medications')
      .select('*')
      .eq('patient_id', id)
      .eq('tenant_id', access.context.tenantId)
      .eq('is_active', true)
      .order('medication_name')

    // Fetch allergies
    const { data: allergies } = await from('patient_allergies')
      .select('*')
      .eq('patient_id', id)
      .eq('tenant_id', access.context.tenantId)
      .eq('is_active', true)
      .order('allergen')

    // Fetch visits with clinical notes via SQL JOIN
    const pool = await getPool()
    const { rows: visits } = await pool.query(`
      SELECT
        v.*,
        (SELECT json_agg(cn.*)
           FROM "clinical_notes" cn
          WHERE cn."visit_id" = v."id"
            AND cn."tenant_id" = $2) AS clinical_notes
      FROM "visits" v
      WHERE v."patient_id" = $1
        AND v."tenant_id" = $2
      ORDER BY v."visit_date" DESC
      LIMIT 10
    `, [id, access.context.tenantId])

    // Fetch appointments
    const { data: appointments } = await from('appointments')
      .select('*')
      .eq('patient_id', id)
      .eq('tenant_id', access.context.tenantId)
      .order('appointment_date', { ascending: false })
      .limit(20)

    // Fetch scale results
    const { data: scaleResults } = await from('scale_results')
      .select('*')
      .eq('patient_id', id)
      .eq('tenant_id', access.context.tenantId)
      .order('completed_at', { ascending: false })
      .limit(20)

    // Fetch imaging studies
    const { data: imagingStudies } = await from('imaging_studies')
      .select('*')
      .eq('patient_id', id)
      .eq('tenant_id', access.context.tenantId)
      .order('study_date', { ascending: false })
      .limit(20)

    // Calculate age
    const age = patient.date_of_birth
      ? Math.floor((Date.now() - new Date(patient.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null

    // Transform patient data
    const transformedPatient = {
      id: patient.id,
      mrn: patient.mrn,
      firstName: patient.first_name,
      lastName: patient.last_name,
      name: `${patient.first_name} ${patient.last_name}`,
      dateOfBirth: patient.date_of_birth,
      age,
      gender: patient.gender,
      phone: patient.phone,
      email: patient.email,
      address: patient.address,
      insuranceProvider: patient.insurance_provider,
      insuranceId: patient.insurance_id,
      primaryCarePhysician: patient.primary_care_physician,
      referringPhysician: patient.referring_physician,
      referralReason: patient.referral_reason,
      referralDate: patient.referral_date,
      emergencyContactName: patient.emergency_contact_name,
      emergencyContactPhone: patient.emergency_contact_phone,
    }

    // Transform medications
    const transformedMedications = (medications || []).map((med: Record<string, unknown>) => ({
      id: med.id,
      name: med.medication_name,
      dosage: med.dosage,
      frequency: med.frequency,
      route: med.route,
      startDate: med.start_date,
      prescriber: med.prescriber,
      notes: med.notes,
    }))

    // Transform allergies
    const transformedAllergies = (allergies || []).map((allergy: Record<string, unknown>) => ({
      id: allergy.id,
      allergen: allergy.allergen,
      reaction: allergy.reaction,
      severity: allergy.severity,
    }))

    // Transform visits with clinical notes
    // clinical_notes is an object (unique FK on visit_id) not array
    const transformedVisits = (visits || []).map((visit: Record<string, unknown>) => {
      const rawNote = Array.isArray(visit.clinical_notes)
        ? visit.clinical_notes[0]
        : visit.clinical_notes
      const note = rawNote && typeof rawNote === 'object'
        ? rawNote as Record<string, unknown>
        : null
      return {
        id: visit.id,
        visitDate: visit.visit_date,
        visitType: visit.visit_type,
        chiefComplaint: visit.chief_complaint,
        status: visit.status,
        providerName: visit.provider_name,
        clinicalNote: note ? {
          id: note.id,
          hpi: note.hpi,
          ros: note.ros,
          physicalExam: note.physical_exam,
          examFreeText: note.exam_free_text,
          assessment: note.assessment,
          plan: note.plan,
          aiSummary: note.ai_summary,
          status: note.status,
        } : null,
      }
    })

    // Transform scale results for score history
    const scoreHistory = (scaleResults || []).map((result: Record<string, unknown>) => {
      const scaleType = typeof result.scale_id === 'string'
        ? result.scale_id
          .toUpperCase()
          .replace('PHQ9', 'PHQ-9')
          .replace('GAD7', 'GAD-7')
          .replace('HIT6', 'HIT-6')
        : null

      return {
        id: result.id,
        scaleType,
        score: result.raw_score,
        maxScore: result.max_score,
        interpretation: result.interpretation,
        severity: result.severity,
        completedAt: result.completed_at,
      }
    })

    return NextResponse.json({
      patient: transformedPatient,
      medications: transformedMedications,
      allergies: transformedAllergies,
      visits: transformedVisits,
      appointments: appointments || [],
      scoreHistory,
      imagingStudies: imagingStudies || [],
    })
  } catch {
    console.error('[patients/id] request failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
