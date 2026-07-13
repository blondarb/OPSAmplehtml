import { describe, expect, it } from 'vitest'
import {
  ClinicalExtractionOutputError,
  validateClinicalExtractionOutput,
} from '@/lib/triage/extractionValidation'

function validOutput(): Record<string, unknown> {
  return {
    note_type_detected: 'referral',
    extraction_confidence: 'high',
    extracted_summary: 'Synthetic referral summary with a documented timeline.',
    key_findings: {
      chief_complaint: 'Synthetic headache',
      neurological_symptoms: ['headache'],
      timeline: 'Three months, stable',
      relevant_history: 'No synthetic relevant history',
      medications_and_therapies: ['synthetic therapy'],
      failed_therapies: [
        { therapy: 'synthetic medication', reason_stopped: 'ineffective' },
      ],
      imaging_results: [],
      red_flags_noted: [],
      functional_status: 'Independent',
    },
  }
}

describe('validateClinicalExtractionOutput', () => {
  it('accepts a complete extraction contract', () => {
    expect(validateClinicalExtractionOutput(validOutput())).toMatchObject({
      note_type_detected: 'referral',
      extraction_confidence: 'high',
    })
  })

  it.each([
    ['invalid note type', { note_type_detected: 'invoice' }],
    ['invalid confidence', { extraction_confidence: 'certain' }],
    ['empty summary', { extracted_summary: '   ' }],
  ])('rejects %s', (_label, patch) => {
    expect(() =>
      validateClinicalExtractionOutput({ ...validOutput(), ...patch }),
    ).toThrow(ClinicalExtractionOutputError)
  })

  it('rejects a missing nested clinical field', () => {
    const output = validOutput()
    const findings = { ...(output.key_findings as Record<string, unknown>) }
    delete findings.timeline

    expect(() =>
      validateClinicalExtractionOutput({ ...output, key_findings: findings }),
    ).toThrow(/timeline/)
  })

  it('rejects non-string items in evidence arrays', () => {
    const output = validOutput()
    const findings = {
      ...(output.key_findings as Record<string, unknown>),
      red_flags_noted: ['valid', { fabricated: true }],
    }

    expect(() =>
      validateClinicalExtractionOutput({ ...output, key_findings: findings }),
    ).toThrow(/red_flags_noted/)
  })

  it('rejects malformed failed-therapy evidence', () => {
    const output = validOutput()
    const findings = {
      ...(output.key_findings as Record<string, unknown>),
      failed_therapies: [{ therapy: 'synthetic medication' }],
    }

    expect(() =>
      validateClinicalExtractionOutput({ ...output, key_findings: findings }),
    ).toThrow(/failed_therapies/)
  })
})
