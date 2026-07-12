import { describe, expect, it } from 'vitest'

import { nextStepAfterExtraction } from '@/lib/triage/referralFlowPolicy'

describe('canonical referral flow', () => {
  it('requires review for an ordinary complete extraction', () => {
    expect(
      nextStepAfterExtraction({
        packet_safety: undefined,
        coverage_status: 'complete',
      }),
    ).toMatchObject({
      nextStep: 'review',
      immediateCarePathway: null,
      humanReviewHold: false,
    })
  })

  it('continues directly to the full triage workflow for an immediate safety hold', () => {
    expect(
      nextStepAfterExtraction({
        packet_safety: {
          care_pathway: 'emergency_now',
          review_requirement: 'emergency_action',
          clinician_hold: true,
          signals: [],
        },
        coverage_status: 'complete',
      }),
    ).toMatchObject({
      nextStep: 'triage',
      immediateCarePathway: 'emergency_now',
      humanReviewHold: true,
    })
  })

  it('holds incomplete coverage for human review', () => {
    expect(
      nextStepAfterExtraction({ coverage_status: 'partial' }),
    ).toMatchObject({ nextStep: 'human_review', humanReviewHold: true })
  })

  it('keeps emergency action active while also holding incomplete coverage', () => {
    expect(
      nextStepAfterExtraction({
        packet_safety: {
          care_pathway: 'emergency_now',
          review_requirement: 'emergency_action',
          clinician_hold: true,
          signals: [],
        },
        coverage_status: 'partial',
      }),
    ).toMatchObject({
      nextStep: 'triage',
      immediateCarePathway: 'emergency_now',
      humanReviewHold: true,
    })
  })

  it('keeps same-day action active while also holding incomplete coverage', () => {
    expect(
      nextStepAfterExtraction({
        packet_safety: {
          care_pathway: 'same_day_clinician_review',
          review_requirement: 'immediate_clinician_review',
          clinician_hold: true,
          signals: [],
        },
        coverage_status: 'partial',
      }),
    ).toMatchObject({
      nextStep: 'triage',
      immediateCarePathway: 'same_day_clinician_review',
      humanReviewHold: true,
    })
  })

  it('fails closed when coverage status is absent', () => {
    expect(nextStepAfterExtraction({})).toMatchObject({
      nextStep: 'human_review',
      humanReviewHold: true,
    })
  })

  it('accepts not-applicable coverage as complete enough for review', () => {
    expect(
      nextStepAfterExtraction({ coverage_status: 'not_applicable' }),
    ).toMatchObject({
      nextStep: 'review',
      immediateCarePathway: null,
      humanReviewHold: false,
      approvalBlockedReason: null,
    })
  })
})
