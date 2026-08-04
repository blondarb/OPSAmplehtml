import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import TriageOutputPanel from '@/components/triage/TriageOutputPanel'
import type { TriageResult } from '@/lib/triage/types'

const s = (score: number) => ({ score, rationale: 'synthetic' })

const BASE_RESULT = {
  session_id: 'handoff-check',
  triage_tier: 'urgent',
  triage_tier_display: 'URGENT',
  confidence: 'moderate',
  dimension_scores: {
    symptom_acuity: s(3),
    diagnostic_concern: s(4),
    rate_of_progression: s(3),
    functional_impairment: s(3),
    red_flag_presence: s(2),
  },
  weighted_score: 3.2,
  red_flag_override: false,
  emergent_override: false,
  emergent_reason: null,
  insufficient_data: false,
  missing_information: null,
  clinical_reasons: ['Synthetic reason'],
  red_flags: [],
  suggested_workup: [],
  failed_therapies: [],
  subspecialty_recommendation: 'Headache',
  subspecialty_rationale: 'synthetic',
  redirect_to_non_neuro: false,
  redirect_specialty: null,
  redirect_rationale: null,
  disclaimer: 'x',
  care_pathway: 'expedited_outpatient',
  data_quality: 'sufficient',
  coverage_status: 'complete',
  review_requirement: 'clinician_confirmation',
  workflow_status: 'decision_ready',
  scheduling_locked: false,
} as unknown as TriageResult

const EMERGENT_RESULT = {
  ...BASE_RESULT,
  session_id: 'handoff-check-emergent',
  triage_tier: 'emergent',
  triage_tier_display: 'EMERGENT',
  care_pathway: 'emergency_now',
  emergent_reason: 'Synthetic emergency reason',
} as unknown as TriageResult

describe('TriageOutputPanel — "Continue to patient interview"', () => {
  it('does not render the control when onStartPatientInterview is omitted (existing call sites unaffected)', () => {
    const html = renderToStaticMarkup(
      <TriageOutputPanel result={BASE_RESULT} onTryAnother={() => {}} />,
    )
    expect(html).not.toContain('Continue to patient interview')
  })

  it('renders the control on a non-emergent result when the handler is supplied', () => {
    const html = renderToStaticMarkup(
      <TriageOutputPanel
        result={BASE_RESULT}
        onTryAnother={() => {}}
        onStartPatientInterview={() => {}}
      />,
    )
    expect(html).toContain('Continue to patient interview')
  })

  it('suppresses the control on the emergency/emergent path even when the handler is supplied', () => {
    const onStartPatientInterview = vi.fn()
    const html = renderToStaticMarkup(
      <TriageOutputPanel
        result={EMERGENT_RESULT}
        onTryAnother={() => {}}
        onStartPatientInterview={onStartPatientInterview}
      />,
    )
    expect(html).not.toContain('Continue to patient interview')
  })
})
