import { describe, expect, it } from 'vitest'

import { buildHistorianContextFromConsult } from '@/lib/consult/contextBuilder'
import type { NeurologyConsult } from '@/lib/consult/types'

/**
 * Guard for the Task 2 refactor: `buildHistorianContextFromConsult` becomes a
 * thin adapter over the shared referral builder. This test is written to pass
 * against the ORIGINAL implementation, so any context /consult loses in the
 * refactor fails here.
 */
const CONSULT = {
  id: 'c1',
  referral_text: 'SYNTHETIC — 58yo, 4 months progressive proximal weakness, CK 1,240.',
  triage_urgency: 'urgent',
  triage_tier_display: 'URGENT',
  triage_summary: 'Triage tier: URGENT\n\nClinical assessment:\n  • Progressive weakness',
  triage_chief_complaint: 'Progressive proximal weakness',
  triage_red_flags: ['Elevated CK with proximal pattern'],
  triage_subspecialty: 'Neuromuscular',
} as unknown as NeurologyConsult

describe('buildHistorianContextFromConsult (adapter)', () => {
  it('keeps the documented return shape', () => {
    const result = buildHistorianContextFromConsult(CONSULT)
    expect(Object.keys(result).sort()).toEqual(['patientContext', 'referralReason'])
    expect(typeof result.referralReason).toBe('string')
    expect(typeof result.patientContext).toBe('string')
  })

  it('still surfaces triage priority, subspecialty and red flags', () => {
    const { referralReason, patientContext } = buildHistorianContextFromConsult(CONSULT)
    expect(referralReason).toContain('Progressive proximal weakness')
    expect(patientContext).toContain('URGENT')
    expect(patientContext).toContain('Neuromuscular')
    expect(patientContext).toContain('Elevated CK with proximal pattern')
  })

  it('still carries the triage summary through', () => {
    const { patientContext } = buildHistorianContextFromConsult(CONSULT)
    expect(patientContext).toContain('TRIAGE SUMMARY')
    expect(patientContext).toContain('Clinical assessment')
  })

  it('carries intake summary and escalation when present', () => {
    const withIntake = {
      ...CONSULT,
      intake_summary: 'Patient reports difficulty rising from a chair.',
      intake_escalation_level: 'urgent',
    } as unknown as NeurologyConsult
    const { patientContext } = buildHistorianContextFromConsult(withIntake)
    expect(patientContext).toContain('INTAKE AGENT SUMMARY')
    expect(patientContext).toContain('difficulty rising from a chair')
    expect(patientContext).toContain('INTAKE ESCALATION: URGENT')
  })

  it('carries SDNE results when present', () => {
    const withSdne = {
      ...CONSULT,
      sdne_session_flag: 'AMBER',
      sdne_domain_flags: { Gait: 'AMBER', Speech: 'GREEN', Setup: 'NOT_PERFORMED' },
      sdne_detected_patterns: [{ description: 'Proximal weakness pattern', confidence: 'moderate' }],
    } as unknown as NeurologyConsult
    const { patientContext } = buildHistorianContextFromConsult(withSdne)
    expect(patientContext).toContain('SDNE DIGITAL NEUROLOGIC EXAM RESULTS')
    expect(patientContext).toContain('Overall flag: AMBER')
    expect(patientContext).toContain('Gait: AMBER')
    expect(patientContext).not.toContain('Speech: GREEN')
    expect(patientContext).toContain('Proximal weakness pattern')
  })

  it('does not crash on a consult with no triage data', () => {
    const bare = { id: 'c2', referral_text: '' } as unknown as NeurologyConsult
    expect(() => buildHistorianContextFromConsult(bare)).not.toThrow()
  })
})

describe('deriveConsultReferralFocus', () => {
  it('derives the same focus the shared builder would', async () => {
    const { deriveConsultReferralFocus } = await import('@/lib/consult/contextBuilder')
    expect(deriveConsultReferralFocus(CONSULT)).toBe(
      'Neuromuscular — Progressive proximal weakness',
    )
  })

  it('returns null when the consult has no triage routing', async () => {
    const { deriveConsultReferralFocus } = await import('@/lib/consult/contextBuilder')
    const bare = { id: 'c3' } as unknown as NeurologyConsult
    expect(deriveConsultReferralFocus(bare)).toBeNull()
  })
})
