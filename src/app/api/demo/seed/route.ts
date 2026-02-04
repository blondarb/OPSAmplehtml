import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantServer } from '@/lib/tenant'

// TypeScript interfaces for the seed payload
interface SeedMedication {
  medication_name: string
  generic_name?: string
  dosage?: string
  frequency?: string
  route?: string
  indication?: string
  prescriber?: string
  start_date?: string
  status?: string
}

interface SeedAllergy {
  allergen: string
  allergen_type?: string
  reaction?: string
  severity?: string
}

interface SeedDiagnosis {
  icd10_code: string
  description: string
  is_primary?: boolean
}

interface SeedClinicalNote {
  hpi?: string
  ros?: string
  ros_details?: string
  allergies?: string
  allergy_details?: string
  history_available?: string
  history_details?: string
  assessment?: string
  plan?: string
  vitals?: { bp?: string; hr?: string; temp?: string; weight?: string; bmi?: string }
  physical_exam?: Record<string, unknown>
  exam_free_text?: string
  ai_summary?: string
}

interface SeedPriorVisit {
  visitDate: string
  visitType: string
  chiefComplaint: string[]
  clinicalNote: SeedClinicalNote
  diagnoses?: SeedDiagnosis[]
  imagingStudies?: {
    study_type: string
    study_date: string
    description: string
    findings?: string
    impression?: string
  }[]
}

interface SeedAppointment {
  appointmentDate: string
  appointmentTime: string
  appointmentType: string
  hospitalSite?: string
  reasonForVisit?: string
  durationMinutes?: number
  schedulingNotes?: string
}

interface SeedPatient {
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: string
  mrn?: string
  phone?: string
  email?: string
  address?: string
  referringPhysician?: string
  referralReason?: string
  medications?: SeedMedication[]
  allergies?: SeedAllergy[]
  priorVisits?: SeedPriorVisit[]
  appointment?: SeedAppointment
}

interface SeedPayload {
  patients: SeedPatient[]
}

// POST /api/demo/seed - Create demo patients with full clinical histories
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const tenant_id = getTenantServer()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: SeedPayload = await request.json()
    const results: { patientName: string; patientId: string; visitsCreated: number; appointmentCreated: boolean }[] = []

    for (const patientData of body.patients) {
      // Generate MRN if not provided (use DEMO- prefix for easy cleanup)
      const mrn = patientData.mrn || `DEMO-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`

      // Step 1: Insert patient
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .insert({
          user_id: user.id,
          tenant_id,
          mrn,
          first_name: patientData.firstName,
          last_name: patientData.lastName,
          date_of_birth: patientData.dateOfBirth,
          gender: patientData.gender,
          phone: patientData.phone || null,
          email: patientData.email || null,
          address: patientData.address || null,
          referring_physician: patientData.referringPhysician || null,
          referral_reason: patientData.referralReason || null,
        })
        .select('id')
        .single()

      if (patientError || !patient) {
        console.error(`Error creating patient ${patientData.firstName} ${patientData.lastName}:`, patientError)
        continue
      }

      const patientId = patient.id

      // Step 2: Insert medications
      if (patientData.medications && patientData.medications.length > 0) {
        const medRows = patientData.medications.map(med => ({
          patient_id: patientId,
          tenant_id,
          medication_name: med.medication_name,
          generic_name: med.generic_name || null,
          dosage: med.dosage || null,
          frequency: med.frequency || null,
          route: med.route || 'PO',
          indication: med.indication || null,
          prescriber: med.prescriber || null,
          start_date: med.start_date || null,
          status: med.status || 'active',
          source: 'manual',
          confirmed_by_user: true,
        }))

        const { error: medError } = await supabase.from('patient_medications').insert(medRows)
        if (medError) {
          console.error(`Error inserting medications for ${patientData.firstName}:`, medError)
        }
      }

      // Step 3: Insert allergies
      if (patientData.allergies && patientData.allergies.length > 0) {
        const allergyRows = patientData.allergies.map(allergy => ({
          patient_id: patientId,
          tenant_id,
          allergen: allergy.allergen,
          allergen_type: allergy.allergen_type || 'drug',
          reaction: allergy.reaction || null,
          severity: allergy.severity || 'unknown',
          source: 'manual',
          confirmed_by_user: true,
          is_active: true,
        }))

        const { error: allergyError } = await supabase.from('patient_allergies').insert(allergyRows)
        if (allergyError) {
          console.error(`Error inserting allergies for ${patientData.firstName}:`, allergyError)
        }
      }

      // Step 4: Insert prior visits (oldest first to establish chronology)
      let lastVisitId: string | null = null
      const priorVisits = patientData.priorVisits || []
      // Sort by date ascending (oldest first)
      priorVisits.sort((a, b) => new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime())

      for (const pv of priorVisits) {
        // Insert visit
        const { data: visit, error: visitError } = await supabase
          .from('visits')
          .insert({
            patient_id: patientId,
            user_id: user.id,
            tenant_id,
            visit_date: pv.visitDate,
            visit_type: pv.visitType,
            chief_complaint: pv.chiefComplaint || [],
            status: 'completed',
          })
          .select('id')
          .single()

        if (visitError || !visit) {
          console.error(`Error creating prior visit:`, visitError)
          continue
        }

        lastVisitId = visit.id

        // Insert clinical note (signed)
        const note = pv.clinicalNote
        const signedAt = new Date(pv.visitDate)
        signedAt.setHours(signedAt.getHours() + 1) // Signed 1 hour after visit

        const { error: noteError } = await supabase
          .from('clinical_notes')
          .insert({
            visit_id: visit.id,
            tenant_id,
            hpi: note.hpi || null,
            ros: note.ros || null,
            ros_details: note.ros_details || null,
            allergies: note.allergies || null,
            allergy_details: note.allergy_details || null,
            history_available: note.history_available || null,
            history_details: note.history_details || null,
            assessment: note.assessment || null,
            plan: note.plan || null,
            vitals: note.vitals || null,
            physical_exam: note.physical_exam || null,
            exam_free_text: note.exam_free_text || null,
            ai_summary: note.ai_summary || null,
            is_signed: true,
            signed_at: signedAt.toISOString(),
            status: 'signed',
          })

        if (noteError) {
          console.error(`Error creating clinical note:`, noteError)
        }

        // Insert diagnoses
        if (pv.diagnoses && pv.diagnoses.length > 0) {
          const dxRows = pv.diagnoses.map(dx => ({
            visit_id: visit.id,
            patient_id: patientId,
            tenant_id,
            icd10_code: dx.icd10_code,
            description: dx.description,
            is_primary: dx.is_primary || false,
          }))

          const { error: dxError } = await supabase.from('diagnoses').insert(dxRows)
          if (dxError) {
            console.error(`Error inserting diagnoses:`, dxError)
          }
        }

        // Insert imaging studies
        if (pv.imagingStudies && pv.imagingStudies.length > 0) {
          const imgRows = pv.imagingStudies.map(img => ({
            patient_id: patientId,
            tenant_id,
            study_type: img.study_type,
            study_date: img.study_date,
            description: img.description,
            findings: img.findings || null,
            impression: img.impression || null,
          }))

          const { error: imgError } = await supabase.from('imaging_studies').insert(imgRows)
          if (imgError) {
            console.error(`Error inserting imaging studies:`, imgError)
          }
        }
      }

      // Step 5: Insert appointment for the demo day
      let appointmentCreated = false
      if (patientData.appointment) {
        const appt = patientData.appointment
        const { error: apptError } = await supabase
          .from('appointments')
          .insert({
            tenant_id,
            patient_id: patientId,
            created_by: user.id,
            appointment_date: appt.appointmentDate,
            appointment_time: appt.appointmentTime,
            appointment_type: appt.appointmentType,
            duration_minutes: appt.durationMinutes || 30,
            hospital_site: appt.hospitalSite || 'Meridian Neurology',
            reason_for_visit: appt.reasonForVisit || null,
            scheduling_notes: appt.schedulingNotes || null,
            status: 'scheduled',
            // Link follow-up appointments to the most recent prior visit
            prior_visit_id: appt.appointmentType === 'follow-up' ? lastVisitId : null,
          })

        if (apptError) {
          console.error(`Error creating appointment:`, apptError)
        } else {
          appointmentCreated = true
        }
      }

      results.push({
        patientName: `${patientData.firstName} ${patientData.lastName}`,
        patientId,
        visitsCreated: priorVisits.length,
        appointmentCreated,
      })
    }

    return NextResponse.json({
      message: `Successfully seeded ${results.length} patients`,
      patients: results,
    })
  } catch (error) {
    console.error('Error in demo seed API:', error)
    return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 })
  }
}
