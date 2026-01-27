import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/demo/reset - Reset demo data for a fresh walkthrough
export async function POST() {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Known demo patient MRNs - use MRN-based lookup for stability
    const DEMO_MRNS = ['2024-00142', '2024-00089'] // Maria Santos, Robert Chen

    // Look up demo patients by MRN
    const { data: demoPatients } = await supabase
      .from('patients')
      .select('id')
      .in('mrn', DEMO_MRNS)

    const demoPatientIds = (demoPatients || []).map(p => p.id)

    // Step 1: Get all visits for demo patients created during the demo
    // Keep Robert Chen's prior visit from Oct 2025 (visit_date < 2026-01-01)
    const { data: visits } = await supabase
      .from('visits')
      .select('id')
      .in('patient_id', demoPatientIds)
      .gte('visit_date', '2026-01-01')

    const visitIdsToDelete = (visits || []).map(v => v.id)

    // Step 2: Delete clinical notes for those visits
    if (visitIdsToDelete.length > 0) {
      const { error: noteDeleteError } = await supabase
        .from('clinical_notes')
        .delete()
        .in('visit_id', visitIdsToDelete)

      if (noteDeleteError) {
        console.error('Error deleting clinical notes:', noteDeleteError)
      }

      // Step 3: Clear visit_id and prior_visit_id from appointments that reference these visits
      for (const visitId of visitIdsToDelete) {
        await supabase
          .from('appointments')
          .update({ visit_id: null, updated_at: new Date().toISOString() })
          .eq('visit_id', visitId)
        await supabase
          .from('appointments')
          .update({ prior_visit_id: null, updated_at: new Date().toISOString() })
          .eq('prior_visit_id', visitId)
      }

      // Step 4: Delete the visits
      const { error: visitDeleteError } = await supabase
        .from('visits')
        .delete()
        .in('id', visitIdsToDelete)

      if (visitDeleteError) {
        console.error('Error deleting visits:', visitDeleteError)
      }
    }

    // Step 5: Reset all today's appointments for demo patients back to 'scheduled'
    const today = new Date().toISOString().split('T')[0]
    const { error: appointmentResetError } = await supabase
      .from('appointments')
      .update({
        status: 'scheduled',
        visit_id: null,
        updated_at: new Date().toISOString(),
      })
      .in('patient_id', demoPatientIds)
      .eq('appointment_date', today)

    if (appointmentResetError) {
      console.error('Error resetting appointments:', appointmentResetError)
    }

    // Step 6: Delete any follow-up appointments that were created during the demo
    // (appointments scheduled for future dates that aren't the original demo appointments)
    const { data: futureAppointments } = await supabase
      .from('appointments')
      .select('id')
      .in('patient_id', demoPatientIds)
      .gt('appointment_date', today)

    if (futureAppointments && futureAppointments.length > 0) {
      const { error: futureDeleteError } = await supabase
        .from('appointments')
        .delete()
        .in('id', futureAppointments.map(a => a.id))

      if (futureDeleteError) {
        console.error('Error deleting future appointments:', futureDeleteError)
      }
    }

    // Step 7: Clean up dynamically created patients (non-demo patients)
    // Find all patients for this user that are NOT the demo patients
    let dynamicPatientsDeleted = 0
    if (demoPatientIds.length > 0) {
      const { data: dynamicPatients } = await supabase
        .from('patients')
        .select('id')
        .not('id', 'in', `(${demoPatientIds.join(',')})`)

      if (dynamicPatients && dynamicPatients.length > 0) {
        const dynamicIds = dynamicPatients.map(p => p.id)

        // Delete their visits' clinical notes
        const { data: dynamicVisits } = await supabase
          .from('visits')
          .select('id')
          .in('patient_id', dynamicIds)

        if (dynamicVisits && dynamicVisits.length > 0) {
          const dynamicVisitIds = dynamicVisits.map(v => v.id)
          await supabase.from('clinical_notes').delete().in('visit_id', dynamicVisitIds)

          // Clear visit_id refs from appointments before deleting visits
          for (const vId of dynamicVisitIds) {
            await supabase
              .from('appointments')
              .update({ visit_id: null, updated_at: new Date().toISOString() })
              .eq('visit_id', vId)
          }

          await supabase.from('visits').delete().in('id', dynamicVisitIds)
        }

        // Delete their appointments
        await supabase.from('appointments').delete().in('patient_id', dynamicIds)

        // Delete the patients themselves
        const { error: patientDeleteError } = await supabase
          .from('patients')
          .delete()
          .in('id', dynamicIds)

        if (patientDeleteError) {
          console.error('Error deleting dynamic patients:', patientDeleteError)
        }

        dynamicPatientsDeleted = dynamicIds.length
      }
    }

    return NextResponse.json({
      message: 'Demo reset successful',
      cleaned: {
        visitsDeleted: visitIdsToDelete.length,
        appointmentsReset: true,
        futureAppointmentsDeleted: futureAppointments?.length || 0,
        dynamicPatientsDeleted,
      },
    })
  } catch (error) {
    console.error('Error in demo reset API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
