import { describe, expect, it } from 'vitest'

import {
  EmergencyAlertMessageError,
  parseEmergencyAlertMessage,
  serializeEmergencyAlertMessage,
} from '@/workers/triageEmergencyAlertMessage'

const ALERT_ID = '53000000-0000-4000-8000-000000000201'
const ACTION_ID = '53000000-0000-4000-8000-000000000101'

describe('emergency alert queue message', () => {
  it('round-trips exactly opaque IDs, severity, and bounded level', () => {
    const body = serializeEmergencyAlertMessage({
      alertId: ALERT_ID,
      actionId: ACTION_ID,
      severity: 'emergency',
      level: 2,
    })

    expect(JSON.parse(body)).toEqual({
      alert_id: ALERT_ID,
      action_id: ACTION_ID,
      severity: 'emergency',
      level: 2,
    })
    expect(parseEmergencyAlertMessage(body)).toEqual({
      alert_id: ALERT_ID,
      action_id: ACTION_ID,
      severity: 'emergency',
      level: 2,
    })
    expect(body).not.toMatch(/tenant|patient|source|text|instruction|contact/i)
  })

  it.each([
    ['unknown field', { alert_id: ALERT_ID, action_id: ACTION_ID, severity: 'emergency', level: 1, tenant_id: 'forbidden' }],
    ['bad alert id', { alert_id: 'not-opaque', action_id: ACTION_ID, severity: 'emergency', level: 1 }],
    ['bad action id', { alert_id: ALERT_ID, action_id: 'not-opaque', severity: 'emergency', level: 1 }],
    ['bad severity', { alert_id: ALERT_ID, action_id: ACTION_ID, severity: 'urgent', level: 1 }],
    ['bad level', { alert_id: ALERT_ID, action_id: ACTION_ID, severity: 'emergency', level: 4 }],
  ])('rejects %s', (_label, value) => {
    expect(() => parseEmergencyAlertMessage(JSON.stringify(value))).toThrow(
      EmergencyAlertMessageError,
    )
  })

  it('rejects malformed and oversized bodies', () => {
    expect(() => parseEmergencyAlertMessage('not-json')).toThrow(
      EmergencyAlertMessageError,
    )
    expect(() => parseEmergencyAlertMessage('x'.repeat(257))).toThrow(
      EmergencyAlertMessageError,
    )
  })
})
