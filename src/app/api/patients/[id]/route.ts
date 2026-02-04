import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/patients/[id] - Get patient with full history
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

    // Fetch patient basic info
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('*')
      .eq('id', id)
      .single()

    if (patientError || !patient) {
      console.error('Error fetching patient:', patientError)
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    // Fetch medications
    const { data: medications } = await supabase
      .from('patient_medications')
      .select('*')
      .eq('patient_id', id)
      .eq('is_active', true)
      .order('medication_name')

    // Fetch allergies
    const { data: allergies } = await supabase
      .from('patient_allergies')
      .select('*')
      .eq('patient_id', id)
      .eq('is_active', true)
      .order('allergen')

    // Fetch visits with clinical notes
    const { data: visits } = await supabase
      .from('visits')
      .select(`
        *,
        clinical_notes (*)
      `)
      .eq('patient_id', id)
      .order('visit_date', { ascending: false })
      .limit(10)

    // Fetch appointments
    const { data: appointments } = await supabase
      .from('appointments')
      .select('*')
      .eq('patient_id', id)
      .order('appointment_date', { ascending: false })
      .limit(20)

    // Fetch scale results
    const { data: scaleResults } = await supabase
      .from('scale_results')
      .select('*')
      .eq('patient_id', id)
      .order('completed_at', { ascending: false })
      .limit(20)

    // Fetch imaging studies
    const { data: imagingStudies } = await supabase
      .from('imaging_studies')
      .select('*')
      .eq('patient_id', id)
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
    const transformedMedications = (medications || []).map(med => ({
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
    const transformedAllergies = (allergies || []).map(allergy => ({
      id: allergy.id,
      allergen: allergy.allergen,
      reaction: allergy.reaction,
      severity: allergy.severity,
    }))

    // Transform visits with clinical notes
    // Supabase returns clinical_notes as object (unique FK on visit_id) not array
    const transformedVisits = (visits || []).map(visit => {
      const note = Array.isArray(visit.clinical_notes)
        ? visit.clinical_notes[0]
        : visit.clinical_notes
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
    const scoreHistory = (scaleResults || []).map(result => ({
      id: result.id,
      scaleType: result.scale_id?.toUpperCase().replace('PHQ9', 'PHQ-9').replace('GAD7', 'GAD-7').replace('HIT6', 'HIT-6'),
      score: result.raw_score,
      maxScore: result.max_score,
      interpretation: result.interpretation,
      severity: result.severity,
      completedAt: result.completed_at,
    }))

    return NextResponse.json({
      patient: transformedPatient,
      medications: transformedMedications,
      allergies: transformedAllergies,
      visits: transformedVisits,
      appointments: appointments || [],
      scoreHistory,
      imagingStudies: imagingStudies || [],
    })
  } catch (error) {
    console.error('Error in patient API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
