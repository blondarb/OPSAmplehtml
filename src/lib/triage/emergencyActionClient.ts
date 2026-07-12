export type EmergencyContactOutcome =
  | 'instructions_delivered'
  | 'no_answer'
  | 'message_left'
  | 'handoff_initiated'
  | 'emergency_services_activated'
  | 'patient_declined'
  | 'provider_contacted'
  | 'contact_failed'

export function emergencyContactStatuses(
  outcome: EmergencyContactOutcome,
): {
  delivery_status: 'delivered' | 'failed' | 'not_applicable'
  understanding_status: 'confirmed' | 'not_confirmed' | 'not_applicable'
} {
  if (outcome === 'emergency_services_activated') {
    return {
      delivery_status: 'not_applicable',
      understanding_status: 'not_applicable',
    }
  }
  if (outcome === 'no_answer' || outcome === 'contact_failed') {
    return {
      delivery_status: 'failed',
      understanding_status: 'not_confirmed',
    }
  }
  if (outcome === 'message_left') {
    return {
      delivery_status: 'delivered',
      understanding_status: 'not_confirmed',
    }
  }
  return {
    delivery_status: 'delivered',
    understanding_status: 'confirmed',
  }
}
