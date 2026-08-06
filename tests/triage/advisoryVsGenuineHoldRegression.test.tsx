import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TriageOutputPanel from '@/components/triage/TriageOutputPanel'
import type { TriageResult } from '@/lib/triage/types'

// Regression pin for the Gutierrez-pattern defect: a note that triaged
// successfully with some non-blocking missing items must read as a
// confident answer with a short "confirm these" list — never as the same
// alarming register used for a genuine data hold. See ground-truth audit,
// 2026-08-06: processing_status=complete, triage_tier=semi_urgent,
// care_pathway=expedited_outpatient, data_quality=SUFFICIENT,
// review_requirement=clinician_confirmation, missing_information items=4,
// modelSafetyFailure=NONE.

const s = (score: number) => ({ score, rationale: 'synthetic' })

const BASE = {
  session_id: 'gutierrez-pattern',
  triage_tier: 'semi_urgent',
  triage_tier_display: 'SEMI-URGENT',
  confidence: 'moderate',
  dimension_scores: {
    symptom_acuity: s(3),
    diagnostic_concern: s(3),
    rate_of_progression: s(2),
    functional_impairment: s(3),
    red_flag_presence: s(1),
  },
  weighted_score: 2.6,
  red_flag_override: false,
  emergent_override: false,
  emergent_reason: null,
  insufficient_data: false,
  clinical_reasons: ['Synthetic reason'],
  red_flags: [],
  suggested_workup: [],
  failed_therapies: [],
  subspecialty_recommendation: 'General neurology',
  subspecialty_rationale: 'synthetic',
  redirect_to_non_neuro: false,
  redirect_specialty: null,
  redirect_rationale: null,
  disclaimer: 'x',
  care_pathway: 'expedited_outpatient',
  coverage_status: 'complete',
  review_requirement: 'clinician_confirmation',
  workflow_status: 'decision_ready',
  scheduling_locked: true,
} as const

// The common case: triaged with confidence, sufficient data quality, some
// items simply weren't in the referral — none of which blocked the
// recommendation.
const ROUTINE_RESULT = {
  ...BASE,
  data_quality: 'sufficient',
  missing_information: [
    'Symptom onset date',
    'Prior imaging results',
    'Current medication list',
    'Family history of neurological disease',
  ],
} as unknown as TriageResult

// The rare case: the note genuinely cannot be triaged safely.
const GENUINE_HOLD_RESULT = {
  ...BASE,
  session_id: 'genuine-insufficient-data-hold',
  triage_tier: 'insufficient_data',
  triage_tier_display: 'INSUFFICIENT DATA',
  data_quality: 'insufficient',
  care_pathway: 'undetermined',
  missing_information: ['Neurological exam findings'],
} as unknown as TriageResult

describe('Gutierrez-pattern regression: advisory vs. genuine hold', () => {
  it('does NOT render return-to-provider or failure framing for a sufficient-data result with non-blocking missing items', () => {
    const html = renderToStaticMarkup(
      <TriageOutputPanel result={ROUTINE_RESULT} onTryAnother={() => {}} />,
    )

    expect(html).toContain('Confirm before scheduling')
    expect(html).not.toContain('Return to referring provider for clarification')
    expect(html).not.toContain('Missing information — active action remains')
    expect(html).not.toContain('Scheduling remains locked.')
  })

  it('still renders the return-to-provider hold framing for a genuine insufficient-data result', () => {
    const html = renderToStaticMarkup(
      <TriageOutputPanel result={GENUINE_HOLD_RESULT} onTryAnother={() => {}} />,
    )

    expect(html).toContain('Return to referring provider for clarification')
    expect(html).not.toContain('Confirm before scheduling')
  })
})
