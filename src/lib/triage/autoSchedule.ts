/**
 * Auto-schedule helper for urgent/emergent triage results.
 *
 * Creates an AI-suggested appointment in the appointments table.
 * Staff must review and confirm before the appointment is active.
 *
 * Non-throwing — logs errors and returns null on failure.
 */

import { from } from '@/lib/db-query'

interface ScheduledAppointment {
  id: string
  appointment_date: string
  appointment_type: string
}

/**
 * Create an AI-suggested appointment for urgent+ triage results.
 * Returns the created appointment record, or null if the tier does
 * not qualify or the insert fails.
 */
export async function autoScheduleFromTriage(
  triageSessionId: string,
  tier: string,
  patientId: string,
  clinicalReasons: string[],
  subspecialtyRecommendation: string,
): Promise<ScheduledAppointment | null> {
  try {
    const urgentTiers = ['urgent', 'emergent', 'critical']
    if (!urgentTiers.includes(tier.toLowerCase())) {
      return null
    }

    const lowerTier = tier.toLowerCase()
    let suggestedDate: string
    let appointmentType: string

    if (lowerTier === 'emergent' || lowerTier === 'critical') {
      suggestedDate = new Date().toISOString().split('T')[0]
      appointmentType = 'urgent-consult'
    } else {
      const nextWeek = new Date()
      nextWeek.setDate(nextWeek.getDate() + 7)
      suggestedDate = nextWeek.toISOString().split('T')[0]
      appointmentType = 'new-consult'
    }

    const reason =
      subspecialtyRecommendation ||
      clinicalReasons.join('; ') ||
      'Urgent triage result — review needed'

    const { data, error } = await from('appointments')
      .insert({
        patient_id: patientId,
        appointment_date: suggestedDate,
        appointment_time: '09:00',
        duration_minutes: 45,
        appointment_type: appointmentType,
        status: 'pending-review',
        hospital_site: 'Meridian Neurology',
        reason_for_visit: reason,
        scheduling_notes: `AI-suggested: ${tier} triage result (session ${triageSessionId}). Staff review required before confirming.`,
      })
      .select('id, appointment_date, appointment_type')
      .single()

    if (error) {
      console.error('[autoSchedule] insert error:', error)
      return null
    }

    console.log(
      `[autoSchedule] AI-suggested ${appointmentType} created for patient ${patientId} on ${suggestedDate}`,
    )
    return data as ScheduledAppointment
  } catch (err) {
    console.error('[autoSchedule] exception:', err)
    return null
  }
}
