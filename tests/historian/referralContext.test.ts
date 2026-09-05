import { describe, expect, it } from 'vitest'

import { buildHistorianReferralContext } from '@/lib/historian/referralContext'

describe('buildHistorianReferralContext', () => {
  it('uses the trimmed short reason for both reason and focus', () => {
    const result = buildHistorianReferralContext({
      steer: 'directive',
      shortReason: '  I have frequent headaches.  ',
    })
    expect(result.referralReason).toBe('I have frequent headaches.')
    expect(result.referralFocus).toBe('I have frequent headaches.')
  })

  it('caps the short reason and focus at 200 characters', () => {
    const result = buildHistorianReferralContext({
      steer: 'directive',
      shortReason: `  ${'X'.repeat(250)}  `,
    })
    expect(result.referralReason).toBe('X'.repeat(200))
    expect(result.referralFocus).toBe('X'.repeat(200))
  })

  it.each(['', '   '])('preserves the fallback for an empty short reason (%j)', (shortReason) => {
    const result = buildHistorianReferralContext({ steer: 'directive', shortReason })
    expect(result.referralReason).toBe('Neurological consultation')
    expect(result.referralFocus).toBeNull()
  })

  it('keeps triage reason and focus ahead of a short reason', () => {
    const result = buildHistorianReferralContext({
      steer: 'directive',
      shortReason: 'I have frequent headaches.',
      triage: { subspecialty: 'Neuromuscular', clinicalReasons: ['Progressive weakness'] },
    })
    expect(result.referralReason).toBe('Progressive weakness')
    expect(result.referralFocus).toBe('Neuromuscular — Progressive weakness')
  })

  it('derives the focus from triage subspecialty + first clinical reason', () => {
    const result = buildHistorianReferralContext({
      steer: 'directive',
      triage: {
        tierDisplay: 'URGENT',
        urgency: 'urgent',
        subspecialty: 'Neuromuscular',
        clinicalReasons: ['Progressive proximal weakness with elevated CK'],
        redFlags: ['Elevated CK with proximal pattern'],
      },
    })
    expect(result.referralFocus).toBe(
      'Neuromuscular — Progressive proximal weakness with elevated CK',
    )
    expect(result.referralReason).toContain('Progressive proximal weakness')
    expect(result.patientContext).toContain('TRIAGE PRIORITY: URGENT')
  })

  it('falls back to extraction chief complaint + symptoms when triage is absent', () => {
    const result = buildHistorianReferralContext({
      steer: 'directive',
      extraction: {
        chief_complaint: 'Progressive difficulty climbing stairs',
        neurological_symptoms: ['proximal weakness', 'falls'],
        timeline: '4 months',
        relevant_history: '',
        medications_and_therapies: [],
        failed_therapies: [],
        imaging_results: [],
        red_flags_noted: ['Two falls on level ground'],
        functional_status: 'Difficulty rising from a chair',
      },
    })
    expect(result.referralFocus).toBe(
      'Progressive difficulty climbing stairs — proximal weakness; falls',
    )
    expect(result.patientContext).toContain('Two falls on level ground')
  })

  it('returns a null focus when there is nothing to steer on', () => {
    const result = buildHistorianReferralContext({ steer: 'directive' })
    expect(result.referralFocus).toBeNull()
    expect(result.referralReason).toBe('Neurological consultation')
  })

  it('includes the raw note by default and omits it when disabled', () => {
    const input = {
      steer: 'directive' as const,
      noteText: 'SYNTHETIC — 58yo with 4 months of proximal weakness. CK 1,240.',
      extraction: {
        chief_complaint: 'Proximal weakness',
        neurological_symptoms: ['weakness'],
        timeline: '4 months',
        relevant_history: '',
        medications_and_therapies: [],
        failed_therapies: [],
        imaging_results: [],
        red_flags_noted: [],
        functional_status: '',
      },
    }
    expect(buildHistorianReferralContext(input).patientContext).toContain('CK 1,240')
    expect(
      buildHistorianReferralContext({ ...input, includeRawNote: false }).patientContext,
    ).not.toContain('CK 1,240')
  })

  it('bounds the raw note so a long packet cannot flood the prompt', () => {
    const result = buildHistorianReferralContext({
      steer: 'directive',
      noteText: 'X'.repeat(10_000),
    })
    expect(result.patientContext.length).toBeLessThan(5_000)
  })
})
