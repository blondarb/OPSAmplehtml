import { describe, expect, it, vi } from 'vitest'

import type { HistorianTranscriptEntry } from '@/lib/historianTypes'
import { createMedicationReconciliationState } from '@/lib/historian/medicationReconciliation'

const invokeBedrockClinicalToolMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/bedrock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/bedrock')>()),
  invokeBedrockClinicalTool: invokeBedrockClinicalToolMock,
}))

import {
  CLINICIAN_HISTORY_SECTION_IDS,
  clinicianHistoryReportInputDigest,
  generateClinicianHistoryReport,
  parseClinicianHistoryReportModelOutput,
  redactMedicationNameSpans,
} from '@/lib/historian/eval/clinicianHistoryReport'

const transcript: HistorianTranscriptEntry[] = [
  { role: 'assistant', text: 'What brings you in?', timestamp: 1, seq: 1 },
  { role: 'user', text: 'I have throbbing headaches twice a week.', timestamp: 2, seq: 2 },
  { role: 'assistant', text: 'Anything else?', timestamp: 3, seq: 3 },
  { role: 'user', text: 'Light bothers me and I miss work when it happens.', timestamp: 4, seq: 4 },
  { role: 'assistant', text: 'What medication do you take?', timestamp: 5, seq: 5 },
  { role: 'user', text: 'I take ibuprofen 400 mg as needed.', timestamp: 6, seq: 6 },
  { role: 'assistant', text: 'What prior testing or treatment have you had?', timestamp: 7, seq: 7 },
  { role: 'user', text: 'I have not had prior testing or treatment.', timestamp: 8, seq: 8 },
]

function medicationState() {
  const state = createMedicationReconciliationState()
  state.items.push({
    id: 'med-6-ibuprofen', heardName: 'ibuprofen', sourcePatientSeq: 6,
    nameStatus: 'confirmed', nameConfirmationAttempts: 1,
    dose: { status: 'known', value: '400 mg', patientSeqs: [6], attempts: 1 },
    frequency: { status: 'known', value: 'as needed', patientSeqs: [6], attempts: 1 },
  })
  return state
}

function output(overrides: Record<string, unknown> = {}) {
  const groundedCoreClaims: Partial<Record<(typeof CLINICIAN_HISTORY_SECTION_IDS)[number], {
    text: string
    citations: Array<{ patient_seq: number; quote: string }>
  }>> = {
    chief_concern_and_timeline: {
      text: 'I have throbbing headaches twice a week.',
      citations: [{ patient_seq: 2, quote: 'I have throbbing headaches twice a week.' }],
    },
    symptom_characterization: {
      text: 'I have throbbing headaches twice a week.',
      citations: [{ patient_seq: 2, quote: 'I have throbbing headaches twice a week.' }],
    },
    associated_features: {
      text: 'Light bothers me and I miss work when it happens.',
      citations: [{ patient_seq: 4, quote: 'Light bothers me and I miss work when it happens.' }],
    },
    functional_impact: {
      text: 'Light bothers me and I miss work when it happens.',
      citations: [{ patient_seq: 4, quote: 'Light bothers me and I miss work when it happens.' }],
    },
    prior_evaluation_and_treatment: {
      text: 'I have not had prior testing or treatment.',
      citations: [{ patient_seq: 8, quote: 'I have not had prior testing or treatment.' }],
    },
  }
  return {
    sections: CLINICIAN_HISTORY_SECTION_IDS.map((id) => ({
      id,
      claims: groundedCoreClaims[id] ? [groundedCoreClaims[id]] : [],
    })),
    ...overrides,
  }
}

function reportTranscript() {
  return redactMedicationNameSpans(transcript, medicationState()).transcript
}

describe('ClinicianHistoryReportV1', () => {
  it('accepts exactly the fixed section set with exact patient-only quotes', () => {
    const parsed = parseClinicianHistoryReportModelOutput(output(), reportTranscript(), medicationState(), 'complete')
    expect(parsed).toHaveLength(10)
    expect(parsed[0].claims[0].citations[0]).toEqual({
      patient_seq: 2, quote: 'I have throbbing headaches twice a week.',
    })
  })

  it.each([
    ['unknown section', output({ sections: [...output().sections.slice(0, 9), { id: 'medications', claims: [] }] })],
    ['duplicate section', output({ sections: [...output().sections.slice(0, 9), { id: 'family_history', claims: [] }] })],
    ['missing section', output({ sections: output().sections.slice(0, 9) })],
  ])('rejects %s', (_name, malformed) => {
    expect(() => parseClinicianHistoryReportModelOutput(malformed, reportTranscript(), medicationState(), 'complete')).toThrow()
  })

  it('rejects assistant citations and non-verbatim patient quotes', () => {
    const assistantQuote = output()
    assistantQuote.sections[0].claims[0].citations[0] = { patient_seq: 1, quote: 'What brings you in?' }
    expect(() => parseClinicianHistoryReportModelOutput(assistantQuote, reportTranscript(), medicationState(), 'complete')).toThrow()

    const paraphrase = output()
    paraphrase.sections[0].claims[0].citations[0] = { patient_seq: 2, quote: 'I get headaches twice weekly' }
    expect(() => parseClinicianHistoryReportModelOutput(paraphrase, reportTranscript(), medicationState(), 'complete')).toThrow()
  })

  it('redacts trusted and formulary medication names before model input', () => {
    const redacted = redactMedicationNameSpans(transcript, medicationState())
    expect(redacted.transcript[5].text).toBe('[medication redacted]')
    expect(redacted.transcript[5].text).not.toContain('ibuprofen')
    expect(redacted.redactedSpanCount).toBeGreaterThan(0)
  })

  it('removes an unrecognized medication answer when the application ledger is still empty', () => {
    const partial = [
      { role: 'assistant' as const, text: 'What medications do you take?', timestamp: 1, seq: 1 },
      { role: 'user' as const, text: 'Tirzepatide once weekly.', timestamp: 2, seq: 2 },
      { role: 'assistant' as const, text: 'How do the headaches feel?', timestamp: 3, seq: 3 },
      { role: 'user' as const, text: 'They are throbbing.', timestamp: 4, seq: 4 },
    ]
    const redacted = redactMedicationNameSpans(partial, createMedicationReconciliationState())
    expect(redacted.transcript[1].text).toBe('[medication redacted]')
    expect(JSON.stringify(redacted.transcript)).not.toContain('Tirzepatide')
    expect(redacted.transcript[3].text).toBe('They are throbbing.')
  })

  it('rejects medication substitution in a model-authored claim', () => {
    const substituted = output()
    substituted.sections[0].claims[0].text = 'The patient takes trazodone.'
    expect(() => parseClinicianHistoryReportModelOutput(substituted, reportTranscript(), medicationState(), 'complete')).toThrow()
  })

  it('rejects uncited paraphrase or inference even when its citation is valid', () => {
    const inferred = output()
    inferred.sections[0].claims[0].text = 'The pattern is compatible with recurrent migraine.'
    expect(() => parseClinicianHistoryReportModelOutput(inferred, reportTranscript(), medicationState(), 'complete')).toThrow(
      /exact cited patient quote/i,
    )
  })

  it('rejects an empty shell report as complete but permits empty sections for a partial report', () => {
    const empty = {
      sections: CLINICIAN_HISTORY_SECTION_IDS.map((id) => ({ id, claims: [] })),
    }
    expect(() => parseClinicianHistoryReportModelOutput(
      empty,
      reportTranscript(),
      medicationState(),
      'complete',
    )).toThrow(/grounded core section/i)
    expect(parseClinicianHistoryReportModelOutput(
      empty,
      reportTranscript(),
      medicationState(),
      'partial',
    )).toHaveLength(CLINICIAN_HISTORY_SECTION_IDS.length)
  })

  it('rejects a claim built from a redaction marker', () => {
    const marker = output()
    marker.sections[0].claims[0] = {
      text: '[medication redacted]',
      citations: [{ patient_seq: 2, quote: '[medication redacted]' }],
    }
    expect(() => parseClinicianHistoryReportModelOutput(
      marker,
      [{ role: 'user', text: '[medication redacted]', timestamp: 1, seq: 2 }],
      medicationState(),
      'partial',
    )).toThrow()
  })

  it('has a stable digest for the same trusted inputs and changes when they change', () => {
    const input = {
      transcript,
      medicationReconciliation: medicationState(),
      reportStatus: 'complete' as const,
      limitations: ['Synthetic QA only'],
      terminationReason: 'coverage_complete' as const,
      patientTurnCount: 2,
      reviewedThroughSeq: 4,
    }
    expect(clinicianHistoryReportInputDigest(input)).toBe(clinicianHistoryReportInputDigest(input))
    expect(clinicianHistoryReportInputDigest({ ...input, limitations: [] })).not.toBe(clinicianHistoryReportInputDigest(input))
  })

  it('copies trusted medication reconciliation and application limitations without model authorship', async () => {
    invokeBedrockClinicalToolMock.mockResolvedValue({ parsed: output(), raw: '{}', stopReason: 'tool_use' })
    const medications = medicationState()
    const report = await generateClinicianHistoryReport({
      transcript,
      medicationReconciliation: medications,
      reportStatus: 'complete_with_uncertainty',
      limitations: ['History is patient-reported.'],
      terminationReason: 'complete_with_uncertainty',
      patientTurnCount: 2,
      reviewedThroughSeq: 4,
    })
    expect(report.report_status).toBe('complete_with_uncertainty')
    expect(report.medication_reconciliation).toBe(medications)
    expect(report.limitations).toEqual(['History is patient-reported.'])
    const prompt = invokeBedrockClinicalToolMock.mock.calls[0][0].messages[0].content as string
    expect(prompt).not.toContain('ibuprofen')
    expect(prompt).toContain('[medication redacted]')
  })
})
