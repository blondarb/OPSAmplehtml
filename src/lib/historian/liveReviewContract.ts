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
export const LIVE_INTERVIEW_REVIEW_V2_VERSION = 2 as const
export const LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION = 'historian-live-review-v2-coherent-contract' as const

/**
 * Case-depth audit dimensions. These are silent evidence checks, never a
 * patient-facing checklist. The reviewer must cite the patient's own turns
 * for every adequate or uncertain classification.
 */
export const LIVE_REVIEW_DEPTH_DIMENSIONS = [
  'chief_problem_and_goal',
  'chronology_and_course',
  'phenotype_and_severity',
  'associated_features_and_discriminators',
  'functional_impact',
  'relevant_history_and_risk',
  'treatments_and_response',
  'prior_evaluation',
] as const

/** Core diagnostic framing must be established, not merely unresolved. */
export const LIVE_REVIEW_REQUIRED_ADEQUATE_DEPTH_DIMENSIONS = [
  'chronology_and_course',
  'phenotype_and_severity',
] as const

export type LiveReviewDepthDimension = (typeof LIVE_REVIEW_DEPTH_DIMENSIONS)[number]
export type LiveReviewDepthStatus = 'adequate' | 'uncertain' | 'missing'

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

/**
 * V2 gaps are evidence-bound. They deliberately cannot be used as a second,
 * competing medication checklist: medication completeness belongs to the
 * deterministic application ledger.
 */
export type LiveReviewCriticalGapBasis = 'not_asked' | 'partial_answer' | 'conflicting_answer'

export interface LiveReviewCriticalGapV2 {
  domain: Exclude<ComprehensiveHistoryDomain, 'medications'>
  depthDimension: LiveReviewDepthDimension
  basis: LiveReviewCriticalGapBasis
  patientSeqs: number[]
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

export interface LiveReviewDepthFinding {
  dimension: LiveReviewDepthDimension
  status: LiveReviewDepthStatus
  patientSeqs: number[]
}

export interface LiveInterviewReviewV2 extends Omit<
  LiveInterviewReviewV1,
  'version' | 'criticalGaps' | 'readyToClose' | 'nextQuestionIntents'
> {
  version: typeof LIVE_INTERVIEW_REVIEW_V2_VERSION
  /** Recomputed from the cited transcript at every trust boundary. */
  patientTurnCount: number
  /** A model-contract failure is attested and can never authorize DDx. */
  integrity: 'valid' | 'inconsistent' | 'clarification_exhausted'
  criticalGaps: LiveReviewCriticalGapV2[]
  /** Derived only from independently valid critical gaps. */
  nextQuestionIntents: string[]
  readyToClose: boolean
  diagnosticDepth: {
    dimensions: LiveReviewDepthFinding[]
    depthSufficient: boolean
  }
}

export type LiveInterviewReview = LiveInterviewReviewV1 | LiveInterviewReviewV2

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

export interface LiveInterviewReviewArtifactV2 {
  review: LiveInterviewReviewV2
  provenance: {
    modelId: string
    promptVersion: typeof LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION
    generatedAt: string
  }
  /** Server-only HMAC over this artifact, its session, and cited transcript. */
  attestation: string
}

export type LiveInterviewReviewArtifact =
  | LiveInterviewReviewArtifactV1
  | LiveInterviewReviewArtifactV2

export type UnsignedLiveInterviewReviewArtifactV1 = Omit<
  LiveInterviewReviewArtifactV1,
  'attestation'
>

export type UnsignedLiveInterviewReviewArtifactV2 = Omit<
  LiveInterviewReviewArtifactV2,
  'attestation'
>

export type UnsignedLiveInterviewReviewArtifact =
  | UnsignedLiveInterviewReviewArtifactV1
  | UnsignedLiveInterviewReviewArtifactV2

export type LiveInterviewReviewCompletion =
  | 'coverage_complete'
  | 'complete_with_uncertainty'
  | 'incomplete'

const DOMAIN_IDS = new Set<string>(COMPREHENSIVE_HISTORY_DOMAINS.map(({ id }) => id))
const STATUS_VALUES = new Set<LiveReviewCoverageStatus>(['covered', 'uncertain', 'missing'])
const DEPTH_DIMENSION_IDS = new Set<string>(LIVE_REVIEW_DEPTH_DIMENSIONS)
const REQUIRED_ADEQUATE_DEPTH_DIMENSION_IDS = new Set<string>(
  LIVE_REVIEW_REQUIRED_ADEQUATE_DEPTH_DIMENSIONS,
)
const DEPTH_STATUS_VALUES = new Set<LiveReviewDepthStatus>(['adequate', 'uncertain', 'missing'])
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

export function liveReviewGapKey(
  gap: Pick<LiveReviewCriticalGapV2, 'domain' | 'depthDimension'>,
): string {
  return `${gap.domain}:${gap.depthDimension}`
}

export function isLiveReviewGapKey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const [domain, depthDimension, extra] = value.split(':')
  return extra === undefined &&
    domain !== 'medications' &&
    DOMAIN_IDS.has(domain) &&
    DEPTH_DIMENSION_IDS.has(depthDimension)
}

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

/**
 * V2 retains the transcript-cited v1 coverage/medication contract and adds a
 * case-specific diagnostic-depth audit. The application, not the reviewer,
 * recomputes the final closure decision.
 */
export function parseLiveInterviewReviewV2(
  raw: unknown,
  transcript: HistorianTranscriptEntry[],
): LiveInterviewReviewV2 {
  if (!isPlainObject(raw) || !hasExactKeys(raw, [
    'version',
    'reviewed_through_seq',
    'domains',
    'critical_gaps',
    'contradictions',
    'repetitions',
    'medications',
    'active_safety_concern',
    'diagnostic_depth',
    'ready_to_close',
    'next_question_intents',
    'confidence',
  ])) throw new Error('Live review v2 has an invalid top-level schema.')
  if (raw.version !== LIVE_INTERVIEW_REVIEW_V2_VERSION) {
    throw new Error('Live review v2 version is unsupported.')
  }
  if (!isPlainObject(raw.diagnostic_depth) || !hasExactKeys(
    raw.diagnostic_depth,
    ['dimensions', 'depth_sufficient'],
  )) throw new Error('Live review diagnostic depth has an invalid schema.')

  // Reuse the established v1 parser for shared transcript-bound fields, but
  // never let the v1 gap or intent semantics leak into the coherent V2
  // closure calculation.
  const sharedRaw: Record<string, unknown> = { ...raw }
  delete sharedRaw.diagnostic_depth
  const base = parseLiveInterviewReview({
    ...sharedRaw,
    version: LIVE_INTERVIEW_REVIEW_VERSION,
    critical_gaps: [],
    next_question_intents: [],
  }, transcript)

  const index = transcriptIndex(transcript)
  if (
    !Array.isArray(raw.diagnostic_depth.dimensions) ||
    raw.diagnostic_depth.dimensions.length !== LIVE_REVIEW_DEPTH_DIMENSIONS.length
  ) throw new Error('Live review must classify every diagnostic-depth dimension exactly once.')
  const seenDimensions = new Set<string>()
  const dimensions = raw.diagnostic_depth.dimensions.map((item, itemIndex) => {
    if (!isPlainObject(item) || !hasExactKeys(item, ['dimension', 'status', 'patient_seqs'])) {
      throw new Error(`Live review depth dimension ${itemIndex} has an invalid schema.`)
    }
    if (
      typeof item.dimension !== 'string' ||
      !DEPTH_DIMENSION_IDS.has(item.dimension) ||
      seenDimensions.has(item.dimension)
    ) throw new Error('Live review contains an unknown or duplicate depth dimension.')
    if (
      typeof item.status !== 'string' ||
      !DEPTH_STATUS_VALUES.has(item.status as LiveReviewDepthStatus)
    ) throw new Error('Live review contains an invalid depth status.')
    seenDimensions.add(item.dimension)
    const patientSeqs = exactIntegerArray(
      item.patient_seqs,
      index.patientSeqs,
      `Live review depth ${item.dimension}`,
      item.status === 'missing' ? 0 : 1,
      20,
    )
    if (item.status === 'missing' && patientSeqs.length) {
      throw new Error('A missing depth dimension cannot claim patient evidence.')
    }
    return {
      dimension: item.dimension as LiveReviewDepthDimension,
      status: item.status as LiveReviewDepthStatus,
      patientSeqs,
    }
  })
  if (typeof raw.diagnostic_depth.depth_sufficient !== 'boolean') {
    throw new Error('Live review depth sufficiency must be boolean.')
  }

  if (!Array.isArray(raw.critical_gaps) || raw.critical_gaps.length > MAX_FINDINGS) {
    throw new Error('Live review v2 critical gaps have an invalid item count.')
  }
  const domainById = new Map(base.domains.map((item) => [item.domain, item]))
  const depthById = new Map(dimensions.map((item) => [item.dimension, item]))
  const contradictionSeqSets = base.contradictions.map((item) => new Set(item.patientSeqs))
  const criticalGaps: LiveReviewCriticalGapV2[] = raw.critical_gaps.map((item, itemIndex) => {
    if (!isPlainObject(item) || !hasExactKeys(item, [
      'domain',
      'depth_dimension',
      'basis',
      'patient_seqs',
      'reason',
      'question_intent',
    ])) throw new Error(`Live review v2 critical gap ${itemIndex} has an invalid schema.`)
    if (
      typeof item.domain !== 'string' ||
      !DOMAIN_IDS.has(item.domain) ||
      item.domain === 'medications'
    ) throw new Error('Live review v2 critical gaps cannot target medications or an unknown domain.')
    if (typeof item.depth_dimension !== 'string' || !DEPTH_DIMENSION_IDS.has(item.depth_dimension)) {
      throw new Error('Live review v2 critical gap has an invalid depth dimension.')
    }
    if (
      typeof item.basis !== 'string' ||
      !['not_asked', 'partial_answer', 'conflicting_answer'].includes(item.basis)
    ) throw new Error('Live review v2 critical gap has an invalid basis.')

    const domain = domainById.get(item.domain as ComprehensiveHistoryDomain)!
    const depthDimension = depthById.get(item.depth_dimension as LiveReviewDepthDimension)!
    if (domain.status === 'covered' || depthDimension.status === 'adequate') {
      throw new Error('Live review v2 critical gap conflicts with covered or adequate evidence.')
    }
    const basis = item.basis as LiveReviewCriticalGapBasis
    const patientSeqs = exactIntegerArray(
      item.patient_seqs,
      index.patientSeqs,
      'Live review v2 critical gap',
      basis === 'not_asked' ? 0 : basis === 'partial_answer' ? 1 : 2,
      6,
    )
    if (basis === 'not_asked') {
      if (
        domain.status !== 'missing' ||
        depthDimension.status !== 'missing' ||
        domain.patientSeqs.length !== 0 ||
        depthDimension.patientSeqs.length !== 0 ||
        patientSeqs.length !== 0
      ) throw new Error('A not_asked v2 critical gap requires missing, uncited domain and depth evidence.')
    } else {
      if (domain.status !== 'uncertain' || depthDimension.status !== 'uncertain') {
        throw new Error('A cited v2 critical gap requires uncertain domain and depth evidence.')
      }
      if (!patientSeqs.every((seq) => domain.patientSeqs.includes(seq) && depthDimension.patientSeqs.includes(seq))) {
        throw new Error('Live review v2 critical gap citations must be shared by its domain and depth finding.')
      }
      if (basis === 'conflicting_answer' && !contradictionSeqSets.some((contradictionSeqs) => (
        patientSeqs.every((seq) => contradictionSeqs.has(seq))
      ))) throw new Error('A conflicting_answer v2 critical gap requires matching contradiction citations.')
    }
    return {
      domain: item.domain as Exclude<ComprehensiveHistoryDomain, 'medications'>,
      depthDimension: item.depth_dimension as LiveReviewDepthDimension,
      basis,
      patientSeqs,
      reason: boundedText(item.reason, 'Live review v2 gap reason'),
      questionIntent: boundedText(item.question_intent, 'Live review v2 question intent'),
    }
  })

  if (!Array.isArray(raw.next_question_intents) || raw.next_question_intents.length > 3) {
    throw new Error('Live review v2 question intents have an invalid item count.')
  }
  // The model must not smuggle a competing interview plan through this field.
  // Only exact intents from independently valid gaps can guide the conductor.
  const nextQuestionIntents = [...new Set(criticalGaps.map((gap) => gap.questionIntent))].slice(0, 3)

  const applicationDepthSufficient =
    dimensions.every((item) => item.status !== 'missing') &&
    dimensions.every((item) => (
      !REQUIRED_ADEQUATE_DEPTH_DIMENSION_IDS.has(item.dimension) || item.status === 'adequate'
    )) &&
    criticalGaps.length === 0 &&
    base.confidence !== 'low'
  const readyToClose =
    index.patientTurnCount >= LIVE_INTERVIEW_REVIEW_MIN_PATIENT_TURNS &&
    base.domains.every((item) => item.status !== 'missing') &&
    applicationDepthSufficient &&
    !base.activeSafetyConcern.present

  return {
    ...base,
    version: LIVE_INTERVIEW_REVIEW_V2_VERSION,
    patientTurnCount: index.patientTurnCount,
    integrity: 'valid',
    criticalGaps,
    nextQuestionIntents,
    diagnosticDepth: {
      dimensions,
      depthSufficient: applicationDepthSufficient,
    },
    // Raw reviewer booleans are advisory only; closure is application-derived.
    readyToClose,
  }
}

export function liveInterviewReviewCompletion(
  review: LiveInterviewReview | null | undefined,
): LiveInterviewReviewCompletion {
  // Safety always outranks closure integrity and clarification exhaustion.
  // The hook will strengthen this to the existing safety_escalated terminal
  // path; a review carrying active safety can never authorize normal close.
  if (review?.activeSafetyConcern.present) return 'incomplete'
  // A twice-incoherent silent reviewer must not trap the patient in an
  // indefinite interview. Once the fixed 12-turn baseline exists, this
  // permits only a graceful, uncertainty-labeled close. Diagnostic
  // sufficiency independently treats this integrity state as unavailable,
  // so it can never authorize a differential.
  if (
    review?.version === LIVE_INTERVIEW_REVIEW_V2_VERSION &&
    review.integrity !== 'valid'
  ) {
    return review.patientTurnCount >= LIVE_INTERVIEW_REVIEW_MIN_PATIENT_TURNS
      ? 'complete_with_uncertainty'
      : 'incomplete'
  }
  if (!review?.readyToClose) return 'incomplete'
  return review.domains.some((item) => item.status === 'uncertain') ||
    review.contradictions.length > 0
    ? 'complete_with_uncertainty'
    : 'coverage_complete'
}

export function deriveLiveReviewStructuredCoverage(review: LiveInterviewReview): {
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
function parseLiveInterviewReviewArtifactV1(
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

function parseLiveInterviewReviewArtifactV2(
  raw: unknown,
  transcript: HistorianTranscriptEntry[],
): LiveInterviewReviewArtifactV2 {
  if (!isPlainObject(raw) || !hasExactKeys(raw, ['review', 'provenance', 'attestation'])) {
    throw new Error('Live review v2 artifact has an invalid schema.')
  }
  if (!isPlainObject(raw.review) || !isPlainObject(raw.provenance)) {
    throw new Error('Live review v2 artifact is malformed.')
  }
  if (typeof raw.attestation !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw.attestation)) {
    throw new Error('Live review v2 attestation is invalid.')
  }
  if (!hasExactKeys(raw.provenance, ['modelId', 'promptVersion', 'generatedAt'])) {
    throw new Error('Live review v2 provenance has an invalid schema.')
  }
  if (
    typeof raw.provenance.modelId !== 'string' ||
    !raw.provenance.modelId.trim() ||
    raw.provenance.promptVersion !== LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION ||
    typeof raw.provenance.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(raw.provenance.generatedAt))
  ) throw new Error('Live review v2 provenance is invalid.')
  if (!hasExactKeys(raw.review, [
    'version',
    'reviewedThroughSeq',
    'patientTurnCount',
    'integrity',
    'domains',
    'criticalGaps',
    'contradictions',
    'repetitions',
    'medications',
    'activeSafetyConcern',
    'diagnosticDepth',
    'readyToClose',
    'nextQuestionIntents',
    'confidence',
  ])) throw new Error('Live review v2 artifact review has an invalid schema.')

  // Validate and normalize every shared field through the established v1
  // artifact boundary, then add the independently validated v2 depth block.
  const {
    diagnosticDepth,
    patientTurnCount,
    integrity,
    ...sharedReview
  } = raw.review
  const shared = parseLiveInterviewReviewArtifactV1({
    review: {
      ...sharedReview,
      version: LIVE_INTERVIEW_REVIEW_VERSION,
      criticalGaps: [],
      nextQuestionIntents: [],
    },
    provenance: {
      ...raw.provenance,
      promptVersion: LIVE_INTERVIEW_REVIEW_PROMPT_VERSION,
    },
    attestation: raw.attestation,
  }, transcript)
  const actualPatientTurnCount = transcript.filter((entry) => entry.role === 'user').length
  if (patientTurnCount !== actualPatientTurnCount) {
    throw new Error('Live review v2 artifact patient turn count does not match its transcript.')
  }
  if (
    integrity !== 'valid' &&
    integrity !== 'inconsistent' &&
    integrity !== 'clarification_exhausted'
  ) {
    throw new Error('Live review v2 artifact integrity is invalid.')
  }
  const parsed = parseLiveInterviewReviewV2({
    version: LIVE_INTERVIEW_REVIEW_V2_VERSION,
    reviewed_through_seq: shared.review.reviewedThroughSeq,
    domains: shared.review.domains.map((item) => ({
      domain: item.domain,
      status: item.status,
      patient_seqs: item.patientSeqs,
    })),
    critical_gaps: Array.isArray(raw.review.criticalGaps)
      ? raw.review.criticalGaps.map((item) => isPlainObject(item)
        ? {
            domain: item.domain,
            depth_dimension: item.depthDimension,
            basis: item.basis,
            patient_seqs: item.patientSeqs,
            reason: item.reason,
            question_intent: item.questionIntent,
          }
        : item)
      : raw.review.criticalGaps,
    contradictions: shared.review.contradictions.map((item) => ({
      patient_seqs: item.patientSeqs,
      description: item.description,
    })),
    repetitions: shared.review.repetitions.map((item) => ({
      assistant_seqs: item.assistantSeqs,
      description: item.description,
    })),
    medications: shared.review.medications.map((item) => ({
      name_span: item.nameSpan,
      patient_seq: item.patientSeq,
      dose: {
        status: item.dose.status,
        value_span: item.dose.valueSpan,
        patient_seqs: item.dose.patientSeqs,
      },
      frequency: {
        status: item.frequency.status,
        value_span: item.frequency.valueSpan,
        patient_seqs: item.frequency.patientSeqs,
      },
    })),
    active_safety_concern: {
      present: shared.review.activeSafetyConcern.present,
      patient_seqs: shared.review.activeSafetyConcern.patientSeqs,
    },
    diagnostic_depth: isPlainObject(diagnosticDepth)
      ? {
          dimensions: Array.isArray(diagnosticDepth.dimensions)
            ? diagnosticDepth.dimensions.map((item) => isPlainObject(item)
              ? {
                  dimension: item.dimension,
                  status: item.status,
                  patient_seqs: item.patientSeqs,
                }
              : item)
            : diagnosticDepth.dimensions,
          depth_sufficient: diagnosticDepth.depthSufficient,
        }
      : diagnosticDepth,
    ready_to_close: shared.review.readyToClose,
    next_question_intents: shared.review.nextQuestionIntents,
    confidence: shared.review.confidence,
  }, transcript)

  // A fallback is signed and structurally valid so it can be audited, but it
  // is never a source of closure authority or patient-facing intents.
  if (integrity === 'inconsistent') {
    if (
      parsed.readyToClose ||
      parsed.diagnosticDepth.depthSufficient ||
      parsed.criticalGaps.length !== 0 ||
      parsed.nextQuestionIntents.length !== 0 ||
      parsed.domains.some((item) => item.status !== 'missing' || item.patientSeqs.length !== 0) ||
      parsed.diagnosticDepth.dimensions.some((item) => (
        item.status !== 'missing' || item.patientSeqs.length !== 0
      )) ||
      parsed.contradictions.length !== 0 ||
      parsed.repetitions.length !== 0 ||
      parsed.medications.length !== 0 ||
      parsed.activeSafetyConcern.present ||
      parsed.activeSafetyConcern.patientSeqs.length !== 0 ||
      parsed.confidence !== 'low'
    ) throw new Error('An inconsistent live review v2 artifact must fail closed.')
  }
  if (integrity === 'clarification_exhausted') {
    if (
      parsed.readyToClose ||
      parsed.diagnosticDepth.depthSufficient ||
      parsed.criticalGaps.length === 0 ||
      parsed.nextQuestionIntents.length === 0
    ) throw new Error('An exhausted live review v2 artifact must retain an unresolved cited gap.')
  }

  return {
    review: { ...parsed, integrity },
    provenance: {
      modelId: raw.provenance.modelId.trim(),
      promptVersion: LIVE_INTERVIEW_REVIEW_V2_PROMPT_VERSION,
      generatedAt: new Date(raw.provenance.generatedAt).toISOString(),
    },
    attestation: raw.attestation,
  }
}

/** Validate either supported camel-case server/persistence artifact. */
export function parseLiveInterviewReviewArtifact(
  raw: unknown,
  transcript: HistorianTranscriptEntry[],
): LiveInterviewReviewArtifact {
  if (
    isPlainObject(raw) &&
    isPlainObject(raw.review) &&
    raw.review.version === LIVE_INTERVIEW_REVIEW_V2_VERSION
  ) return parseLiveInterviewReviewArtifactV2(raw, transcript)
  return parseLiveInterviewReviewArtifactV1(raw, transcript)
}
