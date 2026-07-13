import { describe, expect, it } from 'vitest'

import { emergencyContactStatuses } from '@/lib/triage/emergencyActionClient'

describe('EmergencyActionPanel contact evidence mapping', () => {
  it('maps failed contact outcomes to failed delivery without understanding', () => {
    expect(emergencyContactStatuses('no_answer')).toEqual({
      delivery_status: 'failed',
      understanding_status: 'not_confirmed',
    })
  })

  it('maps a message left without manufacturing confirmed understanding', () => {
    expect(emergencyContactStatuses('message_left')).toEqual({
      delivery_status: 'delivered',
      understanding_status: 'not_confirmed',
    })
  })

  it('uses not-applicable evidence only for emergency-service activation', () => {
    expect(emergencyContactStatuses('emergency_services_activated')).toEqual({
      delivery_status: 'not_applicable',
      understanding_status: 'not_applicable',
    })
    expect(emergencyContactStatuses('instructions_delivered')).toEqual({
      delivery_status: 'delivered',
      understanding_status: 'confirmed',
    })
  })
})
