import { describe, expect, it } from 'vitest'

import { buildHistorianSystemPrompt } from '@/lib/historianPrompts'

const FOCUS = 'Neuromuscular — Progressive proximal weakness with elevated CK'

describe('referral-directed prompt', () => {
  it('adds the directive block when a focus is supplied', () => {
    const prompt = buildHistorianSystemPrompt('new_patient', 'weakness', 'ctx', undefined, FOCUS)
    expect(prompt).toContain('REFERRAL-DIRECTED PRIORITY')
    expect(prompt).toContain(FOCUS)
  })

  it('omits the directive block entirely when there is no focus', () => {
    const prompt = buildHistorianSystemPrompt('new_patient', 'weakness', 'ctx', undefined, null)
    expect(prompt).not.toContain('REFERRAL-DIRECTED PRIORITY')
  })

  it('carves the emergency screen out of the directive budget', () => {
    const prompt = buildHistorianSystemPrompt('new_patient', 'weakness', 'ctx', undefined, FOCUS)
    expect(prompt).toContain('does NOT count toward the referral-directed questions')
  })

  it('states the 6-8 question directive budget and preserves the 25-turn limit', () => {
    const prompt = buildHistorianSystemPrompt('new_patient', 'weakness', 'ctx', undefined, FOCUS)
    expect(prompt).toContain('6 to 8')
    expect(prompt).toContain('Never exceed 25 turns total')
  })

  it('instructs the model to follow the patient over the referral', () => {
    const prompt = buildHistorianSystemPrompt('new_patient', 'weakness', 'ctx', undefined, FOCUS)
    expect(prompt).toContain('not a confirmed diagnosis')
    expect(prompt).toContain('follow the patient')
  })

  it('never adds the directive block to referral_clarification (scope-locked mode)', () => {
    const prompt = buildHistorianSystemPrompt(
      'referral_clarification',
      'weakness',
      'ctx',
      [{ id: 'q1', code: 'c1', text: 'Any fevers?' }],
      FOCUS,
    )
    expect(prompt).not.toContain('REFERRAL-DIRECTED PRIORITY')
  })
})
