import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ValidationReviewForm } from '@/components/triage/ValidationReviewForm'
import { clinicalAssessmentDraftForAction, clinicalAssessmentTiersForAction, EMPTY_CLINICAL_ASSESSMENT_DRAFT } from '@/lib/triage/validationTypes'

const activeCase = {
  id: 'case-synthetic-1',
  case_number: 1,
  referral_text: 'SYNTHETIC TEST CASE',
  reviewed: false,
}

describe('ValidationReviewForm', () => {
  it('renders the required reviewer-owned wait comfort field without an AI answer', () => {
    const html = renderToStaticMarkup(
      <ValidationReviewForm
        caseNumber={activeCase.case_number}
        tier="routine"
        confidence=""
        waitComfort=""
        reasoning=""
        clinicalAssessment={{ ...EMPTY_CLINICAL_ASSESSMENT_DRAFT, services: [] }}
        disabled={false}
        submitting={false}
        onTier={() => undefined}
        onConfidence={() => undefined}
        onWaitComfort={() => undefined}
        onReasoning={() => undefined}
        onClinicalAssessment={() => undefined}
        onSubmit={() => undefined}
      />,
    )

    expect(html).toContain('Comfort with the wait for your selected urgency')
    expect(html).toContain('Within 8-12 Weeks')
    expect(html).toContain('name="comfortable_with_wait"')
    expect(html).not.toContain('AI answer')
  })

  it('renders the versioned action, timing, plural services, and missing-facts fields', () => {
    const html = renderToStaticMarkup(<ValidationReviewForm caseNumber={1} tier="routine" confidence="high" waitComfort="yes" reasoning="" clinicalAssessment={{ ...EMPTY_CLINICAL_ASSESSMENT_DRAFT, action: 'outpatient_assessment', origin: 'decision_time', intervalValue: '24', services: ['MS / Neuroimmunology'], decisiveMissingFacts: '' }} disabled={false} submitting={false} onTier={() => undefined} onConfidence={() => undefined} onWaitComfort={() => undefined} onReasoning={() => undefined} onClinicalAssessment={() => undefined} onSubmit={() => undefined} />)
    expect(html).toContain('Assessment action')
    expect(html).toContain('Latest safe assessment')
    expect(html).toContain('Services to involve')
    expect(html).toContain('MS / Neuroimmunology')
    expect(html).toContain('Decisive missing facts')
  })

  it('sets immediate actions to decision time with a zero-minute interval', () => {
    expect(clinicalAssessmentDraftForAction({ ...EMPTY_CLINICAL_ASSESSMENT_DRAFT, services: [], origin: 'unknown', intervalValue: '', anchor: 'forged' }, 'emergency_now')).toMatchObject({ action: 'emergency_now', origin: 'decision_time', intervalValue: '0', intervalUnit: 'minutes', anchor: '' })
    expect(clinicalAssessmentDraftForAction({ ...EMPTY_CLINICAL_ASSESSMENT_DRAFT, services: [], action: 'emergency_now', origin: 'decision_time', intervalValue: '0', intervalUnit: 'minutes' }, 'outpatient_assessment')).toMatchObject({ action: 'outpatient_assessment', origin: '', intervalValue: '', intervalUnit: 'hours' })
    const html = renderToStaticMarkup(<ValidationReviewForm caseNumber={1} tier="urgent" confidence="high" waitComfort="no" reasoning="" clinicalAssessment={{ ...EMPTY_CLINICAL_ASSESSMENT_DRAFT, services: [], action: 'clinician_review_now', origin: 'decision_time', intervalValue: '0', intervalUnit: 'minutes' }} disabled={false} submitting={false} onTier={() => undefined} onConfidence={() => undefined} onWaitComfort={() => undefined} onReasoning={() => undefined} onClinicalAssessment={() => undefined} onSubmit={() => undefined} />)
    expect(html).toContain('Clinician review now cannot be marked comfortable with the legacy urgent comparison wait.')
    expect(html).toContain('value="urgent"')
    expect(html).toContain('value="insufficient_data"')
    expect(html).not.toContain('value="routine"')
    expect(html).not.toContain('> Yes')
    const emergencyHtml = renderToStaticMarkup(<ValidationReviewForm caseNumber={1} tier="emergent" confidence="high" waitComfort="yes" reasoning="" clinicalAssessment={{ ...EMPTY_CLINICAL_ASSESSMENT_DRAFT, services: [], action: 'emergency_now', origin: 'decision_time', intervalValue: '0', intervalUnit: 'minutes' }} disabled={false} submitting={false} onTier={() => undefined} onConfidence={() => undefined} onWaitComfort={() => undefined} onReasoning={() => undefined} onClinicalAssessment={() => undefined} onSubmit={() => undefined} />)
    expect(emergencyHtml).toContain('> Yes')
  })

  it('limits legacy comparison tiers to the selected clinical action', () => {
    expect(clinicalAssessmentTiersForAction('emergency_now')).toEqual(['emergent'])
    expect(clinicalAssessmentTiersForAction('clinician_review_now')).toEqual(['urgent', 'insufficient_data'])
    expect(clinicalAssessmentTiersForAction('outpatient_assessment')).toEqual(['urgent', 'semi_urgent', 'routine_priority', 'routine', 'non_urgent'])
  })
})
