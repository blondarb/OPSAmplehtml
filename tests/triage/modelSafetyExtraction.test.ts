import { describe, expect, it } from 'vitest'
import {
  ModelSafetyExtractionError,
  validateModelSafetyExtraction,
} from '@/lib/triage/modelSafetyExtraction'

const source =
  'Synthetic chronic history. The patient has sudden right arm weakness now. ' +
  'Later copy: The patient has sudden right arm weakness now.'

function validOutput(): Record<string, unknown> {
  return {
    care_pathway: 'emergency_now',
    data_quality: 'sufficient',
    critical_unknowns: [],
    signals: [
      {
        code: 'acute_focal_deficit',
        syndrome: 'acute_cerebrovascular',
        assertion: 'present',
        temporality: 'current',
        experiencer: 'patient',
        action: 'emergency_now',
        evidence: [
          {
            quote: 'The patient has sudden right arm weakness now.',
            occurrence_index: 1,
          },
        ],
      },
    ],
  }
}

describe('validateModelSafetyExtraction', () => {
  it('resolves exact repeated-source evidence using an explicit occurrence', () => {
    const result = validateModelSafetyExtraction(validOutput(), source)
    const evidence = result.signals[0].evidence[0]

    expect(evidence.quote).toBe(
      'The patient has sudden right arm weakness now.',
    )
    expect(evidence.startOffset).toBe(source.lastIndexOf(evidence.quote))
    expect(source.slice(evidence.startOffset, evidence.endOffset)).toBe(
      evidence.quote,
    )
  })

  it('rejects evidence that is not an exact source span', () => {
    const output = validOutput()
    const signal = (output.signals as Array<Record<string, unknown>>)[0]
    signal.evidence = [{ quote: 'Hallucinated focal deficit.', occurrence_index: 0 }]

    expect(() => validateModelSafetyExtraction(output, source)).toThrow(
      ModelSafetyExtractionError,
    )
  })

  it('rejects invalid assertion, temporality, experiencer, or syndrome enums', () => {
    const output = validOutput()
    const signal = (output.signals as Array<Record<string, unknown>>)[0]
    signal.assertion = 'probably'

    expect(() => validateModelSafetyExtraction(output, source)).toThrow(
      /assertion/,
    )
  })

  it('floors a pathway that understates an emergency signal to emergency_now', () => {
    expect(
      validateModelSafetyExtraction(
        { ...validOutput(), care_pathway: 'same_day_clinician_review' },
        source,
      ),
    ).toMatchObject({ carePathway: 'emergency_now' })
  })

  it('floors a no-signal pathway that understates an immediate-review signal', () => {
    const output = validOutput()
    output.care_pathway = 'no_time_critical_signal'
    const signal = (output.signals as Array<Record<string, unknown>>)[0]
    signal.action = 'immediate_clinician_review'
    signal.assertion = 'uncertain'

    expect(validateModelSafetyExtraction(output, source)).toMatchObject({
      carePathway: 'same_day_clinician_review',
    })
  })

  // Invariant that bounded adjudicator-release depends on: a validated safety
  // result can NEVER be `undetermined` while carrying a grounded emergency (or
  // immediate-review) signal — the floor promotes it. So a `complete` +
  // `undetermined` safety branch provably has zero grounded time-critical
  // signals, which is what makes releasing such a hold safe. (A malformed
  // emergency signal throws instead — the branch fails, never reaching
  // `complete`.) See docs/plans/2026-07-20-bounded-adjudicator-release.md.
  it('floors stated undetermined with an emergency signal to emergency_now (never stays undetermined)', () => {
    expect(
      validateModelSafetyExtraction(
        { ...validOutput(), care_pathway: 'undetermined' },
        source,
      ),
    ).toMatchObject({ carePathway: 'emergency_now' })
  })

  it('floors stated undetermined with an immediate-review signal to same_day (never stays undetermined)', () => {
    const output = validOutput()
    output.care_pathway = 'undetermined'
    const signal = (output.signals as Array<Record<string, unknown>>)[0]
    signal.action = 'immediate_clinician_review'
    signal.assertion = 'uncertain'

    expect(validateModelSafetyExtraction(output, source)).toMatchObject({
      carePathway: 'same_day_clinician_review',
    })
  })

  it('never downgrades a stated pathway more conservative than its signals', () => {
    expect(
      validateModelSafetyExtraction(
        {
          care_pathway: 'same_day_clinician_review',
          data_quality: 'sufficient',
          critical_unknowns: [],
          signals: [],
        },
        source,
      ),
    ).toMatchObject({ carePathway: 'same_day_clinician_review' })
  })

  it('accepts a no-signal result only with an explicit bounded contract', () => {
    expect(
      validateModelSafetyExtraction(
        {
          care_pathway: 'no_time_critical_signal',
          data_quality: 'sufficient',
          critical_unknowns: [],
          signals: [],
        },
        source,
      ),
    ).toMatchObject({
      carePathway: 'no_time_critical_signal',
      signals: [],
    })
  })

  it.each([
    [
      'no-signal pathway with a non-time-sensitive critical unknown',
      {
        care_pathway: 'no_time_critical_signal',
        data_quality: 'sufficient',
        critical_unknowns: ['MRI brain result not yet available.'],
        signals: [],
      },
      'no_time_critical_signal',
    ],
    [
      'no-signal pathway with incomplete data',
      {
        care_pathway: 'no_time_critical_signal',
        data_quality: 'partial',
        critical_unknowns: [],
        signals: [],
      },
      'no_time_critical_signal',
    ],
    [
      'model-selected undetermined pathway with quiet signals',
      {
        care_pathway: 'undetermined',
        data_quality: 'sufficient',
        critical_unknowns: [],
        signals: [],
      },
      'undetermined',
    ],
  ])(
    'accepts %s without forced escalation',
    (_label, output, expectedPathway) => {
      expect(validateModelSafetyExtraction(output, source)).toMatchObject({
        carePathway: expectedPathway,
      })
    },
  )

  it('accepts the specific autonomic dysreflexia syndrome with exact current evidence', () => {
    const adSource =
      'High spinal cord injury with blood pressure 224/118 and pounding headache now.'

    expect(
      validateModelSafetyExtraction(
        {
          care_pathway: 'emergency_now',
          data_quality: 'sufficient',
          critical_unknowns: [],
          signals: [
            {
              code: 'autonomic_dysreflexia_hypertensive_crisis',
              syndrome: 'autonomic_dysreflexia',
              assertion: 'present',
              temporality: 'current',
              experiencer: 'patient',
              action: 'emergency_now',
              evidence: [{ quote: adSource, occurrence_index: 0 }],
            },
          ],
        },
        adSource,
      ),
    ).toMatchObject({
      carePathway: 'emergency_now',
      signals: [expect.objectContaining({ syndrome: 'autonomic_dysreflexia' })],
    })
  })

  it('preserves escalation but normalizes unsupported autonomic dysreflexia labeling', () => {
    const nmsSource =
      'After a haloperidol increase, the patient has fever, rigidity, obtundation, and marked autonomic instability.'

    expect(
      validateModelSafetyExtraction(
        {
          care_pathway: 'emergency_now',
          data_quality: 'sufficient',
          critical_unknowns: [],
          signals: [
            {
              code: 'autonomic_instability_current',
              syndrome: 'autonomic_dysreflexia',
              assertion: 'present',
              temporality: 'current',
              experiencer: 'patient',
              action: 'emergency_now',
              evidence: [{ quote: nmsSource, occurrence_index: 0 }],
            },
          ],
        },
        nmsSource,
      ),
    ).toMatchObject({
      carePathway: 'emergency_now',
      signals: [expect.objectContaining({ syndrome: 'other_time_critical' })],
    })
  })
})
