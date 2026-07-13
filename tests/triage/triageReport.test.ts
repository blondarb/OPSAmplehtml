import { describe, expect, it } from 'vitest'

import { applyFinalizedOutpatientDisposition } from '@/lib/triage/outpatientFinalDispositionClient'
import { buildTriageReport } from '@/lib/triage/triageReport'
import { TIER_DISPLAY, type TriageResult } from '@/lib/triage/types'

function result(overrides: Partial<TriageResult> = {}): TriageResult {
  const triageTier = overrides.triage_tier ?? 'routine'
  return {
    session_id: 'synthetic-report-session',
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
    missing_information: ['Synthetic critical onset time is missing.'],
    clinical_reasons: ['Synthetic clinical reason.'],
    red_flags: ['Synthetic red flag.'],
    suggested_workup: ['Synthetic outpatient MRI before clinic.'],
    failed_therapies: [
      { therapy: 'Synthetic therapy', reason_stopped: 'No benefit' },
    ],
    subspecialty_recommendation: 'Synthetic Outpatient Route',
    subspecialty_rationale: 'Synthetic outpatient routing rationale.',
    redirect_to_non_neuro: false,
    redirect_specialty: null,
    redirect_rationale: null,
    disclaimer: 'Synthetic clinical decision support disclaimer.',
    care_pathway: 'routine_outpatient',
    data_quality: 'partial',
    coverage_status: 'complete',
    review_requirement: 'clinician_confirmation',
    workflow_status: 'decision_ready',
    scheduling_locked: false,
    ...overrides,
  }
}

describe('buildTriageReport', () => {
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
  ])('suppresses outpatient report content for any %s marker', (_label, marker) => {
    const report = buildTriageReport(result(marker))

    expect(report).toContain('Emergency evaluation now')
    expect(report).toContain('Synthetic critical onset time is missing.')
    expect(report).not.toContain('Suggested Pre-Visit Workup')
    expect(report).not.toContain('Synthetic outpatient MRI before clinic.')
    expect(report).not.toContain('Subspecialty Routing')
    expect(report).not.toContain('Synthetic Outpatient Route')
  })

  it('marks a conflicting emergency projection as a human-review safety hold', () => {
    const report = buildTriageReport(
      result({
        care_pathway: 'routine_outpatient',
        triage_tier: 'emergent',
        emergent_override: true,
      }),
    )

    expect(report).toContain('SAFETY CONFLICT')
    expect(report).toContain('Human review hold required')
    expect(report).not.toContain('Suggested Pre-Visit Workup')
    expect(report).not.toContain('Subspecialty Routing')
  })

  it('labels same-day review exactly and warns that information gathering must not delay it', () => {
    const report = buildTriageReport(
      result({
        care_pathway: 'same_day_clinician_review',
        triage_tier: 'urgent',
        triage_tier_display: 'URGENT — Within 1 Week',
        review_requirement: 'immediate_clinician_review',
      }),
    )

    expect(report).toContain('Recommended Timeframe: Same-day clinician review')
    expect(report).toContain('Triage Tier: URGENT')
    expect(report).not.toContain('Within 1 Week')
    expect(report).toContain(
      'Information gathering must not delay same-day clinician review.',
    )
  })

  it('does not copy a stale outpatient timeframe into an emergency-conflict report', () => {
    const report = buildTriageReport(
      result({
        care_pathway: 'routine_outpatient',
        triage_tier: 'emergent',
        triage_tier_display: 'ROUTINE — Within 8-12 Weeks',
        emergent_override: true,
      }),
    )

    expect(report).toContain('Triage Tier: EMERGENT')
    expect(report).toContain('Recommended Timeframe: Emergency evaluation now')
    expect(report).not.toContain('Within 8-12 Weeks')
  })

  it('keeps missing information visible in an otherwise determined urgent report', () => {
    const report = buildTriageReport(
      result({
        triage_tier: 'urgent',
        care_pathway: 'expedited_outpatient',
        missing_information: ['Synthetic anticoagulation status is missing.'],
      }),
    )

    expect(report).toContain('Missing Information:')
    expect(report).toContain('Synthetic anticoagulation status is missing.')
  })

  it('copies a conflicting-data hold and suppresses outpatient content when no missing item was enumerated', () => {
    const report = buildTriageReport(
      result({
        data_quality: 'conflicting',
        missing_information: [],
        scheduling_locked: false,
      }),
    )

    expect(report).toContain('DATA CONFLICT')
    expect(report).toContain(
      'Conflicting clinical information requires clinician reconciliation.',
    )
    expect(report).toContain('Scheduling remains locked.')
    expect(report).not.toContain('Suggested Pre-Visit Workup')
    expect(report).not.toContain('Synthetic outpatient MRI before clinic.')
    expect(report).not.toContain('Subspecialty Routing')
    expect(report).not.toContain('Synthetic Outpatient Route')
  })

  it.each([
    [
      'insufficient data quality with a stale outpatient projection',
      { data_quality: 'insufficient' as const },
    ],
    [
      'the model insufficient-data boolean with a stale outpatient projection',
      { insufficient_data: true },
    ],
    [
      'an undetermined pathway with stale sufficient-data markers',
      { care_pathway: 'undetermined' as const },
    ],
    [
      'an insufficient-data tier with stale outpatient markers',
      { triage_tier: 'insufficient_data' as const },
    ],
  ])('copies a human-review hold and suppresses outpatient content for %s', (_label, marker) => {
    const report = buildTriageReport(
      result({
        ...marker,
        missing_information: [],
        scheduling_locked: false,
      }),
    )

    expect(report).toContain('INSUFFICIENT / UNDETERMINED DATA HOLD')
    expect(report).toContain('Human review is required')
    expect(report).toContain('Scheduling remains locked.')
    expect(report).toContain('Missing Information:')
    expect(report).toContain(
      'Referral information is insufficient for a safe outpatient disposition.',
    )
    expect(report).toContain('Synthetic clinical reason.')
    expect(report).toContain('Synthetic red flag.')
    expect(report).not.toContain('Suggested Pre-Visit Workup')
    expect(report).not.toContain('Synthetic outpatient MRI before clinic.')
    expect(report).not.toContain('Subspecialty Routing')
    expect(report).not.toContain('Synthetic Outpatient Route')
  })

  it('keeps same-day review active while suppressing unsafe outpatient actions for insufficient data', () => {
    const report = buildTriageReport(
      result({
        triage_tier: 'urgent',
        care_pathway: 'same_day_clinician_review',
        insufficient_data: true,
        data_quality: 'insufficient',
      }),
    )

    expect(report).toContain('Recommended Timeframe: Same-day clinician review')
    expect(report).toContain(
      'Information gathering must not delay same-day clinician review.',
    )
    expect(report).not.toContain('Suggested Pre-Visit Workup')
    expect(report).not.toContain('Subspecialty Routing')
  })

  it('copies the verified unlocked presentation state when noncritical information remains missing', () => {
    const locked = result({
      session_id: 'synthetic-finalized-report-session',
      data_quality: 'sufficient',
      care_pathway: 'routine_outpatient',
      triage_tier: 'routine',
      coverage_status: 'complete',
      review_requirement: 'clinician_confirmation',
      workflow_status: 'clinician_review',
      scheduling_locked: true,
      outpatient_finalization_allowed: true,
      missing_information: ['Synthetic noncritical history detail is missing.'],
    })
    const presentation = applyFinalizedOutpatientDisposition(locked, {
      triageSessionId: locked.session_id,
      carePathway: 'routine_outpatient',
      triageTier: 'routine',
      reviewedBy: 'synthetic-clinician',
    })
    const report = buildTriageReport(presentation)

    expect(presentation.scheduling_locked).toBe(false)
    expect(report).toContain('Synthetic noncritical history detail is missing.')
    expect(report).toContain('Scheduling is not currently locked.')
    expect(report).not.toContain('Scheduling remains locked.')
  })

  it('retains workup and outpatient routing for a coherent routine report', () => {
    const report = buildTriageReport(result({ missing_information: [] }))

    expect(report).toContain('Suggested Pre-Visit Workup:')
    expect(report).toContain('Synthetic outpatient MRI before clinic.')
    expect(report).toContain(
      'Subspecialty Routing: Synthetic Outpatient Route',
    )
  })
})
