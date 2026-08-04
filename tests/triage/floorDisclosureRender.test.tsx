import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TriageOutputPanel from '@/components/triage/TriageOutputPanel'
import type { TriageResult } from '@/lib/triage/types'

const s = (score: number) => ({ score, rationale: 'synthetic' })
const RESULT = {
  session_id: 'render-check', triage_tier: 'urgent', triage_tier_display: 'URGENT',
  confidence: 'moderate',
  dimension_scores: { symptom_acuity: s(3), diagnostic_concern: s(4), rate_of_progression: s(3), functional_impairment: s(3), red_flag_presence: s(4) },
  weighted_score: 3.5, red_flag_override: true, emergent_override: false, emergent_reason: null,
  insufficient_data: false, missing_information: null, clinical_reasons: ['Synthetic'], red_flags: ['Synthetic flag'],
  suggested_workup: [], failed_therapies: [], subspecialty_recommendation: 'Headache',
  subspecialty_rationale: 'synthetic', redirect_to_non_neuro: false, redirect_specialty: null,
  redirect_rationale: null, disclaimer: 'x', care_pathway: 'expedited_outpatient',
  data_quality: 'sufficient', coverage_status: 'complete', review_requirement: 'clinician_confirmation',
  workflow_status: 'decision_ready', scheduling_locked: false,
} as unknown as TriageResult

describe('floor disclosure renders in the result panel', () => {
  it('shows the safety-floor note for the real production case', () => {
    const html = renderToStaticMarkup(<TriageOutputPanel result={RESULT} onTryAnother={() => {}} />)
    expect(html).toContain('Safety floor applied')
    expect(html).toContain('Semi-urgent')
    expect(html).toContain('3.50 / 5')
  })
})
