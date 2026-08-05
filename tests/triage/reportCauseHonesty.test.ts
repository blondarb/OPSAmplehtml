import { describe, expect, it } from 'vitest'

import { buildTriageReport } from '@/lib/triage/triageReport'
import type { TriageResult } from '@/lib/triage/types'

/**
 * The copied report is the text that LEAVES the app — pasted into charts and
 * sent back to referring providers. Telling a PCP their referral was inadequate
 * when our own safety-model call failed is false, and it is a reason for them to
 * stop referring.
 *
 * The on-screen panel was fixed for this on 2026-08-05; the report was missed in
 * the same pass and still carried the blaming fallback. These tests exist so the
 * two cannot drift apart again.
 */

function insufficientDataResult(over: Partial<TriageResult> = {}): TriageResult {
  return {
    triage_tier: 'insufficient_data',
    triage_tier_display: 'Tier 7 of 7 — Insufficient Data',
    care_pathway: 'undetermined',
    insufficient_data: true,
    scheduling_locked: true,
    review_requirement: 'immediate_clinician_review',
    missing_information: [],
    // buildTriageReport reads .length on these without optional chaining
    // (triageReport.ts:103-130), so a partial fixture throws rather than
    // producing a report. Populate every array the builder walks.
    clinical_reasons: [],
    red_flags: [],
    failed_therapies: [],
    suggested_workup: [],
    ...over,
  } as unknown as TriageResult
}

const BLAMES_REFERRAL = 'Referral information is insufficient for a safe outpatient disposition.'

describe('buildTriageReport — cause honesty on an insufficient-data hold', () => {
  it('does NOT blame the referral when our own safety check failed and no gap was named', () => {
    const report = buildTriageReport(
      insufficientDataResult({
        safety_review: { modelSafetyFailure: 'safety_branch_failed' },
      } as Partial<TriageResult>),
    )

    expect(report).not.toContain(BLAMES_REFERRAL)
    expect(report).toContain('The independent safety check did not complete')
    expect(report).toContain('not a gap in the referral')
  })

  it('still blames nothing but the referral when the referral is genuinely thin', () => {
    // No safety failure — the scoring model itself completed and said the note
    // was inadequate. The original copy is correct here and must not change.
    const report = buildTriageReport(insufficientDataResult())
    expect(report).toContain(BLAMES_REFERRAL)
    expect(report).not.toContain('The independent safety check did not complete')
  })

  it('keeps model-identified gaps when a run is BOTH thin and internally failed', () => {
    // The internal-failure copy must not swallow a real, named gap.
    const report = buildTriageReport(
      insufficientDataResult({
        missing_information: ['No neurological exam documented'],
        safety_review: { modelSafetyFailure: 'safety_branch_failed' },
      } as Partial<TriageResult>),
    )

    expect(report).toContain('No neurological exam documented')
    // The generic fallback never appears when real items exist, either way.
    expect(report).not.toContain(BLAMES_REFERRAL)
  })

  it('still states the hold and the scheduling lock regardless of cause', () => {
    // Cause honesty must not soften the hold itself.
    for (const safety of [undefined, { modelSafetyFailure: 'safety_branch_failed' }]) {
      const report = buildTriageReport(
        insufficientDataResult({ safety_review: safety } as Partial<TriageResult>),
      )
      expect(report).toContain('Human review is required')
      expect(report).toContain('Scheduling remains locked.')
    }
  })
})
