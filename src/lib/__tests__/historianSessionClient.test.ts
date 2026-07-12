import { describe, expect, it } from 'vitest'
import {
  buildHistorianRenewalRequest,
  buildHistorianSessionRequest,
} from '@/lib/historianSessionClient'

describe('Historian client request contracts', () => {
  it('carries the consult ID into the session authorization request', () => {
    expect(
      buildHistorianSessionRequest({
        sessionType: 'referral_clarification',
        referralReason: 'episodic symptoms',
        patientContext: 'stable outpatient',
        provider: 'openai',
        consultId: 'consult-123',
      }),
    ).toEqual({
      sessionType: 'referral_clarification',
      referralReason: 'episodic symptoms',
      patientContext: 'stable outpatient',
      provider: 'openai',
      consult_id: 'consult-123',
    })
  })

  it('carries the consult ID into every purpose-limited renewal', () => {
    expect(
      buildHistorianRenewalRequest(
        'referral_clarification',
        'consult-123',
      ),
    ).toEqual({
      sessionType: 'referral_clarification',
      consult_id: 'consult-123',
    })
  })

  it('does not turn a standalone tracing ID into a consult authorization binding', () => {
    expect(
      buildHistorianSessionRequest({
        sessionType: 'new_patient',
        provider: 'openai',
      }),
    ).not.toHaveProperty('consult_id')
  })
})
