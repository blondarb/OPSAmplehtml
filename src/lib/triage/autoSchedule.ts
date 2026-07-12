/**
 * Auto-schedule helper for urgent/emergent triage results.
 *
 * Creates an AI-suggested appointment in the appointments table.
 * Staff must review and confirm before the appointment is active.
 *
 * Non-throwing — logs errors and returns null on failure.
 */

import { from } from '@/lib/db-query'
import {
  canActivateOutpatientScheduling,
  type SchedulingAuthorization,
} from './workflowPolicy'

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
  authorization: SchedulingAuthorization,
): Promise<ScheduledAppointment | null> {
  try {
    const policy = canActivateOutpatientScheduling(authorization)
    if (!policy.allowed) {
      console.warn('[autoSchedule] blocked by workflow policy', {
        reason: policy.reason,
      })
      return null
    }

    if (tier.toLowerCase() !== 'urgent') {
      return null
    }

    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)
    const suggestedDate = nextWeek.toISOString().split('T')[0]
    const appointmentType = 'new-consult'

    const reason =
      subspecialtyRecommendation ||
      clinicalReasons.join('; ') ||
      'Urgent triage result — review needed'

    const { data, error } = await from('appointments')
      .insert({
        triage_session_id: triageSessionId,
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
      console.error('[autoSchedule] appointment insert failed', {
        code: error.code ?? 'UNKNOWN',
      })
      return null
    }

    console.info('[autoSchedule] pending-review suggestion created')
    return data as ScheduledAppointment
  } catch {
    console.error('[autoSchedule] unexpected scheduling failure')
    return null
  }
}
