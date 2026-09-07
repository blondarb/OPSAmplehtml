import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { deriveClinicalTiming, projectClinicalTiming, withClinicalTimingAction, type ConfirmedTimingPolicy } from '@/lib/triage/clinicalTiming'
import { clinicalTimingLines } from '@/lib/triage/clinicalTimingPresentation'
import { runEmergencyGateway } from '@/lib/triage/emergencyGateway'

const decisionAt = '2026-09-05T12:00:00Z'
const onsetSource = 'Synthetic referral.\nSymptom onset: 2026-08-24T12:00:00Z\nEstablished MS with new functionally limiting symptoms; no relapse assessment yet. Infection status is unknown.'
function policy(source = onsetSource): ConfirmedTimingPolicy {
  return { policyId: 'ms_relapse_assessment_treatment_window_v1', sourceDigest: createHash('sha256').update(source).digest('hex'), confirmedAt: decisionAt, confirmationId: 'synthetic-clinician-confirmation' }
}
const base = { sourceText: onsetSource, decisionAt, decisionTimeZone: 'UTC', carePathway: 'expedited_outpatient' as const }

describe('source-linked clinical chronology', () => {
  it('C08 preserves 12 elapsed days and the 2 days remaining in a confirmed onset-based window', () => {
    const timing = deriveClinicalTiming({ ...base, confirmedPolicy: policy() })
    expect(timing.assessmentDeadline).toMatchObject({
      state: 'established', anchor: 'onset',
      dueWindow: { earliest: '2026-09-07T12:00:00.000Z', latest: '2026-09-07T12:00:00.000Z' },
      remaining: { asOf: decisionAt, earliestDueInSeconds: 2 * 86400, latestDueInSeconds: 2 * 86400, state: 'remaining' },
    })
    expect(clinicalTimingLines(timing).join('\n')).toContain('not permission to wait')
    expect(clinicalTimingLines(timing).join('\n')).toContain('12.0 days')
    const later = deriveClinicalTiming({ ...base, decisionAt: '2026-09-08T12:00:00Z', confirmedPolicy: policy() })
    expect(later.assessmentDeadline).toMatchObject({
      state: 'established', dueWindow: { latest: '2026-09-07T12:00:00.000Z' },
      remaining: { latestDueInSeconds: -86400, state: 'overdue' },
    })
  })

  it('does not select a clinical timing policy from an MS keyword or the model', () => {
    expect(deriveClinicalTiming(base).assessmentDeadline).toEqual({ state: 'indeterminate', reasons: ['no_confirmed_condition_timing_policy'] })
  })

  it.each([
    ['no onset', 'Synthetic MS note without onset.'],
    ['malformed date', 'Symptom onset: 2026-02-30'],
    ['relative time', 'Symptom onset: 12 days ago'],
    ['conflicting dates', 'Symptom onset: 2026-08-24\nSymptom onset: 2026-09-03'],
    ['future onset', 'Symptom onset: 2026-10-03'],
  ])('keeps %s indeterminate without inventing a remaining interval', (_label, sourceText) => {
    const result = deriveClinicalTiming({ ...base, sourceText, confirmedPolicy: policy(sourceText) })
    expect(result.assessmentDeadline.state).toBe('indeterminate')
    expect(result.assessmentDeadline).not.toHaveProperty('remaining')
  })

  it('retains date-only precision as a range, and refuses unsupported local calendars', () => {
    const sourceText = 'Symptom onset: 2026-08-24'
    const timing = deriveClinicalTiming({ ...base, sourceText, confirmedPolicy: policy(sourceText) })
    expect(timing.chronology.onset).toMatchObject({ state: 'known', precision: 'date', value: '2026-08-24' })
    expect(timing.assessmentDeadline).toMatchObject({
      state: 'established', dueWindow: { earliest: '2026-09-07T00:00:00.000Z', latest: '2026-09-07T23:59:59.999Z' },
    })
    for (const decisionTimeZone of [null, 'America/Denver']) {
      expect(deriveClinicalTiming({ ...base, sourceText, decisionTimeZone, confirmedPolicy: policy(sourceText) }).assessmentDeadline)
        .toMatchObject({ state: 'indeterminate', reasons: ['supported_calendar_timezone_required'] })
    }
  })

  it('rejects unsupported or unbound policy selection and invalid decision clocks', () => {
    for (const confirmedPolicy of [
      { ...policy(), policyId: 'unsupported' as ConfirmedTimingPolicy['policyId'] },
      { ...policy(), sourceDigest: 'wrong-source' },
      { ...policy(), confirmationId: '' },
      { ...policy(), confirmedAt: '2026-09-06T12:00:00Z' },
    ]) expect(deriveClinicalTiming({ ...base, confirmedPolicy }).assessmentDeadline.state).toBe('indeterminate')
    for (const clock of ['2026-02-30T00:00:00Z', '2026-09-05', '2026-09-05T25:00:00Z', 'yesterday']) {
      expect(() => deriveClinicalTiming({ ...base, decisionAt: clock })).toThrow('decision clock')
    }
  })

  it('preserves exact quote offsets and never uses a document date as symptom onset or clearance', () => {
    const sourceText = 'Document date: 2026-01-02\nCompleted assessment date: 2026-01-02\nSynthetic prior note.'
    const timing = deriveClinicalTiming({ ...base, sourceText })
    expect(timing.chronology.onset.state).toBe('unknown')
    expect(timing.issues).toContain('documented_assessment_date_does_not_establish_clearance')
    for (const fact of timing.chronology.sourceDates) {
      for (const evidence of fact.evidence) expect(sourceText.slice(evidence.startOffset, evidence.endOffset)).toBe(evidence.quote)
    }
  })

  it('C01 keeps immediate review authoritative without workup or an outpatient wait', () => {
    const timing = deriveClinicalTiming({ ...base, carePathway: 'same_day_clinician_review', reviewRequirement: 'immediate_clinician_review' })
    expect(timing.action.requirement).toBe('immediate_clinician_review')
    expect(timing.assessmentDeadline).toMatchObject({ state: 'established', policyId: 'immediate_action', interval: { value: 0 } })
    expect(withClinicalTimingAction(timing, 'emergency_now', 'emergency_action').action.requirement).toBe('emergency_evaluation_now')
  })

  it('re-derives optional poll chronology from its exact source and clock; ignores invented stored deadlines', () => {
    const timing = deriveClinicalTiming(base)
    const forged = { ...timing, assessmentDeadline: { state: 'established', remaining: { latestDueInSeconds: 9000000 } } }
    expect(projectClinicalTiming({ clinicalTiming: forged }, onsetSource, 'same_day_clinician_review', 'immediate_clinician_review')?.assessmentDeadline)
      .toMatchObject({ state: 'established', policyId: 'immediate_action', remaining: { latestDueInSeconds: 0 } })
    expect(projectClinicalTiming({ clinicalTiming: timing }, 'Changed source', 'routine_outpatient', 'clinician_confirmation')).toBeNull()
    expect(projectClinicalTiming({}, onsetSource, 'routine_outpatient', 'clinician_confirmation')).toBeNull()
  })

  it('C11 treats earlier documents consistently across a calendar-year boundary and retains appended current threats', () => {
    const source = (date: string) => `Document date: ${date}\nSudden aphasia and right arm weakness.`
    const oldYear = runEmergencyGateway(source('2025-12-30'), { decisionAsOf: '2026-09-05' })
    const sameYear = runEmergencyGateway(source('2026-01-02'), { decisionAsOf: '2026-09-05' })
    expect(sameYear.carePathway).toBe(oldYear.carePathway)
    expect(sameYear.signals.map(signal => signal.temporality)).toEqual(oldYear.signals.map(signal => signal.temporality))
    expect(sameYear.signals.some(signal => signal.temporality === 'unknown')).toBe(true)
    for (const date of ['2025-12-30', '2026-01-02']) {
      const appended = runEmergencyGateway(`${source(date)}\nDocument date: 2026-09-05\nCurrent sudden aphasia with right arm weakness started 30 minutes ago.`, { decisionAsOf: '2026-09-05' })
      expect(appended.carePathway).toBe('emergency_now')
    }
  })
})
