import {
  COMPREHENSIVE_HISTORY_DOMAINS,
  type ComprehensiveHistoryDomain,
  type HistorianTranscriptEntry,
} from '@/lib/historianTypes'

/**
 * Application boundary for the silent, in-session Historian reviewer.
 *
 * The reviewer never speaks to the patient and never receives the conductor's
 * differential or suggested questions.  Every coverage claim must cite an
 * exact patient transcript sequence; this module re-validates those citations
 * before the result may guide closure or be persisted.
 */
export const LIVE_INTERVIEW_REVIEW_VERSION = 1 as const
export const LIVE_INTERVIEW_REVIEW_MIN_PATIENT_TURNS = 12
export const LIVE_INTERVIEW_REVIEW_PROMPT_VERSION = 'historian-live-review-v1' as const

export type LiveReviewCoverageStatus = 'covered' | 'uncertain' | 'missing'

export interface LiveReviewDomainFinding {
  domain: ComprehensiveHistoryDomain
  status: LiveReviewCoverageStatus
  patientSeqs: number[]
}

export interface LiveReviewCriticalGap {
  domain: ComprehensiveHistoryDomain
  reason: string
  questionIntent: string
}

export interface LiveReviewContradiction {
  patientSeqs: number[]
  description: string
}

export interface LiveReviewRepetition {
  assistantSeqs: number[]
  description: string
}

export type LiveReviewMedicationValueStatus =
  | 'known'
  | 'unknown'
  | 'declined'
  | 'missing'

export interface LiveReviewMedicationValue {
  status: LiveReviewMedicationValueStatus
  /** Exact patient-transcript substring when status is known; otherwise null. */
  valueSpan: string | null
  patientSeqs: number[]
}

export interface LiveReviewMedicationMention {
  /** Exact, unnormalized substring copied from one patient transcript turn. */
  nameSpan: string
  patientSeq: number
  dose: LiveReviewMedicationValue
  frequency: LiveReviewMedicationValue
}

export interface LiveInterviewReviewV1 {
  version: typeof LIVE_INTERVIEW_REVIEW_VERSION
  reviewedThroughSeq: number
  domains: LiveReviewDomainFinding[]
  criticalGaps: LiveReviewCriticalGap[]
  contradictions: LiveReviewContradiction[]
  repetitions: LiveReviewRepetition[]
  medications: LiveReviewMedicationMention[]
  activeSafetyConcern: {
    present: boolean
    patientSeqs: number[]
  }
  readyToClose: boolean
  nextQuestionIntents: string[]
  confidence: 'high' | 'medium' | 'low'
}

export interface LiveInterviewReviewArtifactV1 {
  review: LiveInterviewReviewV1
  provenance: {
    modelId: string
    promptVersion: typeof LIVE_INTERVIEW_REVIEW_PROMPT_VERSION
    generatedAt: string
  }
  /** Server-only HMAC over this artifact, its session, and cited transcript. */
  attestation: string
}

export type UnsignedLiveInterviewReviewArtifactV1 = Omit<
  LiveInterviewReviewArtifactV1,
  'attestation'
>

export type LiveInterviewReviewCompletion =
  | 'coverage_complete'
  | 'complete_with_uncertainty'
  | 'incomplete'

const DOMAIN_IDS = new Set<string>(COMPREHENSIVE_HISTORY_DOMAINS.map(({ id }) => id))
const STATUS_VALUES = new Set<LiveReviewCoverageStatus>(['covered', 'uncertain', 'missing'])
const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low'])
const MEDICATION_VALUE_STATUSES = new Set<LiveReviewMedicationValueStatus>([
  'known',
  'unknown',
  'declined',
  'missing',
])
const MAX_TEXT_LENGTH = 240
const MAX_FINDINGS = 10
const MAX_MEDICATIONS = 12

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys)
  return Object.keys(value).length === expected.size && Object.keys(value).every((key) => expected.has(key))
}

function boundedText(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`)
  const text = value.trim()
  if (!text) throw new Error(`${label} is empty.`)
  // Bedrock tool schemas are advisory: a clinically useful, fully cited
  // finding may occasionally exceed maxLength even with temperature zero.
  // Normalize only the private explanatory prose. Fixed domains, transcript
  // citations, finding counts, safety state, and closure gates remain strict.
  return text.slice(0, MAX_TEXT_LENGTH).trimEnd()
}

function exactIntegerArray(
  value: unknown,
  allowed: Set<number>,
  label: string,
  minimum: number,
  maximum: number,
): number[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${label} has an invalid item count.`)
  }
  const result: number[] = []
  for (const raw of value) {
    if (!Number.isInteger(raw) || !allowed.has(raw as number) || result.includes(raw as number)) {
      throw new Error(`${label} contains an invalid transcript sequence.`)
    }
    result.push(raw as number)
  }
  return result.sort((a, b) => a - b)
}

function transcriptIndex(transcript: HistorianTranscriptEntry[]): {
  patientSeqs: Set<number>
  assistantSeqs: Set<number>
  latestPatientSeq: number
  patientTurnCount: number
} {
  const seen = new Set<number>()
  const patientSeqs = new Set<number>()
  const assistantSeqs = new Set<number>()
  let latestPatientSeq = 0
  for (const entry of transcript) {
    if (!Number.isInteger(entry.seq) || entry.seq! < 1 || seen.has(entry.seq!)) {
      throw new Error('Live review requires a unique positive sequence on every transcript entry.')
    }
    seen.add(entry.seq!)
    if (entry.role === 'user') {
      patientSeqs.add(entry.seq!)
      latestPatientSeq = Math.max(latestPatientSeq, entry.seq!)
    } else {
      assistantSeqs.add(entry.seq!)
    }
  }
  if (!latestPatientSeq) throw new Error('Live review requires at least one patient transcript turn.')
  return { patientSeqs, assistantSeqs, latestPatientSeq, patientTurnCount: patientSeqs.size }
}

function parseMedicationValue(
  raw: unknown,
  index: ReturnType<typeof transcriptIndex>,
  patientTextBySeq: Map<number, string>,
  label: string,
): LiveReviewMedicationValue {
  if (!isPlainObject(raw) || !hasExactKeys(raw, ['status', 'value_span', 'patient_seqs'])) {
    throw new Error(`${label} has an invalid schema.`)
  }
  if (
    typeof raw.status !== 'string' ||
    !MEDICATION_VALUE_STATUSES.has(raw.status as LiveReviewMedicationValueStatus)
  ) throw new Error(`${label} has an invalid status.`)
  const status = raw.status as LiveReviewMedicationValueStatus
  const patientSeqs = exactIntegerArray(
    raw.patient_seqs,
    index.patientSeqs,
    label,
    status === 'missing' ? 0 : 1,
    6,
  )
  if (status === 'known') {
    if (typeof raw.value_span !== 'string') {
      throw new Error(`${label} must include an exact value span.`)
    }
    const valueSpan = raw.value_span.trim()
    if (
      !valueSpan ||
      valueSpan.length > 80 ||
      !patientSeqs.some((seq) => patientTextBySeq.get(seq)?.includes(valueSpan))
    ) throw new Error(`${label} value is not an exact cited patient substring.`)
    return { status, valueSpan, patientSeqs }
  }
  if (raw.value_span !== null) {
    throw new Error(`${label} cannot include a value span for ${status}.`)
  }
  return { status, valueSpan: null, patientSeqs }
}

/**
 * Parse and independently validate an untrusted reviewer result.  The return
 * value contains only known fields, fixed domain identifiers, bounded text,
 * and transcript sequences that actually belong to the claimed speaker.
 */
export function parseLiveInterviewReview(
  raw: unknown,
  transcript: HistorianTranscriptEntry[],
): LiveInterviewReviewV1 {
  const index = transcriptIndex(transcript)
  if (!isPlainObject(raw) || !hasExactKeys(raw, [
    'version',
    'reviewed_through_seq',
    'domains',
    'critical_gaps',
    'contradictions',
    'repetitions',
    'medications',
    'active_safety_concern',
    'ready_to_close',
    'next_question_intents',
    'confidence',
  ])) throw new Error('Live review has an invalid top-level schema.')
  if (raw.version !== LIVE_INTERVIEW_REVIEW_VERSION) throw new Error('Live review version is unsupported.')
  if (raw.reviewed_through_seq !== index.latestPatientSeq) {
    throw new Error('Live review does not cover the latest patient transcript turn.')
  }

  if (!Array.isArray(raw.domains) || raw.domains.length !== COMPREHENSIVE_HISTORY_DOMAINS.length) {
    throw new Error('Live review must classify every fixed history domain exactly once.')
  }
  const seenDomains = new Set<string>()
  const domains: LiveReviewDomainFinding[] = raw.domains.map((item, itemIndex) => {
    if (!isPlainObject(item) || !hasExactKeys(item, ['domain', 'status', 'patient_seqs'])) {
      throw new Error(`Live review domain ${itemIndex} has an invalid schema.`)
    }
    if (typeof item.domain !== 'string' || !DOMAIN_IDS.has(item.domain) || seenDomains.has(item.domain)) {
      throw new Error('Live review contains an unknown or duplicate history domain.')
    }
    if (typeof item.status !== 'string' || !STATUS_VALUES.has(item.status as LiveReviewCoverageStatus)) {
      throw new Error('Live review contains an invalid coverage status.')
    }
    seenDomains.add(item.domain)
    const patientSeqs = exactIntegerArray(
      item.patient_seqs,
      index.patientSeqs,
      `Live review domain ${item.domain}`,
      item.status === 'missing' ? 0 : 1,
      20,
    )
    if (item.status === 'missing' && patientSeqs.length) {
      throw new Error('A missing history domain cannot claim patient evidence.')
    }
    return {
      domain: item.domain as ComprehensiveHistoryDomain,
      status: item.status as LiveReviewCoverageStatus,
      patientSeqs,
    }
  })

  if (!Array.isArray(raw.critical_gaps) || raw.critical_gaps.length > MAX_FINDINGS) {
    throw new Error('Live review critical gaps have an invalid item count.')
  }
  const criticalGaps: LiveReviewCriticalGap[] = raw.critical_gaps.map((item, itemIndex) => {
    if (!isPlainObject(item) || !hasExactKeys(item, ['domain', 'reason', 'question_intent'])) {
      throw new Error(`Live review critical gap ${itemIndex} has an invalid schema.`)
    }
    if (typeof item.domain !== 'string' || !DOMAIN_IDS.has(item.domain)) {
      throw new Error('Live review critical gap contains an unknown domain.')
    }
    return {
      domain: item.domain as ComprehensiveHistoryDomain,
      reason: boundedText(item.reason, 'Live review gap reason'),
      questionIntent: boundedText(item.question_intent, 'Live review question intent'),
    }
  })

  if (!Array.isArray(raw.contradictions) || raw.contradictions.length > MAX_FINDINGS) {
    throw new Error('Live review contradictions have an invalid item count.')
  }
  const contradictions: LiveReviewContradiction[] = raw.contradictions.map((item, itemIndex) => {
    if (!isPlainObject(item) || !hasExactKeys(item, ['patient_seqs', 'description'])) {
      throw new Error(`Live review contradiction ${itemIndex} has an invalid schema.`)
    }
    return {
      patientSeqs: exactIntegerArray(item.patient_seqs, index.patientSeqs, 'Live review contradiction', 2, 6),
      description: boundedText(item.description, 'Live review contradiction description'),
    }
  })

  if (!Array.isArray(raw.repetitions) || raw.repetitions.length > MAX_FINDINGS) {
    throw new Error('Live review repetitions have an invalid item count.')
  }
  const repetitions: LiveReviewRepetition[] = raw.repetitions.map((item, itemIndex) => {
    if (!isPlainObject(item) || !hasExactKeys(item, ['assistant_seqs', 'description'])) {
      throw new Error(`Live review repetition ${itemIndex} has an invalid schema.`)
    }
    return {
      assistantSeqs: exactIntegerArray(item.assistant_seqs, index.assistantSeqs, 'Live review repetition', 2, 6),
      description: boundedText(item.description, 'Live review repetition description'),
    }
  })

  if (!Array.isArray(raw.medications) || raw.medications.length > MAX_MEDICATIONS) {
    throw new Error('Live review medications have an invalid item count.')
  }
  const patientTextBySeq = new Map(
    transcript
      .filter((entry) => entry.role === 'user')
      .map((entry) => [entry.seq!, entry.text] as const),
  )
  const seenMedicationMentions = new Set<string>()
  const medications: LiveReviewMedicationMention[] = raw.medications.map((item, itemIndex) => {
    if (!isPlainObject(item) || !hasExactKeys(item, [
      'name_span',
      'patient_seq',
      'dose',
      'frequency',
    ])) throw new Error(`Live review medication ${itemIndex} has an invalid schema.`)
    if (
      typeof item.name_span !== 'string' ||
      !Number.isInteger(item.patient_seq) ||
      !index.patientSeqs.has(item.patient_seq as number)
    ) throw new Error(`Live review medication ${itemIndex} has invalid source evidence.`)
    const nameSpan = item.name_span.trim()
    const patientSeq = item.patient_seq as number
    if (
      !nameSpan ||
      nameSpan.length > 80 ||
      !patientTextBySeq.get(patientSeq)?.includes(nameSpan)
    ) throw new Error(`Live review medication ${itemIndex} name is not an exact patient substring.`)
    const mentionKey = `${patientSeq}:\u0000${nameSpan}`
    if (seenMedicationMentions.has(mentionKey)) {
      throw new Error('Live review contains a duplicate medication mention.')
    }
    seenMedicationMentions.add(mentionKey)
    return {
      nameSpan,
      patientSeq,
      dose: parseMedicationValue(item.dose, index, patientTextBySeq, `Medication ${itemIndex} dose`),
      frequency: parseMedicationValue(
        item.frequency,
        index,
        patientTextBySeq,
        `Medication ${itemIndex} frequency`,
      ),
    }
  })

  if (!isPlainObject(raw.active_safety_concern) || !hasExactKeys(raw.active_safety_concern, ['present', 'patient_seqs'])) {
    throw new Error('Live review safety finding has an invalid schema.')
  }
  if (typeof raw.active_safety_concern.present !== 'boolean') {
    throw new Error('Live review safety status must be boolean.')
  }
  const safetySeqs = exactIntegerArray(
    raw.active_safety_concern.patient_seqs,
    index.patientSeqs,
    'Live review safety finding',
    raw.active_safety_concern.present ? 1 : 0,
    6,
  )
  if (!raw.active_safety_concern.present && safetySeqs.length) {
    throw new Error('An absent safety concern cannot claim patient evidence.')
  }

  if (!Array.isArray(raw.next_question_intents) || raw.next_question_intents.length > 3) {
    throw new Error('Live review question intents have an invalid item count.')
  }
  const nextQuestionIntents = raw.next_question_intents.map((intent) =>
    boundedText(intent, 'Live review question intent'))
  if (typeof raw.ready_to_close !== 'boolean') throw new Error('Live review closure status must be boolean.')
  if (typeof raw.confidence !== 'string' || !CONFIDENCE_VALUES.has(raw.confidence)) {
    throw new Error('Live review confidence is invalid.')
  }

  const closurePrerequisites =
    index.patientTurnCount >= LIVE_INTERVIEW_REVIEW_MIN_PATIENT_TURNS &&
    domains.every((item) => item.status !== 'missing') &&
    criticalGaps.length === 0 &&
    !raw.active_safety_concern.present

  return {
    version: LIVE_INTERVIEW_REVIEW_VERSION,
    reviewedThroughSeq: index.latestPatientSeq,
    domains,
    criticalGaps,
    contradictions,
    repetitions,
    medications,
    activeSafetyConcern: { present: raw.active_safety_concern.present, patientSeqs: safetySeqs },
    // A model may under-protect closure, but it may never bypass the
    // application prerequisites above.
    readyToClose: raw.ready_to_close && closurePrerequisites,
    nextQuestionIntents,
    confidence: raw.confidence as LiveInterviewReviewV1['confidence'],
  }
}

export function liveInterviewReviewCompletion(
  review: LiveInterviewReviewV1 | null | undefined,
): LiveInterviewReviewCompletion {
  if (!review?.readyToClose) return 'incomplete'
  return review.domains.some((item) => item.status === 'uncertain') ||
    review.contradictions.length > 0
    ? 'complete_with_uncertainty'
    : 'coverage_complete'
}

export function deriveLiveReviewStructuredCoverage(review: LiveInterviewReviewV1): {
  covered_domains: ComprehensiveHistoryDomain[]
  missing_or_uncertain: Array<{
    domain: ComprehensiveHistoryDomain
    reason: 'not_asked' | 'unknown' | 'declined' | 'conflicting'
  }>
} {
  return {
    covered_domains: review.domains
      .filter((item) => item.status === 'covered')
      .map((item) => item.domain),
    missing_or_uncertain: review.domains
      .filter((item) => item.status !== 'covered')
      .map((item) => ({
        domain: item.domain,
        reason: item.status === 'missing' ? 'not_asked' as const : 'unknown' as const,
      })),
  }
}

/** Validate the camel-case server/persistence artifact at every boundary. */
export function parseLiveInterviewReviewArtifact(
  raw: unknown,
  transcript: HistorianTranscriptEntry[],
): LiveInterviewReviewArtifactV1 {
  if (!isPlainObject(raw) || !hasExactKeys(raw, ['review', 'provenance', 'attestation'])) {
    throw new Error('Live review artifact has an invalid schema.')
  }
  if (!isPlainObject(raw.review) || !isPlainObject(raw.provenance)) {
    throw new Error('Live review artifact is malformed.')
  }
  if (typeof raw.attestation !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw.attestation)) {
    throw new Error('Live review attestation is invalid.')
  }
  if (!hasExactKeys(raw.provenance, ['modelId', 'promptVersion', 'generatedAt'])) {
    throw new Error('Live review provenance has an invalid schema.')
  }
  if (
    typeof raw.provenance.modelId !== 'string' ||
    !raw.provenance.modelId.trim() ||
    raw.provenance.promptVersion !== LIVE_INTERVIEW_REVIEW_PROMPT_VERSION ||
    typeof raw.provenance.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(raw.provenance.generatedAt))
  ) throw new Error('Live review provenance is invalid.')

  const review = raw.review
  if (!hasExactKeys(review, [
    'version',
    'reviewedThroughSeq',
    'domains',
    'criticalGaps',
    'contradictions',
    'repetitions',
    'medications',
    'activeSafetyConcern',
    'readyToClose',
    'nextQuestionIntents',
    'confidence',
  ])) throw new Error('Live review artifact review has an invalid schema.')

  const parsed = parseLiveInterviewReview({
    version: review.version,
    reviewed_through_seq: review.reviewedThroughSeq,
    domains: Array.isArray(review.domains)
      ? review.domains.map((item) => isPlainObject(item)
        ? { domain: item.domain, status: item.status, patient_seqs: item.patientSeqs }
        : item)
      : review.domains,
    critical_gaps: Array.isArray(review.criticalGaps)
      ? review.criticalGaps.map((item) => isPlainObject(item)
        ? { domain: item.domain, reason: item.reason, question_intent: item.questionIntent }
        : item)
      : review.criticalGaps,
    contradictions: Array.isArray(review.contradictions)
      ? review.contradictions.map((item) => isPlainObject(item)
        ? { patient_seqs: item.patientSeqs, description: item.description }
        : item)
      : review.contradictions,
    repetitions: Array.isArray(review.repetitions)
      ? review.repetitions.map((item) => isPlainObject(item)
        ? { assistant_seqs: item.assistantSeqs, description: item.description }
        : item)
      : review.repetitions,
    medications: Array.isArray(review.medications)
      ? review.medications.map((item) => isPlainObject(item)
        ? {
            name_span: item.nameSpan,
            patient_seq: item.patientSeq,
            dose: isPlainObject(item.dose)
              ? {
                  status: item.dose.status,
                  value_span: item.dose.valueSpan,
                  patient_seqs: item.dose.patientSeqs,
                }
              : item.dose,
            frequency: isPlainObject(item.frequency)
              ? {
                  status: item.frequency.status,
                  value_span: item.frequency.valueSpan,
                  patient_seqs: item.frequency.patientSeqs,
                }
              : item.frequency,
          }
        : item)
      : review.medications,
    active_safety_concern: isPlainObject(review.activeSafetyConcern)
      ? { present: review.activeSafetyConcern.present, patient_seqs: review.activeSafetyConcern.patientSeqs }
      : review.activeSafetyConcern,
    ready_to_close: review.readyToClose,
    next_question_intents: review.nextQuestionIntents,
    confidence: review.confidence,
  }, transcript)

  return {
    review: parsed,
    provenance: {
      modelId: raw.provenance.modelId.trim(),
      promptVersion: LIVE_INTERVIEW_REVIEW_PROMPT_VERSION,
      generatedAt: new Date(raw.provenance.generatedAt).toISOString(),
    },
    attestation: raw.attestation,
  }
}
