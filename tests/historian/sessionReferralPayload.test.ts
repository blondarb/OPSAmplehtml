import { describe, expect, it } from 'vitest'

import { resolveReferralPayload } from '@/app/api/ai/historian/session/referralPayload'

describe('resolveReferralPayload', () => {
  it('returns null when no referral is supplied', () => {
    expect(resolveReferralPayload({})).toBeNull()
  })

  it('builds context from a valid referral payload', () => {
    const resolved = resolveReferralPayload({
      referral: {
        steer: 'directive',
        triage: { subspecialty: 'Neuromuscular', clinicalReasons: ['Proximal weakness'] },
      },
    })
    expect(resolved?.referralFocus).toBe('Neuromuscular — Proximal weakness')
    expect(resolved?.referralReason).toContain('Proximal weakness')
  })

  it('ignores a malformed referral rather than throwing', () => {
    expect(resolveReferralPayload({ referral: 'not-an-object' })).toBeNull()
    expect(resolveReferralPayload({ referral: { steer: 'nonsense' } })).toBeNull()
    expect(resolveReferralPayload({ referral: null })).toBeNull()
    expect(resolveReferralPayload({ referral: [] })).toBeNull()
  })

  it('accepts a note-only referral (the standalone entry point)', () => {
    const resolved = resolveReferralPayload({
      referral: { steer: 'directive', noteText: 'SYNTHETIC — headache for two years.' },
    })
    expect(resolved).not.toBeNull()
    expect(resolved?.patientContext).toContain('SYNTHETIC')
  })
})
