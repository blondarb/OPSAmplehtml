import { describe, expect, it } from 'vitest'

import { getConsultActiveStep } from '../workflow'

describe('getConsultActiveStep', () => {
  it.each([null, 'triage_pending', 'triage_complete'] as const)(
    'keeps %s at triage without an explicit Historian authorization',
    (status) => {
      expect(
        getConsultActiveStep(status, {
          allowed: false,
          reason: 'workflow_not_patient_clarification',
        }),
      ).toBe('triage')
    },
  )

  it('advances a clinician-approved patient clarification to Historian', () => {
    expect(
      getConsultActiveStep('triage_complete', { allowed: true }),
    ).toBe('historian')
  })

  it.each([
    'intake_pending',
    'intake_in_progress',
    'intake_complete',
    'historian_pending',
    'historian_in_progress',
  ] as const)('returns a revoked or held %s session to the safety hold', (status) => {
    expect(
      getConsultActiveStep(status, {
        allowed: false,
        reason: 'time_critical_review_unresolved',
      }),
    ).toBe('triage')
  })

  it('allows completed Historian output to enter clinician review tools', () => {
    expect(
      getConsultActiveStep('historian_complete', { allowed: false }),
    ).toBe('patient_tools')
  })

  it.each(['sdne_pending', 'sdne_complete', 'complete'] as const)(
    'keeps downstream %s work at report',
    (status) => {
      expect(getConsultActiveStep(status, { allowed: false })).toBe('report')
    },
  )
})
