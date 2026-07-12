import { describe, expect, it } from 'vitest'

import { triageOutputPolicy } from '@/lib/triage/triageOutputPolicy'
import { TIER_DISPLAY, type TriageResult } from '@/lib/triage/types'

function result(overrides: Partial<TriageResult> = {}): TriageResult {
  const triageTier = overrides.triage_tier ?? 'routine'
  return {
    session_id: 'synthetic-output-policy-session',
    triage_tier: triageTier,
    triage_tier_display: TIER_DISPLAY[triageTier].label,
    confidence: 'high',
    dimension_scores: {
      symptom_acuity: { score: 2, rationale: 'Synthetic stable acuity.' },
      diagnostic_concern: { score: 2, rationale: 'Synthetic low concern.' },
      rate_of_progression: { score: 1, rationale: 'Synthetic stable course.' },
      functional_impairment: { score: 2, rationale: 'Synthetic mild impact.' },
      red_flag_presence: { score: 1, rationale: 'No synthetic red flag.' },
    },
    weighted_score: 1.85,
    red_flag_override: false,
    emergent_override: false,
    emergent_reason: null,
    insufficient_data: false,
    missing_information: [],
    clinical_reasons: ['Synthetic clinical reason.'],
    red_flags: [],
    suggested_workup: ['Synthetic outpatient MRI before clinic.'],
    failed_therapies: [],
    subspecialty_recommendation: 'General Neurology',
    subspecialty_rationale: 'Synthetic outpatient routing rationale.',
    redirect_to_non_neuro: false,
    redirect_specialty: null,
    redirect_rationale: null,
    disclaimer: 'Synthetic clinical decision support disclaimer.',
    care_pathway: 'routine_outpatient',
    data_quality: 'sufficient',
    coverage_status: 'complete',
    review_requirement: 'clinician_confirmation',
    workflow_status: 'decision_ready',
    scheduling_locked: false,
    ...overrides,
  }
}

describe('triageOutputPolicy', () => {
  it.each([
    [
      'emergency pathway',
      { care_pathway: 'emergency_now' as const },
    ],
    [
      'emergent tier',
      { triage_tier: 'emergent' as const },
    ],
    [
      'emergent override',
      { emergent_override: true },
    ],
    [
      'emergency review requirement',
      { review_requirement: 'emergency_action' as const },
    ],
  ])('suppresses outpatient recommendations for any %s marker', (_label, marker) => {
    const policy = triageOutputPolicy(result(marker))

    expect(policy).toMatchObject({
      showPreVisitWorkup: false,
      showOutpatientRouting: false,
      timeframe: 'Emergency evaluation now',
      requiresHumanReviewHold: true,
    })
  })

  it('does not manufacture a conflict when the governed emergency pathway and tier agree', () => {
    const policy = triageOutputPolicy(
      result({
        care_pathway: 'emergency_now',
        triage_tier: 'emergent',
        emergent_override: true,
        review_requirement: 'emergency_action',
      }),
    )

    expect(policy.safetyConflict).toBe(false)
  })

  it.each([
    [
      'emergency pathway with a non-emergent tier',
      {
        care_pathway: 'emergency_now' as const,
        triage_tier: 'urgent' as const,
      },
    ],
    [
      'emergent tier on an outpatient pathway',
      {
        care_pathway: 'routine_outpatient' as const,
        triage_tier: 'emergent' as const,
      },
    ],
    [
      'emergent override on an outpatient pathway',
      {
        care_pathway: 'routine_outpatient' as const,
        emergent_override: true,
      },
    ],
    [
      'emergency review requirement on an outpatient pathway',
      {
        care_pathway: 'routine_outpatient' as const,
        review_requirement: 'emergency_action' as const,
      },
    ],
  ])('fails closed for %s', (_label, conflict) => {
    const policy = triageOutputPolicy(result(conflict))

    expect(policy).toMatchObject({
      showPreVisitWorkup: false,
      showOutpatientRouting: false,
      safetyConflict: true,
      requiresHumanReviewHold: true,
      timeframe: 'Emergency evaluation now',
    })
  })

  it('labels same-day review as same-day rather than within one week', () => {
    const policy = triageOutputPolicy(
      result({
        care_pathway: 'same_day_clinician_review',
        triage_tier: 'urgent',
        review_requirement: 'immediate_clinician_review',
      }),
    )

    expect(policy.timeframe).toBe('Same-day clinician review')
  })

  it('shows missing information even when an urgency floor prevents the insufficient-data tier', () => {
    const policy = triageOutputPolicy(
      result({
        triage_tier: 'urgent',
        missing_information: ['Synthetic critical onset time is missing.'],
      }),
    )

    expect(policy.showMissingInformation).toBe(true)
  })

  it('hides the missing-information section only when no missing items exist', () => {
    expect(
      triageOutputPolicy(result({ missing_information: null }))
        .showMissingInformation,
    ).toBe(false)
    expect(
      triageOutputPolicy(result({ missing_information: [] }))
        .showMissingInformation,
    ).toBe(false)
  })

  it('holds conflicting data and suppresses every outpatient recommendation even without enumerated missing items', () => {
    const policy = triageOutputPolicy(
      result({
        data_quality: 'conflicting',
        missing_information: [],
        scheduling_locked: false,
      }),
    )

    expect(policy).toMatchObject({
      dataConflict: true,
      showPreVisitWorkup: false,
      showOutpatientRouting: false,
      showMissingInformation: true,
      requiresHumanReviewHold: true,
      schedulingLocked: true,
    })
  })

  it.each([
    [
      'insufficient data quality with otherwise outpatient markers',
      { data_quality: 'insufficient' as const },
    ],
    [
      'the model insufficient-data boolean with otherwise sufficient markers',
      { insufficient_data: true },
    ],
    [
      'an undetermined pathway with otherwise sufficient markers',
      { care_pathway: 'undetermined' as const },
    ],
    [
      'an insufficient-data tier with otherwise outpatient markers',
      { triage_tier: 'insufficient_data' as const },
    ],
  ])('fails closed for %s', (_label, marker) => {
    const policy = triageOutputPolicy(
      result({
        ...marker,
        missing_information: [],
        scheduling_locked: false,
      }),
    )

    expect(policy).toMatchObject({
      insufficientDataHold: true,
      showPreVisitWorkup: false,
      showOutpatientRouting: false,
      showMissingInformation: true,
      requiresHumanReviewHold: true,
      schedulingLocked: true,
    })
  })

  it('retains the urgent action while insufficient data blocks outpatient recommendations', () => {
    const policy = triageOutputPolicy(
      result({
        triage_tier: 'urgent',
        care_pathway: 'same_day_clinician_review',
        insufficient_data: true,
        data_quality: 'insufficient',
      }),
    )

    expect(policy).toMatchObject({
      timeframe: 'Same-day clinician review',
      insufficientDataHold: true,
      showPreVisitWorkup: false,
      showOutpatientRouting: false,
      requiresHumanReviewHold: true,
      schedulingLocked: true,
    })
  })

  it('uses the ordinary tier timeframe and outpatient sections for a coherent routine result', () => {
    const policy = triageOutputPolicy(result())

    expect(policy).toMatchObject({
      showPreVisitWorkup: true,
      showOutpatientRouting: true,
      timeframe: TIER_DISPLAY.routine.timeframe,
      safetyConflict: false,
      requiresHumanReviewHold: false,
      dataConflict: false,
      insufficientDataHold: false,
      schedulingLocked: false,
    })
  })
})
