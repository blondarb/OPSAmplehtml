import type {
  LiveInterviewReviewCompletion,
  LiveReviewMedicationMention,
  LiveReviewMedicationValueStatus,
} from './liveReviewContract'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

export const MEDICATION_RECONCILIATION_VERSION = 1 as const
export const MAX_MEDICATION_CANDIDATES = 12
export const MEDICATION_INVENTORY_QUESTION =
  'Before we finish, please list any other prescription medicines, over-the-counter medicines, vitamins, or supplements you take?'

export type MedicationNameStatus =
  | 'needs_confirmation'
  | 'confirmed'
  | 'uncertain'

export type MedicationValueStatus =
  | LiveReviewMedicationValueStatus
  | 'awaiting_review'
  | 'uncertain'

export interface MedicationValueEvidence {
  status: MedicationValueStatus
  value: string | null
  patientSeqs: number[]
  attempts: number
}

export interface MedicationLedgerItem {
  id: string
  heardName: string
  sourcePatientSeq: number
  nameStatus: MedicationNameStatus
  nameConfirmationAttempts: number
  dose: MedicationValueEvidence
  frequency: MedicationValueEvidence
}

export type MedicationQuestionKind =
  | 'med_name_confirmation'
  | 'med_name_retry'
  | 'med_dose_and_frequency'
  | 'med_dose'
  | 'med_frequency'
  | 'med_inventory'

export interface PendingMedicationQuestion {
  kind: MedicationQuestionKind
  obligationId: string
  itemId: string | null
  questionText: string
  assistantSeq: number | null
}

export interface MedicationReconciliationState {
  version: typeof MEDICATION_RECONCILIATION_VERSION
  items: MedicationLedgerItem[]
  inventoryStatus: 'not_asked' | 'awaiting_answer' | 'answered'
  inventoryPatientSeq: number | null
  pendingQuestion: PendingMedicationQuestion | null
  medicationNameClarificationCount: number
  clinicalMedicationQuestionCount: number
}

export interface MedicationQuestion {
  kind: MedicationQuestionKind
  obligationId: string
  itemId: string | null
  questionText: string
  isMedicationNameClarification: boolean
}

const AFFIRMATIVE_RE =
  /^(?:(?:yes|yeah|yep)(?:[, ]+(?:that(?:'s| is) )?(?:correct|right))?|correct|right|that(?:'s| is) correct|that(?:'s| is) right)[.! ]*$/i
const NEGATIVE_RE = /^(?:no|nope|incorrect|that(?:'s| is) not (?:it|right|correct))\b/i
const BARE_NEGATIVE_RE = /^(?:no|nope|incorrect)[.! ]*$/i
const NAME_STATUSES = new Set<MedicationNameStatus>([
  'needs_confirmation',
  'confirmed',
  'uncertain',
])
const VALUE_STATUSES = new Set<MedicationValueStatus>([
  'known',
  'unknown',
  'declined',
  'missing',
  'awaiting_review',
  'uncertain',
])
const QUESTION_KINDS = new Set<MedicationQuestionKind>([
  'med_name_confirmation',
  'med_name_retry',
  'med_dose_and_frequency',
  'med_dose',
  'med_frequency',
  'med_inventory',
])

function blankValueEvidence(): MedicationValueEvidence {
  return { status: 'missing', value: null, patientSeqs: [], attempts: 0 }
}

export function createMedicationReconciliationState(): MedicationReconciliationState {
  return {
    version: MEDICATION_RECONCILIATION_VERSION,
    items: [],
    inventoryStatus: 'not_asked',
    inventoryPatientSeq: null,
    pendingQuestion: null,
    medicationNameClarificationCount: 0,
    clinicalMedicationQuestionCount: 0,
  }
}

function cloneState(state: MedicationReconciliationState): MedicationReconciliationState {
  return {
    ...state,
    items: state.items.map((item) => ({
      ...item,
      dose: { ...item.dose, patientSeqs: [...item.dose.patientSeqs] },
      frequency: { ...item.frequency, patientSeqs: [...item.frequency.patientSeqs] },
    })),
    pendingQuestion: state.pendingQuestion ? { ...state.pendingQuestion } : null,
  }
}

function medicationNameKey(name: string): string {
  return name.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ')
}

function itemId(name: string, patientSeq: number): string {
  const canonical = name.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `med-${patientSeq}-${canonical.slice(0, 48)}`
}

function reviewedValue(
  previous: MedicationValueEvidence,
  reviewed: LiveReviewMedicationMention['dose'],
  sourcePatientSeq: number,
  mentionPatientSeq: number,
): MedicationValueEvidence {
  const allowedPatientSeqs = new Set([
    sourcePatientSeq,
    mentionPatientSeq,
    ...previous.patientSeqs,
  ])
  // A reviewer may only bind a medication value to the turn where the
  // medication was named or to the immediate answer captured while this
  // exact medication field was awaiting review. This prevents symptom
  // frequency (for example, "headaches twice weekly") from becoming a drug
  // schedule simply because the words are present elsewhere in the history.
  if (reviewed.patientSeqs.some((seq) => !allowedPatientSeqs.has(seq))) {
    return previous.status === 'awaiting_review'
      ? {
          status: previous.attempts >= 2 ? 'uncertain' : 'missing',
          value: null,
          patientSeqs: [],
          attempts: previous.attempts,
        }
      : previous
  }
  if (reviewed.status !== 'missing') {
    if (
      previous.status === 'known' &&
      reviewed.status === 'known' &&
      previous.value !== reviewed.valueSpan
    ) {
      return {
        status: 'uncertain',
        value: null,
        patientSeqs: [],
        attempts: previous.attempts,
      }
    }
    return {
      status: reviewed.status,
      value: reviewed.valueSpan,
      patientSeqs: [...reviewed.patientSeqs],
      attempts: previous.attempts,
    }
  }
  if (previous.status === 'awaiting_review') {
    return {
      status: previous.attempts >= 2 ? 'uncertain' : 'missing',
      value: null,
      patientSeqs: [],
      attempts: previous.attempts,
    }
  }
  return previous
}

/**
 * Adds only reviewer findings that were already validated as verbatim patient
 * transcript spans. It never maps, autocorrects, or normalizes a drug name.
 */
export function syncMedicationReview(
  state: MedicationReconciliationState,
  mentions: LiveReviewMedicationMention[],
): MedicationReconciliationState {
  const next = cloneState(state)
  for (const mention of [...mentions]
    .sort((left, right) => left.patientSeq - right.patientSeq)
    .slice(0, MAX_MEDICATION_CANDIDATES)) {
    const id = itemId(mention.nameSpan, mention.patientSeq)
    // The reviewer sees the full rolling transcript and may repeat the same
    // exact medication at a later sequence. Preserve one patient-confirmed
    // ledger item rather than asking the same name again. This is only
    // case/whitespace identity; it never maps brands, generics, or spellings.
    let item = next.items.find((candidate) => candidate.id === id) ??
      next.items.find((candidate) => (
        medicationNameKey(candidate.heardName) === medicationNameKey(mention.nameSpan)
      ))
    if (!item) {
      item = {
        id,
        heardName: mention.nameSpan,
        sourcePatientSeq: mention.patientSeq,
        nameStatus: 'needs_confirmation',
        nameConfirmationAttempts: 0,
        dose: blankValueEvidence(),
        frequency: blankValueEvidence(),
      }
      next.items.push(item)
    }
    item.dose = reviewedValue(
      item.dose,
      mention.dose,
      item.sourcePatientSeq,
      mention.patientSeq,
    )
    item.frequency = reviewedValue(
      item.frequency,
      mention.frequency,
      item.sourcePatientSeq,
      mention.patientSeq,
    )
  }
  return next
}

function quoteMedicationName(value: string): string {
  return `“${value.replace(/[“”"]/g, '').trim()}”`
}

function confirmationQuestion(item: MedicationLedgerItem): string {
  return `I heard ${quoteMedicationName(item.heardName)}. Is that the medication name?`
}

function retryNameQuestion(item: MedicationLedgerItem): string {
  return `I may have heard ${quoteMedicationName(item.heardName)} incorrectly. Please say or spell the medication name again?`
}

function doseAndFrequencyQuestion(item: MedicationLedgerItem): string {
  return `Please describe how you take ${quoteMedicationName(item.heardName)}, including the amount each time and the schedule?`
}

function doseQuestion(item: MedicationLedgerItem): string {
  return `What amount of ${quoteMedicationName(item.heardName)} do you take each time?`
}

function frequencyQuestion(item: MedicationLedgerItem): string {
  return `What schedule do you follow for ${quoteMedicationName(item.heardName)}?`
}

export function nextMedicationQuestion(
  state: MedicationReconciliationState,
  options: { includeInventory: boolean },
): MedicationQuestion | null {
  if (state.pendingQuestion) return null
  const item = state.items.find((candidate) => candidate.nameStatus === 'needs_confirmation')
  if (item) {
    const retry = item.nameConfirmationAttempts > 0
    return retry
      ? {
          kind: 'med_name_retry',
          obligationId: `${item.id}-name-retry-${item.nameConfirmationAttempts + 1}`,
          itemId: item.id,
          questionText: retryNameQuestion(item),
          isMedicationNameClarification: true,
        }
      : {
          kind: 'med_name_confirmation',
          obligationId: `${item.id}-name-confirmation`,
          itemId: item.id,
          questionText: confirmationQuestion(item),
          isMedicationNameClarification: true,
        }
  }

  const confirmed = state.items.find((candidate) => (
    candidate.nameStatus === 'confirmed' &&
    (
      candidate.dose.status === 'missing' ||
      (candidate.dose.status === 'uncertain' && candidate.dose.attempts < 2) ||
      candidate.frequency.status === 'missing' ||
      (candidate.frequency.status === 'uncertain' && candidate.frequency.attempts < 2)
    )
  ))
  if (confirmed) {
    const doseNeedsClarification =
      confirmed.dose.status === 'missing' ||
      (confirmed.dose.status === 'uncertain' && confirmed.dose.attempts < 2)
    const frequencyNeedsClarification =
      confirmed.frequency.status === 'missing' ||
      (confirmed.frequency.status === 'uncertain' && confirmed.frequency.attempts < 2)
    if (doseNeedsClarification && frequencyNeedsClarification) {
      return {
        kind: 'med_dose_and_frequency',
        obligationId: `${confirmed.id}-dose-frequency-${Math.max(confirmed.dose.attempts, confirmed.frequency.attempts) + 1}`,
        itemId: confirmed.id,
        questionText: doseAndFrequencyQuestion(confirmed),
        isMedicationNameClarification: false,
      }
    }
    if (doseNeedsClarification) {
      return {
        kind: 'med_dose',
        obligationId: `${confirmed.id}-dose-${confirmed.dose.attempts + 1}`,
        itemId: confirmed.id,
        questionText: doseQuestion(confirmed),
        isMedicationNameClarification: false,
      }
    }
    return {
      kind: 'med_frequency',
      obligationId: `${confirmed.id}-frequency-${confirmed.frequency.attempts + 1}`,
      itemId: confirmed.id,
      questionText: frequencyQuestion(confirmed),
      isMedicationNameClarification: false,
    }
  }

  if (options.includeInventory && state.inventoryStatus === 'not_asked') {
    return {
      kind: 'med_inventory',
      obligationId: 'medication-inventory',
      itemId: null,
      questionText: MEDICATION_INVENTORY_QUESTION,
      isMedicationNameClarification: false,
    }
  }
  return null
}

export function approveMedicationQuestion(
  state: MedicationReconciliationState,
  question: MedicationQuestion,
): MedicationReconciliationState {
  if (state.pendingQuestion) throw new Error('A medication question is already pending.')
  const next = cloneState(state)
  next.pendingQuestion = {
    kind: question.kind,
    obligationId: question.obligationId,
    itemId: question.itemId,
    questionText: question.questionText,
    assistantSeq: null,
  }
  if (question.kind === 'med_inventory') next.inventoryStatus = 'awaiting_answer'
  if (question.isMedicationNameClarification) {
    next.medicationNameClarificationCount += 1
  } else {
    next.clinicalMedicationQuestionCount += 1
  }
  return next
}

export function commitMedicationQuestion(
  state: MedicationReconciliationState,
  obligationId: string | undefined,
  assistantSeq: number,
  text: string,
): MedicationReconciliationState {
  const pending = state.pendingQuestion
  if (
    !pending ||
    pending.assistantSeq !== null ||
    obligationId !== pending.obligationId ||
    text.trim() !== pending.questionText
  ) return state
  const next = cloneState(state)
  next.pendingQuestion!.assistantSeq = assistantSeq
  return next
}

export function recordMedicationAnswer(
  state: MedicationReconciliationState,
  patientSeq: number,
  text: string,
): MedicationReconciliationState {
  const pending = state.pendingQuestion
  if (!pending || pending.assistantSeq === null) return state
  const next = cloneState(state)
  const item = pending.itemId
    ? next.items.find((candidate) => candidate.id === pending.itemId)
    : null

  if (pending.kind === 'med_name_confirmation' && item) {
    item.nameConfirmationAttempts += 1
    if (AFFIRMATIVE_RE.test(text.trim())) item.nameStatus = 'confirmed'
    else if (NEGATIVE_RE.test(text.trim())) {
      // A bare rejection gets one neutral say-or-spell retry. If the patient
      // supplied a correction in the same turn, retire the old hearing and let
      // the fresh transcript-cited reviewer add that exact new candidate.
      item.nameStatus = BARE_NEGATIVE_RE.test(text.trim())
        ? 'needs_confirmation'
        : 'uncertain'
    }
    else item.nameStatus = item.nameConfirmationAttempts >= 2 ? 'uncertain' : 'needs_confirmation'
  } else if (pending.kind === 'med_name_retry' && item) {
    item.nameConfirmationAttempts += 1
    // The retry answer is never treated as a name by this deterministic layer.
    // A fresh reviewer must return an exact patient substring as a new candidate.
    item.nameStatus = 'uncertain'
  } else if (pending.kind === 'med_dose_and_frequency' && item) {
    item.dose = {
      ...item.dose,
      status: 'awaiting_review',
      patientSeqs: [patientSeq],
      attempts: item.dose.attempts + 1,
    }
    item.frequency = {
      ...item.frequency,
      status: 'awaiting_review',
      patientSeqs: [patientSeq],
      attempts: item.frequency.attempts + 1,
    }
  } else if (pending.kind === 'med_dose' && item) {
    item.dose = {
      ...item.dose,
      status: 'awaiting_review',
      patientSeqs: [patientSeq],
      attempts: item.dose.attempts + 1,
    }
  } else if (pending.kind === 'med_frequency' && item) {
    item.frequency = {
      ...item.frequency,
      status: 'awaiting_review',
      patientSeqs: [patientSeq],
      attempts: item.frequency.attempts + 1,
    }
  } else if (pending.kind === 'med_inventory') {
    next.inventoryStatus = 'answered'
    next.inventoryPatientSeq = patientSeq
  }
  next.pendingQuestion = null
  return next
}

export function medicationReconciliationClosed(state: MedicationReconciliationState): boolean {
  if (state.inventoryStatus !== 'answered' || state.pendingQuestion) return false
  return state.items.every((item) => (
    item.nameStatus !== 'needs_confirmation' &&
    (item.nameStatus !== 'uncertain' || item.nameConfirmationAttempts >= 1) &&
    (
      item.nameStatus === 'uncertain' ||
      (
        item.dose.status !== 'missing' &&
        item.dose.status !== 'awaiting_review' &&
        (item.dose.status !== 'uncertain' || item.dose.attempts >= 2) &&
        item.frequency.status !== 'missing' &&
        item.frequency.status !== 'awaiting_review' &&
        (item.frequency.status !== 'uncertain' || item.frequency.attempts >= 2)
      )
    )
  ))
}

export function medicationReconciliationHasUncertainty(
  state: MedicationReconciliationState,
): boolean {
  return medicationReconciliationUnresolvedCount(state) > 0
}

/**
 * Count medication entries that still require clinician review. Count each
 * medication once even when more than one field is unresolved so the UI does
 * not overstate the number of affected medicines.
 */
export function medicationReconciliationUnresolvedCount(
  state: MedicationReconciliationState,
): number {
  return state.items.filter((item) => (
    item.nameStatus === 'uncertain' ||
    item.dose.status === 'uncertain' ||
    item.frequency.status === 'uncertain' ||
    item.dose.status === 'unknown' ||
    item.frequency.status === 'unknown' ||
    item.dose.status === 'declined' ||
    item.frequency.status === 'declined'
  )).length
}

/** Medication uncertainty must never be hidden by an otherwise clean review. */
export function completionWithMedicationUncertainty(
  completion: LiveInterviewReviewCompletion,
  state: MedicationReconciliationState,
): LiveInterviewReviewCompletion {
  if (completion === 'incomplete') return completion
  return medicationReconciliationHasUncertainty(state)
    ? 'complete_with_uncertainty'
    : completion
}

export function confirmedMedicationSummary(state: MedicationReconciliationState): string {
  const confirmed = state.items.filter((item) => item.nameStatus === 'confirmed')
  if (confirmed.length === 0) return ''
  return confirmed.map((item) => {
    const dose = item.dose.value ?? item.dose.status
    const frequency = item.frequency.value ?? item.frequency.status
    return `${item.heardName} — amount: ${dose}; schedule: ${frequency}`
  }).join('\n')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const expected = new Set(keys)
  if (
    Object.keys(value).length !== expected.size ||
    Object.keys(value).some((key) => !expected.has(key))
  ) throw new Error(`${label} has an invalid schema.`)
}

function positiveSequences(
  value: unknown,
  patientTextBySeq: Map<number, string>,
  label: string,
): number[] {
  if (
    !Array.isArray(value) ||
    value.length > 6 ||
    value.some((seq) => !Number.isInteger(seq) || !patientTextBySeq.has(seq as number)) ||
    new Set(value).size !== value.length
  ) throw new Error(`${label} has invalid patient citations.`)
  return [...value] as number[]
}

function parseValueEvidence(
  raw: unknown,
  patientTextBySeq: Map<number, string>,
  label: string,
): MedicationValueEvidence {
  if (!isPlainObject(raw)) throw new Error(`${label} is invalid.`)
  exactKeys(raw, ['status', 'value', 'patientSeqs', 'attempts'], label)
  if (
    typeof raw.status !== 'string' ||
    !VALUE_STATUSES.has(raw.status as MedicationValueStatus)
  ) throw new Error(`${label} status is invalid.`)
  if (!Number.isInteger(raw.attempts) || (raw.attempts as number) < 0 || (raw.attempts as number) > 2) {
    throw new Error(`${label} attempts are invalid.`)
  }
  const patientSeqs = positiveSequences(raw.patientSeqs, patientTextBySeq, label)
  const status = raw.status as MedicationValueStatus
  if (
    (status === 'known' || status === 'unknown' || status === 'declined') &&
    patientSeqs.length === 0
  ) throw new Error(`${label} requires cited patient evidence.`)
  if ((status === 'missing' || status === 'uncertain') && patientSeqs.length > 0) {
    throw new Error(`${label} cannot cite evidence for ${status}.`)
  }
  if (status === 'awaiting_review' && patientSeqs.length !== 1) {
    throw new Error(`${label} must retain its exact pending answer citation.`)
  }
  if (status === 'known') {
    if (
      typeof raw.value !== 'string' ||
      !raw.value.trim() ||
      raw.value.length > 80 ||
      !patientSeqs.some((seq) => patientTextBySeq.get(seq)?.includes(raw.value as string))
    ) throw new Error(`${label} value is not an exact cited patient substring.`)
  } else if (raw.value !== null) {
    throw new Error(`${label} cannot include an uncited value.`)
  }
  return {
    status,
    value: status === 'known' ? (raw.value as string).trim() : null,
    patientSeqs,
    attempts: raw.attempts as number,
  }
}


/**
 * Re-check that the browser ledger is the deterministic result of questions
 * that actually appear in the transcript. This prevents a caller from
 * changing counters or marking an unconfirmed medication as confirmed.
 */
export function medicationReconciliationTranscriptIsValid(
  state: MedicationReconciliationState,
  transcript: HistorianTranscriptEntry[],
): boolean {
  const patientAfter = (assistantIndex: number) => {
    const patient = transcript[assistantIndex + 1]
    return patient?.role === 'user' ? patient : null
  }
  const assistantQuestions = transcript
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.role === 'assistant')

  let nameClarifications = 0
  let clinicalMedicationQuestions = 0
  for (const { entry } of assistantQuestions) {
    if (
      state.items.some((item) => entry.text === confirmationQuestion(item)) ||
      state.items.some((item) => entry.text === retryNameQuestion(item))
    ) nameClarifications += 1
    if (
      entry.text === MEDICATION_INVENTORY_QUESTION ||
      state.items.some((item) => (
        entry.text === doseAndFrequencyQuestion(item) ||
        entry.text === doseQuestion(item) ||
        entry.text === frequencyQuestion(item)
      ))
    ) clinicalMedicationQuestions += 1
  }
  if (
    nameClarifications !== state.medicationNameClarificationCount ||
    clinicalMedicationQuestions !== state.clinicalMedicationQuestionCount
  ) return false

  for (const item of state.items) {
    const confirmationIndexes = assistantQuestions
      .filter(({ entry }) => entry.text === confirmationQuestion(item))
      .map(({ index }) => index)
    const affirmativeConfirmations = confirmationIndexes
      .map(patientAfter)
      .filter((entry): entry is HistorianTranscriptEntry => !!entry)
      .filter((entry) => AFFIRMATIVE_RE.test(entry.text.trim()))
    const retryIndexes = assistantQuestions
      .filter(({ entry }) => entry.text === retryNameQuestion(item))
      .map(({ index }) => index)
    const allNameIndexes = [...confirmationIndexes, ...retryIndexes].sort((a, b) => a - b)
    if (
      item.nameStatus === 'confirmed' &&
      (
        affirmativeConfirmations.length !== 1 ||
        confirmationIndexes.length !== 1 ||
        item.nameConfirmationAttempts !== 1
      )
    ) return false
    if (item.nameStatus !== 'confirmed' && affirmativeConfirmations.length > 0) return false
    if (allNameIndexes.length !== item.nameConfirmationAttempts) return false
    if (
      item.nameStatus === 'uncertain' &&
      (
        item.nameConfirmationAttempts < 1 ||
        allNameIndexes.length === 0 ||
        allNameIndexes.some((index) => !patientAfter(index)) ||
        AFFIRMATIVE_RE.test(patientAfter(allNameIndexes.at(-1)!)!.text.trim())
      )
    ) return false

    const doseQuestionIndexes = assistantQuestions.filter(({ entry }) => (
      entry.text === doseAndFrequencyQuestion(item) || entry.text === doseQuestion(item)
    )).map(({ index }) => index)
    const frequencyQuestionIndexes = assistantQuestions.filter(({ entry }) => (
      entry.text === doseAndFrequencyQuestion(item) || entry.text === frequencyQuestion(item)
    )).map(({ index }) => index)
    const doseAttempts = doseQuestionIndexes.length
    const frequencyAttempts = frequencyQuestionIndexes.length
    if (doseAttempts !== item.dose.attempts || frequencyAttempts !== item.frequency.attempts) {
      return false
    }
    const allowedDoseSeqs = new Set([
      item.sourcePatientSeq,
      ...doseQuestionIndexes.flatMap((index) => patientAfter(index)?.seq ?? []),
    ])
    const allowedFrequencySeqs = new Set([
      item.sourcePatientSeq,
      ...frequencyQuestionIndexes.flatMap((index) => patientAfter(index)?.seq ?? []),
    ])
    if (item.dose.patientSeqs.some((seq) => !allowedDoseSeqs.has(seq))) return false
    if (item.frequency.patientSeqs.some((seq) => !allowedFrequencySeqs.has(seq))) return false
    if (
      (item.dose.status === 'uncertain' && doseAttempts !== 2) ||
      (item.frequency.status === 'uncertain' && frequencyAttempts !== 2)
    ) return false
  }
  return true
}

/**
 * The current server-attested silent review must account for every ledger
 * item and vice versa. Exact spellings are compared without drug-dictionary
 * normalization; known values must match one reviewer-cited exact span.
 */
export function medicationReconciliationMatchesReview(
  state: MedicationReconciliationState,
  mentions: LiveReviewMedicationMention[],
): boolean {
  const itemForMention = (mention: LiveReviewMedicationMention) => state.items.find((item) => (
    medicationNameKey(item.heardName) === medicationNameKey(mention.nameSpan)
  ))
  if (mentions.some((mention) => !itemForMention(mention))) return false
  return state.items.every((item) => {
    const matches = mentions.filter((mention) => (
      medicationNameKey(item.heardName) === medicationNameKey(mention.nameSpan)
    ))
    if (!matches.some((mention) => (
      mention.patientSeq === item.sourcePatientSeq && mention.nameSpan === item.heardName
    ))) return false
    for (const [key, evidence] of [
      ['dose', item.dose],
      ['frequency', item.frequency],
    ] as const) {
      if (evidence.status === 'known' && !matches.some((mention) => {
        const reviewed = mention[key]
        return reviewed.status === 'known' && reviewed.valueSpan === evidence.value
      })) return false
      if (
        (evidence.status === 'unknown' || evidence.status === 'declined') &&
        !matches.some((mention) => mention[key].status === evidence.status)
      ) return false
    }
    return true
  })
}

/**
 * Server-side trust boundary for the browser-supplied ledger. It returns a
 * known-field clone and re-proves every stored name/value against the exact
 * patient transcript.
 */
export function parseMedicationReconciliationState(
  raw: unknown,
  transcript: HistorianTranscriptEntry[],
): MedicationReconciliationState {
  if (!isPlainObject(raw)) throw new Error('Medication reconciliation is missing.')
  exactKeys(raw, [
    'version',
    'items',
    'inventoryStatus',
    'inventoryPatientSeq',
    'pendingQuestion',
    'medicationNameClarificationCount',
    'clinicalMedicationQuestionCount',
  ], 'Medication reconciliation')
  if (raw.version !== MEDICATION_RECONCILIATION_VERSION) {
    throw new Error('Medication reconciliation version is unsupported.')
  }
  const patientTextBySeq = new Map(
    transcript
      .filter((entry) => entry.role === 'user' && Number.isInteger(entry.seq))
      .map((entry) => [entry.seq!, entry.text] as const),
  )
  if (!Array.isArray(raw.items) || raw.items.length > MAX_MEDICATION_CANDIDATES) {
    throw new Error('Medication reconciliation item count is invalid.')
  }
  const seen = new Set<string>()
  const items: MedicationLedgerItem[] = raw.items.map((candidate, index) => {
    if (!isPlainObject(candidate)) throw new Error(`Medication ${index} is invalid.`)
    exactKeys(candidate, [
      'id',
      'heardName',
      'sourcePatientSeq',
      'nameStatus',
      'nameConfirmationAttempts',
      'dose',
      'frequency',
    ], `Medication ${index}`)
    if (
      typeof candidate.heardName !== 'string' ||
      !candidate.heardName.trim() ||
      candidate.heardName.length > 80 ||
      !Number.isInteger(candidate.sourcePatientSeq)
    ) throw new Error(`Medication ${index} source is invalid.`)
    const heardName = candidate.heardName.trim()
    const sourcePatientSeq = candidate.sourcePatientSeq as number
    if (!patientTextBySeq.get(sourcePatientSeq)?.includes(heardName)) {
      throw new Error(`Medication ${index} name is not an exact patient substring.`)
    }
    const expectedId = itemId(heardName, sourcePatientSeq)
    if (candidate.id !== expectedId || seen.has(expectedId)) {
      throw new Error(`Medication ${index} identity is invalid.`)
    }
    seen.add(expectedId)
    if (
      typeof candidate.nameStatus !== 'string' ||
      !NAME_STATUSES.has(candidate.nameStatus as MedicationNameStatus) ||
      !Number.isInteger(candidate.nameConfirmationAttempts) ||
      (candidate.nameConfirmationAttempts as number) < 0 ||
      (candidate.nameConfirmationAttempts as number) > 2
    ) throw new Error(`Medication ${index} confirmation is invalid.`)
    return {
      id: expectedId,
      heardName,
      sourcePatientSeq,
      nameStatus: candidate.nameStatus as MedicationNameStatus,
      nameConfirmationAttempts: candidate.nameConfirmationAttempts as number,
      dose: parseValueEvidence(candidate.dose, patientTextBySeq, `Medication ${index} dose`),
      frequency: parseValueEvidence(
        candidate.frequency,
        patientTextBySeq,
        `Medication ${index} frequency`,
      ),
    }
  })

  if (
    raw.inventoryStatus !== 'not_asked' &&
    raw.inventoryStatus !== 'awaiting_answer' &&
    raw.inventoryStatus !== 'answered'
  ) throw new Error('Medication inventory status is invalid.')
  const inventoryPatientSeq =
    raw.inventoryPatientSeq === null
      ? null
      : Number.isInteger(raw.inventoryPatientSeq) &&
          patientTextBySeq.has(raw.inventoryPatientSeq as number)
        ? raw.inventoryPatientSeq as number
        : (() => { throw new Error('Medication inventory citation is invalid.') })()
  if (
    (raw.inventoryStatus === 'answered') !== (inventoryPatientSeq !== null)
  ) throw new Error('Medication inventory answer is inconsistent.')
  if (inventoryPatientSeq !== null) {
    const inventoryIndex = transcript.findIndex((entry) => entry.seq === inventoryPatientSeq)
    if (
      inventoryIndex < 1 ||
      transcript[inventoryIndex - 1]?.role !== 'assistant' ||
      transcript[inventoryIndex - 1]?.text !== MEDICATION_INVENTORY_QUESTION
    ) throw new Error('Medication inventory answer is not bound to the approved inventory question.')
  }

  let pendingQuestion: PendingMedicationQuestion | null = null
  if (raw.pendingQuestion !== null) {
    if (!isPlainObject(raw.pendingQuestion)) throw new Error('Pending medication question is invalid.')
    exactKeys(raw.pendingQuestion, [
      'kind',
      'obligationId',
      'itemId',
      'questionText',
      'assistantSeq',
    ], 'Pending medication question')
    if (
      typeof raw.pendingQuestion.kind !== 'string' ||
      !QUESTION_KINDS.has(raw.pendingQuestion.kind as MedicationQuestionKind) ||
      typeof raw.pendingQuestion.obligationId !== 'string' ||
      !raw.pendingQuestion.obligationId ||
      typeof raw.pendingQuestion.questionText !== 'string' ||
      !raw.pendingQuestion.questionText ||
      (
        raw.pendingQuestion.itemId !== null &&
        (typeof raw.pendingQuestion.itemId !== 'string' || !seen.has(raw.pendingQuestion.itemId))
      ) ||
      (
        raw.pendingQuestion.assistantSeq !== null &&
        (!Number.isInteger(raw.pendingQuestion.assistantSeq) ||
          (raw.pendingQuestion.assistantSeq as number) < 1)
      )
    ) throw new Error('Pending medication question is invalid.')
    pendingQuestion = {
      kind: raw.pendingQuestion.kind as MedicationQuestionKind,
      obligationId: raw.pendingQuestion.obligationId,
      itemId: raw.pendingQuestion.itemId as string | null,
      questionText: raw.pendingQuestion.questionText,
      assistantSeq: raw.pendingQuestion.assistantSeq as number | null,
    }
  }
  for (const [label, value] of [
    ['Medication-name clarification count', raw.medicationNameClarificationCount],
    ['Clinical medication question count', raw.clinicalMedicationQuestionCount],
  ] as const) {
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 60) {
      throw new Error(`${label} is invalid.`)
    }
  }
  return {
    version: MEDICATION_RECONCILIATION_VERSION,
    items,
    inventoryStatus: raw.inventoryStatus,
    inventoryPatientSeq,
    pendingQuestion,
    medicationNameClarificationCount: raw.medicationNameClarificationCount as number,
    clinicalMedicationQuestionCount: raw.clinicalMedicationQuestionCount as number,
  }
}
