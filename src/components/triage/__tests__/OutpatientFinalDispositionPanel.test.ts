import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { TriageResult } from '@/lib/triage/types'
import OutpatientFinalDispositionPanel from '../OutpatientFinalDispositionPanel'
import TriageOutputPanel from '../TriageOutputPanel'

function safeResult(overrides: Partial<TriageResult> = {}): TriageResult {
  return {
    session_id: 'triage-safe-1',
    triage_tier: 'routine',
    triage_tier_display: 'Routine',
    confidence: 'high',
    dimension_scores: {
      symptom_acuity: { score: 2, rationale: 'Synthetic stable symptoms.' },
      diagnostic_concern: { score: 2, rationale: 'No time-critical concern.' },
      rate_of_progression: { score: 1, rationale: 'Not progressing.' },
      functional_impairment: { score: 2, rationale: 'Mild impairment.' },
      red_flag_presence: { score: 1, rationale: 'No red flags.' },
    },
    weighted_score: 1.85,
    red_flag_override: false,
    emergent_override: false,
    emergent_reason: null,
    insufficient_data: false,
    missing_information: [],
    clinical_reasons: [],
    red_flags: [],
    suggested_workup: [],
    failed_therapies: [],
    subspecialty_recommendation: 'General Neurology',
    subspecialty_rationale: 'Synthetic routing rationale.',
    redirect_to_non_neuro: false,
    redirect_specialty: null,
    redirect_rationale: null,
    disclaimer: 'Synthetic teaching result.',
    care_pathway: 'routine_outpatient',
    data_quality: 'sufficient',
    coverage_status: 'complete',
    review_requirement: 'clinician_confirmation',
    workflow_status: 'clinician_review',
    scheduling_locked: true,
    outpatient_finalization_allowed: true,
    safety_review: null,
    ...overrides,
  }
}

describe('OutpatientFinalDispositionPanel', () => {
  it('renders an explicit bounded confirmation for an eligible locked outpatient result', () => {
    const html = renderToStaticMarkup(
      createElement(OutpatientFinalDispositionPanel, {
        result: safeResult(),
      }),
    )

    expect(html).toContain('Finalize outpatient disposition')
    expect(html).toContain('SCHEDULING LOCKED')
    expect(html).toContain('Routine Outpatient')
    expect(html).toContain('Routine')
    expect(html).toContain('Clinical review note')
    expect(html).toContain('maxLength="2000"')
    expect(html).toContain('0 / 2000')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('I reviewed the complete referral evidence')
    expect(html).toContain('Confirm disposition and release scheduling lock')
    expect(html).toContain('disabled=""')
  })

  it.each([
    ['emergency', { care_pathway: 'emergency_now', triage_tier: 'emergent' }],
    ['same-day', { care_pathway: 'same_day_clinician_review', triage_tier: 'urgent' }],
    ['undetermined', { care_pathway: 'undetermined' }],
    ['incomplete coverage', { coverage_status: 'partial' }],
    ['insufficient data', { data_quality: 'insufficient' }],
    ['non-clinician role', { outpatient_finalization_allowed: false }],
  ] satisfies Array<[string, Partial<TriageResult>]>)('renders nothing for %s results', (_label, overrides) => {
    const html = renderToStaticMarkup(
      createElement(OutpatientFinalDispositionPanel, {
        result: safeResult(overrides),
      }),
    )

    expect(html).toBe('')
  })

  it('renders a verified decision-ready and lock-release state after success', () => {
    const html = renderToStaticMarkup(
      createElement(OutpatientFinalDispositionPanel, {
        result: safeResult(),
        finalized: {
          triageSessionId: 'triage-safe-1',
          carePathway: 'routine_outpatient',
          triageTier: 'routine',
          reviewedBy: 'clinician-1',
        },
      }),
    )

    expect(html).toContain('LOCK RELEASED')
    expect(html).toContain('Decision ready')
    expect(html).toContain('clinician-1')
    expect(html).not.toContain('Clinical review note')
    expect(html).not.toContain('Confirm disposition and release scheduling lock')
  })

  it('does not show a stale lock release after the same record changes disposition', () => {
    const html = renderToStaticMarkup(
      createElement(OutpatientFinalDispositionPanel, {
        result: safeResult({
          care_pathway: 'emergency_now',
          triage_tier: 'emergent',
          emergent_override: true,
        }),
        finalized: {
          triageSessionId: 'triage-safe-1',
          carePathway: 'routine_outpatient',
          triageTier: 'routine',
          reviewedBy: 'clinician-1',
        },
      }),
    )

    expect(html).toBe('')
  })

  it('does not show a stale lock release when an emergency marker appears without changing the prior outpatient tier', () => {
    const html = renderToStaticMarkup(
      createElement(OutpatientFinalDispositionPanel, {
        result: safeResult({
          emergent_override: true,
          review_requirement: 'emergency_action',
          workflow_status: 'emergency_hold',
        }),
        finalized: {
          triageSessionId: 'triage-safe-1',
          carePathway: 'routine_outpatient',
          triageTier: 'routine',
          reviewedBy: 'clinician-1',
        },
      }),
    )

    expect(html).toBe('')
  })

  it('keeps scheduling locked and does not expose finalization before governed recommendation and clarification delivery exist', () => {
    const html = renderToStaticMarkup(
      createElement(TriageOutputPanel, {
        result: safeResult(),
        onTryAnother: () => undefined,
      }),
    )

    expect(html).not.toContain('Finalize outpatient disposition')
    expect(html).not.toContain('LOCK RELEASED')
    expect(html).not.toContain('Closed-loop emergency action')
  })

  it('never renders the outpatient finalizer beside an emergency action', () => {
    const html = renderToStaticMarkup(
      createElement(TriageOutputPanel, {
        result: safeResult({
          triage_tier: 'emergent',
          triage_tier_display: 'Emergent',
          care_pathway: 'emergency_now',
          data_quality: 'sufficient',
          coverage_status: 'complete',
          review_requirement: 'emergency_action',
          workflow_status: 'emergency_hold',
          scheduling_locked: true,
          emergent_override: true,
          emergent_reason: 'Synthetic time-critical neurologic syndrome.',
          missing_information: [
            'Synthetic critical onset time is missing.',
          ],
          suggested_workup: ['Synthetic outpatient MRI before clinic.'],
          subspecialty_recommendation: 'Synthetic Outpatient Route',
          subspecialty_rationale: 'Synthetic outpatient rationale.',
          clinical_reasons: ['Synthetic emergency clinical reason.'],
          red_flags: ['Synthetic emergency red flag.'],
        }),
        onTryAnother: () => undefined,
      }),
    )

    expect(html).toContain('Closed-loop emergency action')
    expect(html).toContain('Synthetic critical onset time is missing.')
    expect(html).toContain('The active emergency action remains in effect.')
    expect(html).toContain('Emergency evaluation now')
    expect(html).toContain('Synthetic emergency clinical reason.')
    expect(html).toContain('Synthetic emergency red flag.')
    expect(html).toContain('Safety Workflow')
    expect(html).not.toContain('Suggested Pre-Visit Workup')
    expect(html).not.toContain('Synthetic outpatient MRI before clinic.')
    expect(html).not.toContain('Subspecialty Routing')
    expect(html).not.toContain('Synthetic Outpatient Route')
    expect(html).not.toContain('does not contain enough clinical information')
    expect(html).not.toContain('Finalize outpatient disposition')
  })

  it('renders same-day workup as non-blocking and keeps missing information visible', () => {
    const html = renderToStaticMarkup(
      createElement(TriageOutputPanel, {
        result: safeResult({
          triage_tier: 'urgent',
          triage_tier_display: 'URGENT — Within 1 Week',
          care_pathway: 'same_day_clinician_review',
          review_requirement: 'immediate_clinician_review',
          workflow_status: 'action_pending',
          outpatient_finalization_allowed: false,
          scheduling_locked: true,
          missing_information: [
            'Synthetic anticoagulation status is missing.',
          ],
          suggested_workup: ['Synthetic same-day non-blocking test.'],
        }),
        onTryAnother: () => undefined,
      }),
    )

    expect(html).toContain('Same-day clinician review')
    expect(html).not.toContain('Within 1 Week')
    expect(html).toContain('Non-blocking workup')
    expect(html).toContain(
      'must not delay same-day clinician review',
    )
    expect(html).toContain('Synthetic same-day non-blocking test.')
    expect(html).toContain('Synthetic anticoagulation status is missing.')
    expect(html).not.toContain('Insufficient Data')
  })

  it('fails closed on an emergency projection conflict without hiding clinical evidence', () => {
    const html = renderToStaticMarkup(
      createElement(TriageOutputPanel, {
        result: safeResult({
          triage_tier: 'emergent',
          triage_tier_display: 'Emergent',
          care_pathway: 'routine_outpatient',
          emergent_override: true,
          emergent_reason: 'Synthetic conflicting emergency marker.',
          workflow_status: 'emergency_hold',
          scheduling_locked: true,
          suggested_workup: ['Synthetic unsafe outpatient workup.'],
          subspecialty_recommendation: 'Synthetic Unsafe Route',
          clinical_reasons: ['Synthetic conflict clinical reason.'],
          red_flags: ['Synthetic conflict red flag.'],
        }),
        onTryAnother: () => undefined,
      }),
    )

    expect(html).toContain('Safety conflict — human review hold')
    expect(html).toContain('Emergency evaluation now')
    expect(html).toContain('Synthetic conflict clinical reason.')
    expect(html).toContain('Synthetic conflict red flag.')
    expect(html).toContain('Safety Workflow')
    expect(html).toContain('Closed-loop emergency action')
    expect(html).not.toContain('Suggested Pre-Visit Workup')
    expect(html).not.toContain('Synthetic unsafe outpatient workup.')
    expect(html).not.toContain('Subspecialty Routing')
    expect(html).not.toContain('Synthetic Unsafe Route')
  })

  it.each([
    ['emergent tier', { triage_tier: 'emergent' as const }],
    ['emergent override', { emergent_override: true }],
    [
      'emergency review requirement',
      { review_requirement: 'emergency_action' as const },
    ],
  ])('keeps the durable emergency action visible for an isolated %s marker', (_label, marker) => {
    const html = renderToStaticMarkup(
      createElement(TriageOutputPanel, {
        result: safeResult({
          ...marker,
          suggested_workup: ['Synthetic unsafe outpatient workup.'],
          subspecialty_recommendation: 'Synthetic Unsafe Route',
        }),
        onTryAnother: () => undefined,
      }),
    )

    expect(html).toContain('Closed-loop emergency action')
    expect(html).toContain('Emergency evaluation now')
    expect(html).not.toContain('Suggested Pre-Visit Workup')
    expect(html).not.toContain('Subspecialty Routing')
  })

  it('shows a generic human hold when conflicting data has no enumerated missing item', () => {
    const html = renderToStaticMarkup(
      createElement(TriageOutputPanel, {
        result: safeResult({
          data_quality: 'conflicting',
          missing_information: [],
          scheduling_locked: true,
          suggested_workup: ['Synthetic unsafe conflict-based workup.'],
          subspecialty_recommendation: 'Synthetic Unsafe Conflict Route',
        }),
        onTryAnother: () => undefined,
      }),
    )

    expect(html).toContain(
      'Conflicting clinical information requires clinician reconciliation.',
    )
    expect(html).toContain('Human review hold')
    expect(html).toContain('Scheduling remains locked.')
    expect(html).not.toContain('Suggested Pre-Visit Workup')
    expect(html).not.toContain('Synthetic unsafe conflict-based workup.')
    expect(html).not.toContain('Subspecialty Routing')
    expect(html).not.toContain('Synthetic Unsafe Conflict Route')
    expect(html).not.toContain('Finalize outpatient disposition')
  })

  it.each([
    [
      'insufficient data quality with stale outpatient markers',
      { data_quality: 'insufficient' as const },
    ],
    [
      'the model insufficient-data boolean with stale outpatient markers',
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
  ])('renders a locked human-review hold and no outpatient actions for %s', (_label, marker) => {
    const html = renderToStaticMarkup(
      createElement(TriageOutputPanel, {
        result: safeResult({
          ...marker,
          scheduling_locked: false,
          missing_information: [],
          suggested_workup: ['Synthetic unsafe incomplete-data workup.'],
          subspecialty_recommendation: 'Synthetic Unsafe Incomplete Route',
          clinical_reasons: ['Synthetic incomplete-data clinical reason.'],
          red_flags: ['Synthetic incomplete-data red flag.'],
        }),
        onTryAnother: () => undefined,
      }),
    )

    expect(html).toContain('Insufficient or undetermined data — human review hold')
    expect(html).toContain('Scheduling remains locked.')
    expect(html).toContain(
      'Referral information is insufficient for a safe outpatient disposition.',
    )
    expect(html).toContain('Synthetic incomplete-data clinical reason.')
    expect(html).toContain('Synthetic incomplete-data red flag.')
    expect(html).not.toContain('Suggested Pre-Visit Workup')
    expect(html).not.toContain('Synthetic unsafe incomplete-data workup.')
    expect(html).not.toContain('Subspecialty Routing')
    expect(html).not.toContain('Synthetic Unsafe Incomplete Route')
    expect(html).not.toContain('Finalize outpatient disposition')
  })

  it('keeps same-day review visible while insufficient data suppresses every outpatient action', () => {
    const html = renderToStaticMarkup(
      createElement(TriageOutputPanel, {
        result: safeResult({
          triage_tier: 'urgent',
          care_pathway: 'same_day_clinician_review',
          review_requirement: 'immediate_clinician_review',
          insufficient_data: true,
          data_quality: 'insufficient',
          scheduling_locked: false,
          outpatient_finalization_allowed: true,
          missing_information: ['Synthetic decision-critical detail is missing.'],
          suggested_workup: ['Synthetic unsafe same-day workup.'],
          subspecialty_recommendation: 'Synthetic Unsafe Same-Day Route',
        }),
        onTryAnother: () => undefined,
      }),
    )

    expect(html).toContain('Same-day clinician review')
    expect(html).toContain('Insufficient or undetermined data — human review hold')
    expect(html).toContain('Synthetic decision-critical detail is missing.')
    expect(html).not.toContain('Suggested Pre-Visit Workup')
    expect(html).not.toContain('Non-blocking workup')
    expect(html).not.toContain('Subspecialty Routing')
    expect(html).not.toContain('Finalize outpatient disposition')
  })

  it('uses the insufficient-data panel only for an undetermined final decision', () => {
    const determined = renderToStaticMarkup(
      createElement(TriageOutputPanel, {
        result: safeResult({
          triage_tier: 'urgent',
          care_pathway: 'expedited_outpatient',
          insufficient_data: true,
          data_quality: 'insufficient',
          missing_information: ['Synthetic exam detail is missing.'],
        }),
        onTryAnother: () => undefined,
      }),
    )
    const undetermined = renderToStaticMarkup(
      createElement(TriageOutputPanel, {
        result: safeResult({
          triage_tier: 'urgent',
          care_pathway: 'undetermined',
          insufficient_data: true,
          data_quality: 'insufficient',
          missing_information: ['Synthetic decision-critical detail is missing.'],
        }),
        onTryAnother: () => undefined,
      }),
    )

    expect(determined).not.toContain('Insufficient Data')
    expect(determined).toContain('Synthetic exam detail is missing.')
    expect(undetermined).toContain('Insufficient Data')
    expect(undetermined).toContain('Synthetic decision-critical detail is missing.')
  })

  it('keeps clinical reasons and red flags visible for a genuinely undetermined result', () => {
    const html = renderToStaticMarkup(
      createElement(TriageOutputPanel, {
        result: safeResult({
          triage_tier: 'insufficient_data',
          care_pathway: 'undetermined',
          insufficient_data: true,
          data_quality: 'insufficient',
          clinical_reasons: ['Synthetic available clinical context.'],
          red_flags: ['Synthetic available safety signal.'],
          missing_information: ['Synthetic decision-critical detail is missing.'],
        }),
        onTryAnother: () => undefined,
      }),
    )

    expect(html).toContain('Insufficient Data')
    expect(html).toContain('Synthetic available clinical context.')
    expect(html).toContain('Synthetic available safety signal.')
    expect(html).toContain('Safety Workflow')
  })
})
