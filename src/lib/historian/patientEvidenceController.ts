import {
  COMPREHENSIVE_HISTORY_DOMAINS,
  type ComprehensiveHistoryDomain,
  type HistorianTranscriptEntry,
} from '@/lib/historianTypes'
import { hasDeterministicActiveSafetyTrigger } from '@/lib/historian/safetyTrigger'

/**
 * Deterministic, serializable evidence ledger for Comprehensive mode.  It is
 * deliberately ignorant of model output: only an approved canonical question
 * followed by patient transcript entries can close an obligation.
 */
export const PATIENT_EVIDENCE_CONTROLLER_VERSION = 1 as const

export type PatientEvidenceOutcome = 'substantive' | 'negative' | 'unknown' | 'declined'
export type PatientEvidenceCompletion = 'coverage_complete' | 'complete_with_uncertainty' | 'incomplete'
export type PatientEvidenceResponseContract = 'binary' | 'open_none_allowed' | 'open_detail_required'

export interface PatientEvidenceCondition {
  obligationId: string
  outcome: 'substantive'
}

export interface PatientEvidenceObligation {
  id: string
  domain: ComprehensiveHistoryDomain
  question: string
  clarification: string
  responseContract: PatientEvidenceResponseContract
  /** Evaluated only from an earlier, transcript-bound patient answer. */
  condition?: PatientEvidenceCondition
}

const obligation = (
  id: string,
  domain: ComprehensiveHistoryDomain,
  question: string,
  clarification: string,
  responseContract: PatientEvidenceResponseContract,
  condition?: PatientEvidenceObligation['condition'],
): PatientEvidenceObligation => ({ id, domain, question, clarification, responseContract, condition })

const detail = (
  id: string,
  domain: ComprehensiveHistoryDomain,
  question: string,
  clarification: string,
  condition?: PatientEvidenceObligation['condition'],
) => obligation(id, domain, question, clarification, 'open_detail_required', condition)

const optionalDetail = (
  id: string,
  domain: ComprehensiveHistoryDomain,
  question: string,
  clarification: string,
  condition?: PatientEvidenceObligation['condition'],
) => obligation(id, domain, question, clarification, 'open_none_allowed', condition)

const binary = (
  id: string,
  domain: ComprehensiveHistoryDomain,
  question: string,
  clarification: string,
  condition?: PatientEvidenceObligation['condition'],
) => obligation(id, domain, question, clarification, 'binary', condition)

// One ordinary, audible question per obligation. Clarifications are single
// rephrasings, not a question followed by an example or a second question.
// Keeping complaint detail, neurologic review, medication safety, social
// history, and prior-study details separate prevents a superficially complete
// but shallow interview while preserving a hard one-question speech contract.
export const COMPREHENSIVE_PATIENT_EVIDENCE_PLAN: readonly PatientEvidenceObligation[] = [
  detail('referral_reason', 'referral_reason', "Hi, I'm Henry, and I'll help gather your history before your neurology visit. What brought you to be referred for this visit?", 'What is the main concern that led to this referral?'),
  detail('patient_reported_age', 'patient_reported_age', 'How old are you?', 'What is your age in years?'),
  detail('symptom_description', 'presenting_symptom', 'How would you describe the symptom that concerns you most?', 'How would you describe the main symptom in your own words?'),
  detail('symptom_onset', 'presenting_symptom', 'When did that symptom first begin?', 'About when did the symptom start?'),
  detail('symptom_onset_context', 'presenting_symptom', 'What was happening when that symptom first began?', 'What were you doing when the symptom started?'),
  detail('symptom_typical_evolution', 'presenting_symptom', 'What happens from the beginning to the end of a typical episode?', 'What happens during a typical episode?'),
  detail('symptom_most_recent', 'presenting_symptom', 'When did the symptom most recently happen?', 'When was the most recent episode?'),
  detail('symptom_location', 'presenting_symptom', 'Where in your body do you notice that symptom?', 'What part of your body is affected?'),
  detail('symptom_frequency', 'presenting_symptom', 'How often does that symptom happen?', 'How frequently does the symptom occur?'),
  detail('symptom_episode_duration', 'presenting_symptom', 'How long does one episode usually last?', 'How much time does a typical episode last?'),
  detail('symptom_course', 'presenting_symptom', 'How has that symptom changed since it began?', 'What change have you noticed in the symptom over time?'),
  detail('symptom_severity', 'presenting_symptom', 'How severe does that symptom feel at its worst?', 'How intense is the symptom at its worst?'),
  optionalDetail('symptom_triggers', 'presenting_symptom', 'What tends to bring that symptom on?', 'What tends to start the symptom?'),
  optionalDetail('symptom_relief', 'presenting_symptom', 'What tends to make that symptom ease?', 'What makes the symptom lessen?'),
  optionalDetail('symptom_treatments_tried', 'presenting_symptom', 'What have you tried to improve the symptom?', 'What treatment have you tried for the symptom?'),
  optionalDetail('associated_symptoms', 'associated_symptoms', 'What other symptoms happen at the same time?', 'What else do you notice during the symptom?'),
  binary('red_flags', 'red_flags', 'Are you experiencing a sudden severe new symptom right now?', 'Is a severe new symptom happening now?'),
  binary('red_flag_thunderclap', 'red_flags', 'Did this symptom reach its worst intensity within one minute?', 'Did the symptom become most severe within one minute?'),
  binary('red_flag_sudden_focal', 'red_flags', 'Did this concern begin with sudden new weakness, numbness, vision loss, or trouble speaking?', 'Was there a sudden new loss of strength, feeling, vision, or speech?'),
  binary('red_flag_seizure', 'red_flags', 'Has this concern included a seizure?', 'Did a seizure happen with this concern?'),
  binary('red_flag_loss_consciousness', 'red_flags', 'Has this concern included loss of consciousness?', 'Did you lose consciousness with this concern?'),
  binary('red_flag_head_injury', 'red_flags', 'Did this concern begin after a recent head injury?', 'Was there a recent head injury before this concern began?'),
  binary('red_flag_fever_stiff_neck', 'red_flags', 'Has this concern occurred with fever and a stiff neck?', 'Did fever and a stiff neck occur with this concern?'),
  binary('prior_episodes', 'prior_episodes', 'Have you experienced this same symptom before?', 'Did this same symptom happen before?'),
  optionalDetail('functional_impact', 'functional_impact', 'How does this symptom affect your daily activities?', 'What usual activity is hardest because of this symptom?'),
  optionalDetail('functional_sleep_impact', 'functional_impact', 'How does the symptom affect your sleep?', 'What sleep difficulty does the symptom cause?'),
  optionalDetail('functional_work_impact', 'functional_impact', 'How does the symptom affect your work or school?', 'What work or school activity is affected most?'),
  binary('neurologic_falls', 'neurologic_review_of_systems', 'Have you had a recent fall?', 'Did you fall recently?'),
  binary('neurologic_weakness', 'neurologic_review_of_systems', 'Have you noticed new weakness?', 'Has your strength changed recently?'),
  detail('neurologic_weakness_detail', 'neurologic_review_of_systems', 'What part of your body feels weak?', 'Where do you feel the weakness?', { obligationId: 'neurologic_weakness', outcome: 'substantive' }),
  binary('neurologic_sensation', 'neurologic_review_of_systems', 'Have you noticed a new change in sensation?', 'Have you noticed new numbness?'),
  binary('neurologic_balance', 'neurologic_review_of_systems', 'Have you noticed a new change in balance?', 'Has your balance changed recently?'),
  binary('neurologic_vision', 'neurologic_review_of_systems', 'Have you noticed a new change in vision?', 'Has your vision changed recently?'),
  binary('neurologic_speech', 'neurologic_review_of_systems', 'Have you noticed a new change in speech?', 'Has your speech changed recently?'),
  binary('neurologic_memory', 'neurologic_review_of_systems', 'Have you noticed a new change in memory?', 'Has your memory changed recently?'),
  binary('neurologic_awareness', 'neurologic_review_of_systems', 'Have you had a new loss of awareness?', 'Have you lost awareness recently?'),
  optionalDetail('past_medical_history', 'past_medical_history', 'What medical conditions have you been diagnosed with?', 'What health conditions do you have?'),
  optionalDetail('past_hospitalizations', 'past_medical_history', 'What hospital stays have you had?', 'Why have you stayed in a hospital?'),
  optionalDetail('past_surgical_history', 'past_surgical_history', 'What operations have you had?', 'What surgery have you had?'),
  optionalDetail('medications', 'medications', 'What medications do you take regularly?', 'Please name the medications you take regularly?'),
  detail('medication_doses', 'medications', 'What dose do you take for each medication?', 'Please state the dose of each medication?', { obligationId: 'medications', outcome: 'substantive' }),
  detail('medication_adherence', 'medication_adherence_side_effects', 'How consistently do you take those medications?', 'How regularly do you take those medications?', { obligationId: 'medications', outcome: 'substantive' }),
  optionalDetail('medication_side_effects', 'medication_adherence_side_effects', 'What medication side effects have you noticed?', 'What unwanted effect have you noticed from a medication?', { obligationId: 'medications', outcome: 'substantive' }),
  optionalDetail('allergies', 'allergies', 'What medication allergies do you have?', 'Please name any medication allergy you have?'),
  detail('allergy_reactions', 'allergies', 'What reaction does that allergy cause?', 'What happens when you encounter that allergy?', { obligationId: 'allergies', outcome: 'substantive' }),
  binary('family_neurologic_history', 'family_neurologic_history', 'Has anyone in your family had a neurologic condition?', 'Any family history of neurologic problems?'),
  detail('living_situation', 'social_exposure_history', 'Who lives with you?', 'What is your current living situation?'),
  detail('occupation', 'social_exposure_history', 'What kind of work do you do?', 'What is your usual occupation?'),
  binary('nicotine_use', 'social_exposure_history', 'Do you currently use nicotine?', 'Do you use tobacco now?'),
  optionalDetail('alcohol_use', 'social_exposure_history', 'How often do you drink alcohol?', 'What is your usual alcohol use?'),
  binary('recreational_substances', 'social_exposure_history', 'Do you use recreational drugs?', 'Do you currently use a recreational substance?'),
  binary('environmental_exposure', 'social_exposure_history', 'Have you had a relevant environmental exposure?', 'Has an environmental exposure concerned you?'),
  binary('recent_travel', 'social_exposure_history', 'Have you traveled recently?', 'Did you take a recent trip?'),
  optionalDetail('prior_studies', 'prior_studies', 'What tests have you had for this concern?', 'Please name any prior test for this concern?'),
  detail('prior_study_timing', 'prior_studies', 'When was the most recent test performed?', 'About when did you have the most recent test?', { obligationId: 'prior_studies', outcome: 'substantive' }),
  detail('prior_study_location', 'prior_studies', 'Where was the most recent test performed?', 'What facility performed the most recent test?', { obligationId: 'prior_studies', outcome: 'substantive' }),
  detail('prior_study_results', 'prior_studies', 'What were you told about the most recent test result?', 'What result do you remember from the most recent test?', { obligationId: 'prior_studies', outcome: 'substantive' }),
  detail('patient_goals', 'patient_goals_questions', 'What are you hoping to get from this visit?', 'What outcome from this visit would help you most?'),
  optionalDetail('patient_questions', 'patient_goals_questions', 'What question would you most like the neurologist to address?', 'What is your main question for the neurologist?'),
]

const obligationById = new Map(COMPREHENSIVE_PATIENT_EVIDENCE_PLAN.map((item) => [item.id, item]))
const domainIds = new Set<string>(COMPREHENSIVE_HISTORY_DOMAINS.map((domain) => domain.id))
const QUESTION_EXAMPLE_RE = /\b(?:for example|for instance|such as|e\.g\.)\b/i
const SECOND_QUESTION_RE = /\b(?:and|or)\s+(?:what|when|where|who|why|how|which|do|does|did|is|are|was|were|have|has|can|could|would|will)\b/i
const BARE_AFFIRMATIVE_RE = /^(?:yes|yeah|yep|sure)[.! ]*$/i
const BARE_AMBIGUOUS_RE = /^(?:maybe|okay|ok)[.! ]*$/i
const PATIENT_QUESTION_RE = /^(?:what|why|how|when|where|who|which|do|does|did|is|are|can|could|should|would|will)\b.*\?$/i
const NEGATIVE_WITH_DETAIL_RE = /\b(?:but|except(?:\s+for)?|only|actually|other than|aside from|besides|however|although|though|just)\b/i
const DIRECT_AFFIRMATIVE_RESPONSE_RE = /^(?:(?:yes|yeah|yep|sure|correct|that(?:'s| is) right)(?:\b|[,!.])|(?:i am|it is|i do)[.! ]*$)/i
const CURRENT_EMERGENCY_DENIAL_PATTERNS = [
  /\b(?:not right now|not currently)[.! ]*$/i,
  /\bnot (?:currently )?(?:experiencing|having) (?:that|this|it)[.! ]*$/i,
  /\bnot (?:currently )?(?:experiencing|having) (?:any|a|the|this|that) (?:severe )?(?:new )?symptom[.! ]*$/i,
  /\bno longer (?:have|experience) (?:(?:that|this|the) (?:severe )?(?:new )?symptom|it)[.! ]*$/i,
  /\b(?:it|that|this) is not happening(?: right now| currently| now)?[.! ]*$/i,
] as const

function hasExplicitCurrentEmergencyDenial(text: string): boolean {
  return CURRENT_EMERGENCY_DENIAL_PATTERNS.some((pattern) => pattern.test(text))
}

/** Shared source-side invariant for every app-approved audible question. */
export function patientEvidenceQuestionContractIssues(text: string): string[] {
  const issues: string[] = []
  if (!text.trim()) issues.push('Question is empty.')
  if ((text.match(/\?/g) ?? []).length !== 1 || !text.trim().endsWith('?')) {
    issues.push('Question must contain exactly one terminal question mark.')
  }
  if (QUESTION_EXAMPLE_RE.test(text)) issues.push('Question contains an unsolicited example.')
  if (SECOND_QUESTION_RE.test(text)) issues.push('Question contains a second response obligation.')
  return issues
}

export interface PatientEvidenceRecord {
  obligationId: string
  domain: ComprehensiveHistoryDomain
  questionText: string
  assistantSeq: number
  patientSeqs: number[]
  outcome: PatientEvidenceOutcome
}

export interface AwaitingPatientEvidenceQuestion {
  obligationId: string
  questionText: string
  assistantSeq: number | null
  isClarification: boolean
}

export interface PatientEvidenceState {
  version: typeof PATIENT_EVIDENCE_CONTROLLER_VERSION
  records: PatientEvidenceRecord[]
  awaitingQuestion: AwaitingPatientEvidenceQuestion | null
  pendingPatientSeqs: number[]
  /** Set only after a narrow clarification; next selection re-asks this same obligation. */
  repeatObligationId: string | null
}

export interface PatientEvidenceResult<T> {
  ok: boolean
  value?: T
  error?: string
}

export function createPatientEvidenceState(): PatientEvidenceState {
  return { version: PATIENT_EVIDENCE_CONTROLLER_VERSION, records: [], awaitingQuestion: null, pendingPatientSeqs: [], repeatObligationId: null }
}

function cloneState(state: PatientEvidenceState): PatientEvidenceState {
  return {
    ...state,
    records: state.records.map((record) => ({ ...record, patientSeqs: [...record.patientSeqs] })),
    awaitingQuestion: state.awaitingQuestion ? { ...state.awaitingQuestion } : null,
    pendingPatientSeqs: [...state.pendingPatientSeqs],
  }
}

function isApplicable(obligation: PatientEvidenceObligation, records: PatientEvidenceRecord[]): boolean {
  if (!obligation.condition) return true
  return records.find((record) => record.obligationId === obligation.condition!.obligationId)?.outcome === obligation.condition.outcome
}

function nextObligation(state: PatientEvidenceState): PatientEvidenceObligation | null {
  if (state.repeatObligationId) return obligationById.get(state.repeatObligationId) ?? null
  return COMPREHENSIVE_PATIENT_EVIDENCE_PLAN.find((item) =>
    isApplicable(item, state.records) && !state.records.some((record) => record.obligationId === item.id),
  ) ?? null
}

/** Selects and approves exactly one canonical question.  It does not credit evidence. */
export function approveNextPatientEvidenceQuestion(state: PatientEvidenceState): PatientEvidenceResult<{ state: PatientEvidenceState; obligation: PatientEvidenceObligation; questionText: string }> {
  if (state.awaitingQuestion) return { ok: false, error: 'A question is already awaiting a patient response.' }
  const selected = nextObligation(state)
  if (!selected) return { ok: false, error: 'No applicable patient-evidence obligation remains.' }
  const isClarification = state.repeatObligationId === selected.id
  const questionText = isClarification ? selected.clarification : selected.question
  const contractIssues = patientEvidenceQuestionContractIssues(questionText)
  if (contractIssues.length) return { ok: false, error: contractIssues.join(' ') }
  const next = cloneState(state)
  next.awaitingQuestion = {
    obligationId: selected.id,
    questionText,
    assistantSeq: null,
    isClarification,
  }
  next.repeatObligationId = null
  return { ok: true, value: { state: next, obligation: selected, questionText } }
}

/** Binds an approved exact canonical question to the assistant transcript sequence before audio may be credited. */
export function commitApprovedPatientEvidenceQuestion(state: PatientEvidenceState, assistantSeq: number, exactQuestionText: string): PatientEvidenceResult<PatientEvidenceState> {
  if (!state.awaitingQuestion || state.awaitingQuestion.assistantSeq !== null) return { ok: false, error: 'There is no uncommitted approved question.' }
  if (!Number.isInteger(assistantSeq) || assistantSeq < 1) return { ok: false, error: 'Assistant sequence must be a positive integer.' }
  if (exactQuestionText !== state.awaitingQuestion.questionText) return { ok: false, error: 'Question text does not match the approved canonical question.' }
  const next = cloneState(state)
  next.awaitingQuestion!.assistantSeq = assistantSeq
  return { ok: true, value: next }
}

/** Collects transcript-confirmed patient entries; each answer must be contiguous. */
export function collectPatientEvidenceEntry(state: PatientEvidenceState, entry: HistorianTranscriptEntry): PatientEvidenceResult<PatientEvidenceState> {
  if (!state.awaitingQuestion?.assistantSeq) return { ok: false, error: 'A committed question is required before collecting a patient answer.' }
  if (entry.role !== 'user' || !Number.isInteger(entry.seq) || entry.seq! < 1) return { ok: false, error: 'Only a sequenced patient transcript entry may be collected.' }
  if (entry.seq! <= state.awaitingQuestion.assistantSeq) return { ok: false, error: 'Patient evidence must follow its assistant question.' }
  const last = state.pendingPatientSeqs.at(-1)
  if (last !== undefined && entry.seq !== last + 1) return { ok: false, error: 'Patient evidence sequences must be contiguous.' }
  const next = cloneState(state)
  next.pendingPatientSeqs.push(entry.seq!)
  return { ok: true, value: next }
}

export function classifyPatientEvidenceResponse(text: string): 'clarification' | PatientEvidenceOutcome {
  const normalized = text.trim().toLowerCase()
  if (/^(?:what do you mean|(?:can|could|would) you (?:repeat|clarify|explain|rephrase|say that again|give me an example)|i don'?t understand|please (?:clarify|repeat|explain|rephrase)|which (?:symptom|one)|what (?:symptom|condition|medication|test) do you mean)[?.! ]*$/.test(normalized)) return 'clarification'
  if (/\b(prefer not|don'?t want to|decline|rather not say|won'?t answer)\b/.test(normalized)) return 'declined'
  if (/^(i don'?t know|not sure|can'?t remember|unknown)[.! ]*$/.test(normalized)) return 'unknown'
  const negativeCandidate =
    /^(?:no|nope|none|never|not that i know of|nothing)(?:[,;.! ]|$)/.test(normalized) ||
    /^(?:not currently|not right now|there (?:is|are|was|were) no)(?:[,;.! ]|$)/.test(normalized) ||
    /^(?:i|we) (?:do not|don'?t|did not|didn'?t) (?:have|take|use|experience|notice|remember|know|drink|smoke)\b/.test(normalized) ||
    /^(?:i|we) (?:have not|haven'?t) (?:had|noticed|experienced|used|taken)\b/.test(normalized)
  // A leading negation does not erase contradictory or qualifying detail.
  // Treat the entire response as substantive so medication/allergy/study
  // follow-ups remain applicable and safety text is not silently discarded.
  if (negativeCandidate && !NEGATIVE_WITH_DETAIL_RE.test(normalized)) return 'negative'
  return 'substantive'
}

function classifyPatientEvidenceResponseForObligation(
  obligation: PatientEvidenceObligation,
  text: string,
): 'clarification' | PatientEvidenceOutcome {
  const classified = classifyPatientEvidenceResponse(text)
  if (PATIENT_QUESTION_RE.test(text.trim())) return 'clarification'
  // A generic negative is semantically valid only for a binary screen or an
  // open question whose contract explicitly permits "none." Referral reason,
  // age, onset, severity, living situation, goals, and other required-detail
  // questions must receive actual detail or one bounded clarification.
  if (classified === 'negative') {
    return obligation.responseContract === 'open_detail_required'
      ? 'clarification'
      : 'negative'
  }
  if (classified !== 'substantive') return classified
  if (BARE_AMBIGUOUS_RE.test(text.trim())) return 'clarification'
  // A bare affirmative answers a binary screen, but supplies no detail for an
  // open question. It therefore cannot silently close either open contract.
  if (
    obligation.responseContract !== 'binary' &&
    BARE_AFFIRMATIVE_RE.test(text.trim())
  ) return 'clarification'
  return classified
}

/** Safety-specific interpretation of the app-owned active-emergency answer.
 * A direct affirmative is contextual safety even without a keyword. A
 * leading negative is escalated only when its added detail independently
 * contains an explicit active-emergency phrase. */
export function patientEvidenceAnswerRequiresSafetyEscalation(
  state: PatientEvidenceState,
  patientText: string,
): boolean {
  const awaiting = state.awaitingQuestion
  if (awaiting?.obligationId !== 'red_flags' || awaiting.assistantSeq === null) return false
  const normalized = patientText.trim()
  return (
    (
      DIRECT_AFFIRMATIVE_RESPONSE_RE.test(normalized) &&
      !hasExplicitCurrentEmergencyDenial(normalized)
    ) ||
    hasDeterministicActiveSafetyTrigger(normalized)
  )
}

function transcriptBySeq(transcript: HistorianTranscriptEntry[]): Map<number, HistorianTranscriptEntry> {
  const entries = new Map<number, HistorianTranscriptEntry>()
  for (const entry of transcript) if (Number.isInteger(entry.seq)) entries.set(entry.seq!, entry)
  return entries
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed)
  return Object.keys(value).every((key) => allowedSet.has(key)) && allowed.every((key) => key in value)
}

/** Settles the preceding response when a subsequent question or save is requested. */
export function settlePatientEvidenceAnswer(state: PatientEvidenceState, transcript: HistorianTranscriptEntry[]): PatientEvidenceResult<PatientEvidenceState> {
  const awaiting = state.awaitingQuestion
  if (!awaiting?.assistantSeq) return { ok: false, error: 'There is no committed question to settle.' }
  if (!state.pendingPatientSeqs.length) return { ok: false, error: 'A patient response is required before settling an obligation.' }
  const entries = transcriptBySeq(transcript)
  const patientEntries = state.pendingPatientSeqs.map((seq) => entries.get(seq))
  if (patientEntries.some((entry) => !entry || entry.role !== 'user')) return { ok: false, error: 'Patient evidence is missing from the transcript or has the wrong role.' }
  const response = patientEntries.map((entry) => entry!.text).join(' ').trim()
  const obligation = obligationById.get(awaiting.obligationId)
  if (!obligation) return { ok: false, error: 'Awaiting obligation is not recognized.' }
  const classified = classifyPatientEvidenceResponseForObligation(obligation, response)
  const next = cloneState(state)
  next.pendingPatientSeqs = []
  next.awaitingQuestion = null
  if (classified === 'clarification' && !awaiting.isClarification) {
    next.repeatObligationId = awaiting.obligationId
    return { ok: true, value: next }
  }
  // One canonical rephrasing is the bounded clarification allowance. If the
  // patient still cannot answer it, close the obligation as explicit
  // uncertainty instead of looping until the 60-exchange hard stop.
  const outcome: PatientEvidenceOutcome =
    classified === 'clarification' ? 'unknown' : classified
  next.records.push({ obligationId: obligation.id, domain: obligation.domain, questionText: awaiting.questionText, assistantSeq: awaiting.assistantSeq, patientSeqs: [...state.pendingPatientSeqs], outcome })
  return { ok: true, value: next }
}

export interface PatientEvidenceDomainCoverage {
  domain: ComprehensiveHistoryDomain
  status: 'covered' | 'uncertain' | 'not_applicable' | 'incomplete'
  recordIds: string[]
}

/** Derives coverage from settled patient evidence, never from model structured output. */
export function derivePatientEvidenceCoverage(state: PatientEvidenceState): PatientEvidenceDomainCoverage[] {
  return COMPREHENSIVE_HISTORY_DOMAINS.map(({ id: domain }) => {
    const domainObligations = COMPREHENSIVE_PATIENT_EVIDENCE_PLAN.filter((item) => item.domain === domain)
    const applicable = domainObligations.filter((item) => isApplicable(item, state.records))
    const records = state.records.filter((record) => record.domain === domain)
    if (!applicable.length) {
      const prerequisiteUnresolved = domainObligations.some((item) => (
        item.condition &&
        !state.records.some((record) => record.obligationId === item.condition!.obligationId)
      ))
      return {
        domain,
        status: prerequisiteUnresolved ? 'incomplete' : 'not_applicable',
        recordIds: records.map((record) => record.obligationId),
      }
    }
    if (records.length < applicable.length) return { domain, status: 'incomplete', recordIds: records.map((record) => record.obligationId) }
    return {
      domain,
      status: records.some((record) => record.outcome === 'unknown' || record.outcome === 'declined') ? 'uncertain' : 'covered',
      recordIds: records.map((record) => record.obligationId),
    }
  })
}

/** Converts the application ledger into the persisted fixed-vocabulary audit.
 * This replaces, rather than trusts, model-authored coverage in v2. */
export function derivePatientEvidenceStructuredCoverage(state: PatientEvidenceState): {
  covered_domains: ComprehensiveHistoryDomain[]
  missing_or_uncertain: Array<{
    domain: ComprehensiveHistoryDomain
    reason: 'not_asked' | 'unknown' | 'declined' | 'conflicting'
  }>
} {
  const coverage = derivePatientEvidenceCoverage(state)
  return {
    covered_domains: coverage
      .filter((item) => item.status === 'covered' || item.status === 'not_applicable')
      .map((item) => item.domain),
    missing_or_uncertain: coverage
      .filter((item) => item.status === 'uncertain' || item.status === 'incomplete')
      .map((item) => {
        const records = state.records.filter((record) => record.domain === item.domain)
        const reason = item.status === 'incomplete'
          ? 'not_asked' as const
          : records.some((record) => record.outcome === 'declined')
            ? 'declined' as const
            : records.some((record) => record.outcome === 'unknown')
              ? 'unknown' as const
              : 'conflicting' as const
        return { domain: item.domain, reason }
      }),
  }
}

export function patientEvidenceCompletion(state: PatientEvidenceState): PatientEvidenceCompletion {
  const coverage = derivePatientEvidenceCoverage(state)
  if (state.awaitingQuestion || state.repeatObligationId || coverage.some((item) => item.status === 'incomplete')) return 'incomplete'
  return coverage.some((item) => item.status === 'uncertain') ? 'complete_with_uncertainty' : 'coverage_complete'
}

/** Strictly validates schema, plan order, applicability, canonical question
 * binding, claimed outcomes, and transcript roles/sequences. */
export function validatePatientEvidenceState(state: unknown, transcript: HistorianTranscriptEntry[]): { valid: boolean; issues: string[] } {
  const issues: string[] = []
  if (!isPlainObject(state)) return { valid: false, issues: ['Evidence state must be an object.'] }
  if (!hasOnlyKeys(state, ['version', 'records', 'awaitingQuestion', 'pendingPatientSeqs', 'repeatObligationId'])) {
    issues.push('Evidence state has unknown or missing fields.')
  }
  const candidate = state as Partial<PatientEvidenceState>
  if (candidate.version !== PATIENT_EVIDENCE_CONTROLLER_VERSION) issues.push('Unsupported evidence-state version.')
  if (!Array.isArray(candidate.records) || !Array.isArray(candidate.pendingPatientSeqs)) issues.push('Evidence state has an invalid record schema.')
  if (candidate.repeatObligationId !== null && typeof candidate.repeatObligationId !== 'string') issues.push('Invalid repeat obligation.')

  const seenTranscriptSeqs = new Set<number>()
  for (const entry of transcript) {
    if (!Number.isInteger(entry.seq) || entry.seq! < 1) {
      issues.push('Transcript contains an unsequenced entry.')
      continue
    }
    if (seenTranscriptSeqs.has(entry.seq!)) issues.push('Transcript sequence is duplicated.')
    seenTranscriptSeqs.add(entry.seq!)
  }
  const bySeq = transcriptBySeq(transcript)
  const usedPatientSeqs = new Set<number>()
  const usedObligationIds = new Set<string>()
  const validatedRecords: PatientEvidenceRecord[] = []
  let precedingSeq = 0
  for (const rawRecord of candidate.records ?? []) {
    if (!isPlainObject(rawRecord)) { issues.push('Invalid evidence record.'); continue }
    if (!hasOnlyKeys(rawRecord, ['obligationId', 'domain', 'questionText', 'assistantSeq', 'patientSeqs', 'outcome'])) {
      issues.push('Evidence record has unknown or missing fields.')
    }
    const record = rawRecord as unknown as PatientEvidenceRecord
    const obligation = obligationById.get(record.obligationId)
    if (!obligation || !domainIds.has(record.domain) || record.domain !== obligation.domain) { issues.push('Evidence record has an unknown or mismatched obligation.'); continue }
    if (usedObligationIds.has(record.obligationId)) issues.push('Evidence obligation is duplicated.')
    usedObligationIds.add(record.obligationId)
    const expected = COMPREHENSIVE_PATIENT_EVIDENCE_PLAN.find((item) =>
      isApplicable(item, validatedRecords) && !validatedRecords.some((settled) => settled.obligationId === item.id),
    )
    if (expected?.id !== record.obligationId) issues.push('Evidence record is out of order or not applicable.')
    if (record.questionText !== obligation.question && record.questionText !== obligation.clarification) issues.push('Evidence record question is not canonical.')
    if (patientEvidenceQuestionContractIssues(record.questionText).length) issues.push('Evidence record question violates the one-question contract.')
    if (!Number.isInteger(record.assistantSeq) || record.assistantSeq <= precedingSeq) issues.push('Evidence assistant sequence is invalid or out of order.')
    const assistant = bySeq.get(record.assistantSeq)
    if (!assistant || assistant.role !== 'assistant' || assistant.text !== record.questionText) issues.push('Evidence record is not bound to its exact assistant transcript question.')
    if (!Array.isArray(record.patientSeqs) || !record.patientSeqs.length) { issues.push('Evidence record has no patient sequence.'); continue }
    for (let index = 0; index < record.patientSeqs.length; index += 1) {
      const seq = record.patientSeqs[index]
      const patient = bySeq.get(seq)
      if (!Number.isInteger(seq) || !patient || patient.role !== 'user' || seq <= record.assistantSeq) issues.push('Evidence record contains forged or non-patient evidence.')
      if (index === 0 && seq !== record.assistantSeq + 1) issues.push('Patient evidence does not immediately follow its approved question.')
      if (index && seq !== record.patientSeqs[index - 1] + 1) issues.push('Evidence record patient sequences are not contiguous.')
      if (usedPatientSeqs.has(seq)) issues.push('Patient evidence sequence is reused.')
      usedPatientSeqs.add(seq)
    }
    if (!['substantive', 'negative', 'unknown', 'declined'].includes(record.outcome)) issues.push('Evidence record has an invalid outcome.')
    const responseText = record.patientSeqs.map((seq) => bySeq.get(seq)?.text ?? '').join(' ').trim()
    const derivedOutcome = classifyPatientEvidenceResponseForObligation(obligation, responseText)
    const boundedClarification =
      derivedOutcome === 'clarification' &&
      record.questionText === obligation.clarification &&
      record.outcome === 'unknown'
    if (!boundedClarification && (derivedOutcome === 'clarification' || derivedOutcome !== record.outcome)) {
      issues.push('Evidence record outcome does not match the patient transcript.')
    }
    precedingSeq = record.patientSeqs.at(-1) ?? precedingSeq
    validatedRecords.push(record)
  }

  const pendingSeqs = Array.isArray(candidate.pendingPatientSeqs) ? candidate.pendingPatientSeqs : []
  const repeat = candidate.repeatObligationId
  if (repeat !== null && repeat !== undefined) {
    const repeated = obligationById.get(repeat)
    if (!repeated || usedObligationIds.has(repeat) || !isApplicable(repeated, validatedRecords)) {
      issues.push('Repeat obligation is unknown, settled, or not applicable.')
    }
  }
  const awaiting = candidate.awaitingQuestion
  if (awaiting !== null && awaiting !== undefined) {
    if (!isPlainObject(awaiting) || !hasOnlyKeys(awaiting as unknown as Record<string, unknown>, ['obligationId', 'questionText', 'assistantSeq', 'isClarification'])) {
      issues.push('Awaiting question has unknown or missing fields.')
    }
    const obligation = obligationById.get(awaiting.obligationId)
    if (!obligation || (awaiting.questionText !== obligation.question && awaiting.questionText !== obligation.clarification)) issues.push('Awaiting question is not canonical.')
    const expected = nextObligation({
      version: PATIENT_EVIDENCE_CONTROLLER_VERSION,
      records: validatedRecords,
      awaitingQuestion: null,
      pendingPatientSeqs: [],
      repeatObligationId: repeat ?? null,
    })
    if (typeof awaiting.isClarification !== 'boolean') issues.push('Awaiting clarification marker is invalid.')
    const expectedText = awaiting.isClarification ? expected?.clarification : expected?.question
    if (!expected || awaiting.obligationId !== expected.id || awaiting.questionText !== expectedText) issues.push('Awaiting question is out of order or not applicable.')
    if (repeat != null) issues.push('Repeat obligation must be cleared when its clarification is approved.')
    if (awaiting.assistantSeq !== null) {
      const assistant = bySeq.get(awaiting.assistantSeq)
      if (!assistant || assistant.role !== 'assistant' || assistant.text !== awaiting.questionText) issues.push('Awaiting question is not bound to its exact assistant transcript question.')
      if (!Number.isInteger(awaiting.assistantSeq) || awaiting.assistantSeq <= precedingSeq) issues.push('Awaiting assistant sequence is invalid or out of order.')
      for (let index = 0; index < pendingSeqs.length; index += 1) {
        const seq = pendingSeqs[index]
        const patient = bySeq.get(seq)
        if (!Number.isInteger(seq) || !patient || patient.role !== 'user') issues.push('Pending evidence contains forged or non-patient evidence.')
        if (index === 0 && seq !== awaiting.assistantSeq + 1) issues.push('Pending patient evidence does not immediately follow its approved question.')
        if (index && seq !== pendingSeqs[index - 1] + 1) issues.push('Pending patient evidence sequences are not contiguous.')
      }
    } else if (pendingSeqs.length) {
      issues.push('Pending evidence exists before the approved question was committed.')
    }
  } else if (pendingSeqs.length) {
    issues.push('Pending patient evidence has no awaiting question.')
  }
  if (repeat != null && pendingSeqs.length) issues.push('A repeat obligation cannot retain pending evidence.')
  return { valid: issues.length === 0, issues }
}
