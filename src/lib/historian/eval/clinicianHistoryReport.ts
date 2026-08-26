/**
 * Grounded clinician history report for a completed Historian interview.
 *
 * This is deliberately separate from the differential pipeline.  It turns a
 * completed interview into an auditable history summary, but does not diagnose,
 * recommend treatment, normalize medication names, or create a patient-facing
 * result.  Every generated claim must carry an exact quote from a patient turn.
 */

import { createHash } from 'node:crypto'

import type { HistorianTerminationReason, HistorianTranscriptEntry } from '@/lib/historianTypes'
import type { MedicationReconciliationState } from '@/lib/historian/medicationReconciliation'
import { NEURO_FORMULARY } from '@/lib/neuroFormulary'
import { invokeBedrockClinicalToolWithMeta } from './bedrockMeta'

export const CLINICIAN_HISTORY_REPORT_VERSION = 1 as const
export const CLINICIAN_HISTORY_REPORT_PROMPT_VERSION = 'clinician-history-report-v1' as const

/** Durable report contract name; currently backed by the trusted live ledger. */
export type MedicationReconciliationV1 = MedicationReconciliationState

/** These ids are an API contract.  Append a new version rather than editing them. */
export const CLINICIAN_HISTORY_SECTION_IDS = [
  'chief_concern_and_timeline',
  'symptom_characterization',
  'associated_features',
  'red_flags_and_safety',
  'functional_impact',
  'prior_evaluation_and_treatment',
  'past_medical_history',
  'neurologic_history',
  'family_history',
  'social_history',
] as const

/** A normally completed interview cannot yield an empty shell report. */
export const CLINICIAN_HISTORY_REQUIRED_COMPLETE_SECTION_IDS = [
  'chief_concern_and_timeline',
  'symptom_characterization',
  'associated_features',
  'functional_impact',
  'prior_evaluation_and_treatment',
] as const

export type ClinicianHistorySectionId = typeof CLINICIAN_HISTORY_SECTION_IDS[number]
export type ClinicianHistoryReportStatus = 'complete' | 'complete_with_uncertainty' | 'partial'

export interface ClinicianHistoryClaim {
  text: string
  citations: Array<{ patient_seq: number; quote: string }>
}

export interface ClinicianHistorySection {
  id: ClinicianHistorySectionId
  claims: ClinicianHistoryClaim[]
}

export interface ClinicianHistoryReportV1 {
  version: typeof CLINICIAN_HISTORY_REPORT_VERSION
  report_status: ClinicianHistoryReportStatus
  input_digest: string
  sections: ClinicianHistorySection[]
  /** Application-owned ledger. Never generated, changed, or named by the model. */
  medication_reconciliation: MedicationReconciliationV1
  /** Application-owned limitations, not a model inference. */
  limitations: string[]
  completion: {
    termination_reason: HistorianTerminationReason
    patient_turn_count: number
    reviewed_through_seq: number | null
  }
  provenance: {
    model_id: string
    prompt_version: typeof CLINICIAN_HISTORY_REPORT_PROMPT_VERSION
    inference_params: { temperature: number; max_tokens: number; tool: string }
    generated_at: string
    transcript_digest: string
    redacted_medication_span_count: number
  }
}

export interface ClinicianHistoryReportInput {
  transcript: HistorianTranscriptEntry[]
  medicationReconciliation: MedicationReconciliationV1
  reportStatus: ClinicianHistoryReportStatus
  limitations: string[]
  terminationReason: HistorianTerminationReason
  patientTurnCount: number
  reviewedThroughSeq: number | null
}

interface ModelClaim {
  text: string
  citations: Array<{ patient_seq: number; quote: string }>
}

interface ModelSection {
  id: ClinicianHistorySectionId
  claims: ModelClaim[]
}

interface ModelOutput { sections: ModelSection[] }

const TOOL_NAME = 'record_grounded_clinician_history'
const TEMPERATURE = 0
const MAX_TOKENS = 3500
const MAX_CLAIMS_PER_SECTION = 8
const MAX_CITATIONS_PER_CLAIM = 4

const CLAIM_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    citations: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_CITATIONS_PER_CLAIM,
      items: {
        type: 'object',
        properties: {
          patient_seq: { type: 'integer', minimum: 0 },
          quote: { type: 'string' },
        },
        required: ['patient_seq', 'quote'],
      },
    },
  },
  required: ['text', 'citations'],
} as const

const MODEL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      minItems: CLINICIAN_HISTORY_SECTION_IDS.length,
      maxItems: CLINICIAN_HISTORY_SECTION_IDS.length,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: CLINICIAN_HISTORY_SECTION_IDS },
          claims: { type: 'array', maxItems: MAX_CLAIMS_PER_SECTION, items: CLAIM_SCHEMA },
        },
        required: ['id', 'claims'],
      },
    },
  },
  required: ['sections'],
} as const

const SYSTEM_PROMPT = `You create a concise clinician-facing history summary from a numbered interview transcript.

This is a history artifact, not a diagnosis, treatment recommendation, medication reconciliation, or patient-facing response. Return exactly the ten requested section ids and no other section. A section may have an empty claims array when the patient did not provide that history.

Grounding rules are strict:
- Every claim must cite one or more PATIENT turns only.
- Every quote must be copied character-for-character from the cited patient turn.
- The claim text itself must exactly equal one of its citation quotes. Select and organize the most useful patient statements; do not paraphrase them.
- Do not infer, fill gaps, change uncertainty into fact, or cite Historian turns.
- The transcript has medication names redacted. Do not mention any medication, dose, frequency, or medication interpretation anywhere in your output.
- Do not diagnose, rank diagnoses, recommend treatment, or state clinical conclusions.
`

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`
}

function digest(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex')
}

function medicationTerms(medications: MedicationReconciliationState): string[] {
  return [...new Set([
    ...medications.items.map((item) => item.heardName),
    ...NEURO_FORMULARY.flatMap((item) => [item.name, item.generic_name]),
  ].map((value) => value.trim()).filter((value) => value.length >= 3))]
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const MEDICATION_DISCUSSION_RE =
  /\b(?:medications?|medicines?|prescriptions?|over-the-counter|supplements?|vitamins?|dose|dosage|amount|pills?|tablets?|capsules?|injections?)\b/i
const FIRST_PERSON_MEDICATION_ACTION_RE =
  /\b(?:i|we)\s+(?:(?:am|are|was|were)\s+)?(?:currently\s+)?(?:take|taking|use|using|inject|injecting)\b/i

function medicationResponseSeqs(
  transcript: readonly HistorianTranscriptEntry[],
  medications: MedicationReconciliationState,
  terms: readonly string[],
): Set<number> {
  const redacted = new Set<number>()
  if (medications.inventoryPatientSeq != null) redacted.add(medications.inventoryPatientSeq)
  for (const item of medications.items) {
    // Every ledger-bound medication turn is removed from model input. The
    // separately supplied application ledger is the sole authority even when
    // the patient confirmed the name, amount, and schedule.
    redacted.add(item.sourcePatientSeq)
    item.dose.patientSeqs.forEach((seq) => redacted.add(seq))
    item.frequency.patientSeqs.forEach((seq) => redacted.add(seq))
  }

  for (let index = 0; index < transcript.length; index += 1) {
    const entry = transcript[index]
    if (entry.role === 'assistant' && MEDICATION_DISCUSSION_RE.test(entry.text)) {
      const answer = transcript.slice(index + 1).find((candidate) => candidate.role === 'user')
      if (answer?.seq != null) redacted.add(answer.seq)
      continue
    }
    if (entry.role !== 'user' || entry.seq == null) continue
    const containsKnownName = terms.some((term) => (
      entry.text.toLocaleLowerCase().includes(term.toLocaleLowerCase())
    ))
    // A medication-like patient statement with no known name is unsafe to
    // expose to a model: it may contain a missed or misheard name that the
    // application ledger has not verified. Conservatively remove the turn.
    if (!containsKnownName && (
      MEDICATION_DISCUSSION_RE.test(entry.text) ||
      FIRST_PERSON_MEDICATION_ACTION_RE.test(entry.text)
    )) redacted.add(entry.seq)
  }
  return redacted
}

/** Redacts known medication names before they reach the report model. */
export function redactMedicationNameSpans(
  transcript: readonly HistorianTranscriptEntry[],
  medications: MedicationReconciliationState,
): { transcript: HistorianTranscriptEntry[]; redactedSpanCount: number } {
  const terms = medicationTerms(medications).sort((a, b) => b.length - a.length)
  const fullTurnRedactions = medicationResponseSeqs(transcript, medications, terms)
  let count = 0
  const pattern = terms.length
    ? new RegExp(`\\b(?:${terms.map(escapeRegex).join('|')})\\b`, 'gi')
    : null
  return {
    transcript: transcript.map((entry) => ({
      ...entry,
      text: entry.seq != null && fullTurnRedactions.has(entry.seq)
        ? (() => {
          count += 1
          return '[medication redacted]'
        })()
        : pattern
        ? entry.text.replace(pattern, () => {
          count += 1
          return '[medication redacted]'
        })
        : entry.text,
    })),
    redactedSpanCount: count,
  }
}

function numberedTranscript(transcript: readonly HistorianTranscriptEntry[]): string {
  return transcript.map((entry) => (
    `Turn ${entry.seq} (${entry.role === 'user' ? 'Patient' : 'Historian'}): ${entry.text}`
  )).join('\n')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index])
}

function containsMedicationTerm(text: string, terms: readonly string[]): boolean {
  const lowered = text.toLocaleLowerCase()
  return terms.some((term) => lowered.includes(term.toLocaleLowerCase()))
}

/**
 * Fail-closed parser for the model-only portion of the report.  It does not
 * silently drop malformed claims: losing a claim would make a clinician think
 * the generated report was complete when it was not.
 */
export function parseClinicianHistoryReportModelOutput(
  raw: unknown,
  modelTranscript: readonly HistorianTranscriptEntry[],
  medications: MedicationReconciliationState,
  reportStatus: ClinicianHistoryReportStatus,
): ClinicianHistorySection[] {
  if (!isPlainObject(raw) || !hasExactKeys(raw, ['sections']) || !Array.isArray(raw.sections)) {
    throw new Error('Clinician history report model output has an invalid schema.')
  }
  if (raw.sections.length !== CLINICIAN_HISTORY_SECTION_IDS.length) {
    throw new Error('Clinician history report must contain exactly the fixed section set.')
  }
  const allowedIds = new Set<string>(CLINICIAN_HISTORY_SECTION_IDS)
  const seen = new Set<string>()
  const patients = new Map(
    modelTranscript.filter((entry) => entry.role === 'user').map((entry) => [entry.seq, entry.text]),
  )
  const terms = medicationTerms(medications)

  const sections = raw.sections.map((value): ClinicianHistorySection => {
    if (!isPlainObject(value) || !hasExactKeys(value, ['id', 'claims']) ||
      typeof value.id !== 'string' || !allowedIds.has(value.id) || seen.has(value.id) ||
      !Array.isArray(value.claims) || value.claims.length > MAX_CLAIMS_PER_SECTION) {
      throw new Error('Clinician history report has an unknown, duplicate, or invalid section.')
    }
    seen.add(value.id)
    const claims = value.claims.map((claim): ClinicianHistoryClaim => {
      if (!isPlainObject(claim) || !hasExactKeys(claim, ['text', 'citations']) ||
        typeof claim.text !== 'string' || !claim.text.trim() || !Array.isArray(claim.citations) ||
        claim.citations.length === 0 || claim.citations.length > MAX_CITATIONS_PER_CLAIM ||
        claim.text.includes('[medication redacted]') || containsMedicationTerm(claim.text, terms)) {
        throw new Error('Clinician history report contains an invalid or medication-derived claim.')
      }
      const citations = claim.citations.map((citation) => {
        const patientSeq = isPlainObject(citation) ? citation.patient_seq : undefined
        const quote = isPlainObject(citation) ? citation.quote : undefined
        if (!isPlainObject(citation) || !hasExactKeys(citation, ['patient_seq', 'quote']) ||
          !Number.isInteger(patientSeq) || typeof quote !== 'string' ||
          !quote || quote.includes('[medication redacted]') ||
          !patients.get(patientSeq as number)?.includes(quote)) {
          throw new Error('Clinician history report claim citation is not an exact patient quote.')
        }
        return { patient_seq: patientSeq as number, quote }
      })
      const text = claim.text.trim()
      if (!citations.some((citation) => citation.quote === text)) {
        throw new Error('Clinician history report claim text is not an exact cited patient quote.')
      }
      return { text, citations }
    })
    return { id: value.id as ClinicianHistorySectionId, claims }
  })
  if (reportStatus !== 'partial') {
    const byId = new Map(sections.map((section) => [section.id, section]))
    if (CLINICIAN_HISTORY_REQUIRED_COMPLETE_SECTION_IDS.some((id) => (
      (byId.get(id)?.claims.length ?? 0) === 0
    ))) {
      throw new Error('A completed clinician history report is missing a grounded core section.')
    }
  }
  return sections
}

export function clinicianHistoryReportInputDigest(input: ClinicianHistoryReportInput): string {
  return digest({
    version: CLINICIAN_HISTORY_REPORT_VERSION,
    transcript: input.transcript.map(({ role, text, timestamp, seq }) => ({ role, text, timestamp, seq })),
    medicationReconciliation: input.medicationReconciliation,
    reportStatus: input.reportStatus,
    limitations: input.limitations,
    terminationReason: input.terminationReason,
    patientTurnCount: input.patientTurnCount,
    reviewedThroughSeq: input.reviewedThroughSeq,
  })
}

export async function generateClinicianHistoryReport(
  input: ClinicianHistoryReportInput,
): Promise<ClinicianHistoryReportV1> {
  const redacted = redactMedicationNameSpans(input.transcript, input.medicationReconciliation)
  const call = await invokeBedrockClinicalToolWithMeta<ModelOutput>({
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: JSON.stringify({
        sectionIds: CLINICIAN_HISTORY_SECTION_IDS,
        numberedTranscript: numberedTranscript(redacted.transcript),
      }),
    }],
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    toolName: TOOL_NAME,
    toolDescription: 'Record a grounded clinician history report with exact patient quotes.',
    inputSchema: MODEL_OUTPUT_SCHEMA,
  })
  const sections = parseClinicianHistoryReportModelOutput(
    call.result,
    redacted.transcript,
    input.medicationReconciliation,
    input.reportStatus,
  )
  return {
    version: CLINICIAN_HISTORY_REPORT_VERSION,
    report_status: input.reportStatus,
    input_digest: clinicianHistoryReportInputDigest(input),
    sections,
    medication_reconciliation: input.medicationReconciliation,
    limitations: [...input.limitations],
    completion: {
      termination_reason: input.terminationReason,
      patient_turn_count: input.patientTurnCount,
      reviewed_through_seq: input.reviewedThroughSeq,
    },
    provenance: {
      model_id: call.modelId,
      prompt_version: CLINICIAN_HISTORY_REPORT_PROMPT_VERSION,
      inference_params: { temperature: TEMPERATURE, max_tokens: MAX_TOKENS, tool: TOOL_NAME },
      generated_at: new Date().toISOString(),
      transcript_digest: digest(input.transcript.map(({ role, text, timestamp, seq }) => ({ role, text, timestamp, seq }))),
      redacted_medication_span_count: redacted.redactedSpanCount,
    },
  }
}
