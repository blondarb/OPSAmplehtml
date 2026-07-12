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

  it('rejects a pathway that understates an emergency signal', () => {
    expect(() =>
      validateModelSafetyExtraction(
        { ...validOutput(), care_pathway: 'same_day_clinician_review' },
        source,
      ),
    ).toThrow(/care_pathway/)
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
      'no-signal pathway with a critical unknown',
      {
        care_pathway: 'no_time_critical_signal',
        data_quality: 'sufficient',
        critical_unknowns: ['Current onset is unknown.'],
        signals: [],
      },
    ],
    [
      'no-signal pathway with incomplete data',
      {
        care_pathway: 'no_time_critical_signal',
        data_quality: 'partial',
        critical_unknowns: [],
        signals: [],
      },
    ],
    [
      'undetermined pathway with sufficient complete data',
      {
        care_pathway: 'undetermined',
        data_quality: 'sufficient',
        critical_unknowns: [],
        signals: [],
      },
    ],
  ])('rejects %s', (_label, output) => {
    expect(() => validateModelSafetyExtraction(output, source)).toThrow(
      /care_pathway/,
    )
  })

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
