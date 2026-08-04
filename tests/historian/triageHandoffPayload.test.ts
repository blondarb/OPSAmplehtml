import { describe, expect, it } from 'vitest'

import { buildHistorianReferralContext } from '@/lib/historian/referralContext'
import { buildTriageHandoffReferral } from '@/lib/historian/referralHandoff'
import type { ClinicalExtraction, TriageResult } from '@/lib/triage/types'

/**
 * The triage → historian handoff has one failure mode that is invisible on
 * screen: a payload that carries no usable focus. The interview still starts,
 * the consent gate still works, the button still lights up — and the historian
 * simply is not steered by the referral. Nothing about the UI looks wrong.
 *
 * This repo has no DOM test environment, so a click cannot be simulated. What
 * CAN be pinned down is the payload shape and, more importantly, that it
 * survives `buildHistorianReferralContext` with a non-null focus — which is the
 * property that actually makes the demo work.
 */

function triageResult(over: Partial<TriageResult> = {}): TriageResult {
  return {
    triage_tier: 'urgent',
    triage_tier_display: 'Tier 2 of 7 — Urgent',
    subspecialty_recommendation: 'Headache Medicine',
    clinical_reasons: ['Chronic migraine with medication overuse', 'Failed topiramate'],
    red_flags: [],
    ...over,
  } as unknown as TriageResult
}

function extraction(): ClinicalExtraction {
  return {
    key_findings: {
      chief_complaint: 'Worsening headaches',
      neurological_symptoms: ['photophobia', 'nausea'],
    },
  } as unknown as ClinicalExtraction
}

describe('buildTriageHandoffReferral', () => {
  it('carries the triage fields the historian actually steers on', () => {
    const referral = buildTriageHandoffReferral(triageResult(), extraction(), 'RAW NOTE TEXT')

    expect(referral.steer).toBe('directive')
    expect(referral.noteText).toBe('RAW NOTE TEXT')
    expect(referral.triage?.subspecialty).toBe('Headache Medicine')
    expect(referral.triage?.clinicalReasons?.[0]).toBe('Chronic migraine with medication overuse')
    expect(referral.triage?.tierDisplay).toBe('Tier 2 of 7 — Urgent')
    expect(referral.extraction?.chief_complaint).toBe('Worsening headaches')
  })

  it('leaves includeRawNote unset so referralContext.ts owns the BAA default', () => {
    // Setting this explicitly here would silently pin the default and defeat
    // the single place that comment lives. It must stay undefined.
    const referral = buildTriageHandoffReferral(triageResult(), extraction(), 'note')
    expect(referral.includeRawNote).toBeUndefined()
  })

  it('produces a NON-NULL focus — the property that makes the interview directed', () => {
    const referral = buildTriageHandoffReferral(triageResult(), extraction(), 'note')
    const ctx = buildHistorianReferralContext(referral)

    expect(ctx.referralFocus).not.toBeNull()
    // deriveFocus prefers subspecialty + first clinical reason over anything
    // derived from the raw note — that preference is the whole reason a
    // handoff beats pasting the note.
    expect(ctx.referralFocus).toBe('Headache Medicine — Chronic migraine with medication overuse')
  })

  it('still yields a focus from the extraction when triage routing is empty', () => {
    // The silent-failure case: no subspecialty, no clinical reasons. The
    // extraction fallback must keep the interview steered.
    const referral = buildTriageHandoffReferral(
      triageResult({ subspecialty_recommendation: '', clinical_reasons: [] }),
      extraction(),
      'note',
    )
    const ctx = buildHistorianReferralContext(referral)
    expect(ctx.referralFocus).not.toBeNull()
    expect(ctx.referralFocus).toContain('Worsening headaches')
  })

  it('survives a null extraction (legacy non-extraction path)', () => {
    const referral = buildTriageHandoffReferral(triageResult(), null, 'note')
    expect(referral.extraction).toBeUndefined()
    expect(buildHistorianReferralContext(referral).referralFocus).not.toBeNull()
  })

  it('omits noteText rather than sending an empty string', () => {
    const referral = buildTriageHandoffReferral(triageResult(), extraction(), '')
    expect(referral.noteText).toBeUndefined()
  })
})
