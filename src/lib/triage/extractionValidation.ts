import type {
  ExtractionKeyFindings,
  NoteType,
  TriageConfidence,
} from './types'

export interface ClinicalExtractionModelOutput {
  note_type_detected: NoteType
  extraction_confidence: TriageConfidence
  extracted_summary: string
  key_findings: ExtractionKeyFindings
}

const NOTE_TYPES = new Set<NoteType>([
  'ed_note',
  'pcp_note',
  'discharge_summary',
  'specialist_consult',
  'imaging_report',
  'referral',
  'unknown',
])
const CONFIDENCE_LEVELS = new Set<TriageConfidence>([
  'high',
  'moderate',
  'low',
])

export class ClinicalExtractionOutputError extends Error {
  constructor(public readonly field: string, message: string) {
    super(`Invalid clinical extraction output at ${field}: ${message}`)
    this.name = 'ClinicalExtractionOutputError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(
  record: Record<string, unknown>,
  field: string,
  options: { nonEmpty?: boolean; maxLength?: number } = {},
): string {
  const value = record[field]
  if (typeof value !== 'string') {
    throw new ClinicalExtractionOutputError(field, 'must be a string')
  }
  if (options.nonEmpty && !value.trim()) {
    throw new ClinicalExtractionOutputError(field, 'must not be empty')
  }
  if (options.maxLength && value.length > options.maxLength) {
    throw new ClinicalExtractionOutputError(
      field,
      `exceeds ${options.maxLength} characters`,
    )
  }
  return value
}

function requireStringArray(
  record: Record<string, unknown>,
  field: string,
): string[] {
  const value = record[field]
  if (
    !Array.isArray(value) ||
    value.length > 200 ||
    value.some((item) => typeof item !== 'string' || item.length > 5_000)
  ) {
    throw new ClinicalExtractionOutputError(
      field,
      'must be an array of at most 200 bounded strings',
    )
  }
  return value
}

export function validateClinicalExtractionOutput(
  value: unknown,
): ClinicalExtractionModelOutput {
  if (!isRecord(value)) {
    throw new ClinicalExtractionOutputError('$', 'must be an object')
  }

  const noteType = value.note_type_detected
  if (typeof noteType !== 'string' || !NOTE_TYPES.has(noteType as NoteType)) {
    throw new ClinicalExtractionOutputError(
      'note_type_detected',
      'is not an allowed note type',
    )
  }

  const confidence = value.extraction_confidence
  if (
    typeof confidence !== 'string' ||
    !CONFIDENCE_LEVELS.has(confidence as TriageConfidence)
  ) {
    throw new ClinicalExtractionOutputError(
      'extraction_confidence',
      'is not an allowed confidence level',
    )
  }

  const extractedSummary = requireString(value, 'extracted_summary', {
    nonEmpty: true,
    maxLength: 20_000,
  })
  if (!isRecord(value.key_findings)) {
    throw new ClinicalExtractionOutputError(
      'key_findings',
      'must be an object',
    )
  }
  const findings = value.key_findings
  const failedTherapiesValue = findings.failed_therapies
  if (
    !Array.isArray(failedTherapiesValue) ||
    failedTherapiesValue.length > 200
  ) {
    throw new ClinicalExtractionOutputError(
      'key_findings.failed_therapies',
      'must be an array of at most 200 items',
    )
  }
  const failedTherapies = failedTherapiesValue.map((item, index) => {
    const field = `key_findings.failed_therapies[${index}]`
    if (!isRecord(item)) {
      throw new ClinicalExtractionOutputError(
        field,
        'must be an object',
      )
    }
    if (
      typeof item.therapy !== 'string' ||
      item.therapy.length > 5_000 ||
      typeof item.reason_stopped !== 'string' ||
      item.reason_stopped.length > 5_000
    ) {
      throw new ClinicalExtractionOutputError(
        field,
        'therapy and reason_stopped must be bounded strings',
      )
    }
    return {
      therapy: item.therapy,
      reason_stopped: item.reason_stopped,
    }
  })

  return {
    note_type_detected: noteType as NoteType,
    extraction_confidence: confidence as TriageConfidence,
    extracted_summary: extractedSummary,
    key_findings: {
      chief_complaint: requireString(findings, 'chief_complaint', {
        maxLength: 5_000,
      }),
      neurological_symptoms: requireStringArray(
        findings,
        'neurological_symptoms',
      ),
      timeline: requireString(findings, 'timeline', { maxLength: 10_000 }),
      relevant_history: requireString(findings, 'relevant_history', {
        maxLength: 10_000,
      }),
      medications_and_therapies: requireStringArray(
        findings,
        'medications_and_therapies',
      ),
      failed_therapies: failedTherapies,
      imaging_results: requireStringArray(findings, 'imaging_results'),
      red_flags_noted: requireStringArray(findings, 'red_flags_noted'),
      functional_status: requireString(findings, 'functional_status', {
        maxLength: 10_000,
      }),
    },
  }
}
