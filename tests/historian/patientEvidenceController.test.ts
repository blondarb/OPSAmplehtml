import { describe, expect, it } from 'vitest'

import {
  COMPREHENSIVE_PATIENT_EVIDENCE_PLAN,
  approveNextPatientEvidenceQuestion,
  classifyPatientEvidenceResponse,
  collectPatientEvidenceEntry,
  commitApprovedPatientEvidenceQuestion,
  createPatientEvidenceState,
  derivePatientEvidenceCoverage,
  patientEvidenceCompletion,
  patientEvidenceQuestionContractIssues,
  patientEvidenceAnswerRequiresSafetyEscalation,
  settlePatientEvidenceAnswer,
  validatePatientEvidenceState,
  type PatientEvidenceState,
} from '@/lib/historian/patientEvidenceController'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'
import { syntheticPatientAnswer } from './patientEvidenceFixtures'

const entry = (role: HistorianTranscriptEntry['role'], seq: number, text: string): HistorianTranscriptEntry => ({ role, seq, text, timestamp: seq })

const OPENING_QUESTION = "Hi, I'm Henry, and I'll help gather your history before your neurology visit. What brought you to be referred for this visit?"

function firstCommitted(questionText = OPENING_QUESTION) {
  const approved = approveNextPatientEvidenceQuestion(createPatientEvidenceState())
  expect(approved.ok).toBe(true)
  return commitApprovedPatientEvidenceQuestion(approved.value!.state, 1, questionText).value!
}

function settleWholePlan(
  firstAnswer?: string,
  mode: 'baseline' | 'maximal' = 'baseline',
  answerOverride?: (obligationId: string) => string | undefined,
) {
  let state = createPatientEvidenceState()
  const transcript: HistorianTranscriptEntry[] = []
  let seq = 1
  while (patientEvidenceCompletion(state) === 'incomplete') {
    const approved = approveNextPatientEvidenceQuestion(state)
    expect(approved.ok).toBe(true)
    state = commitApprovedPatientEvidenceQuestion(approved.value!.state, seq, approved.value!.questionText).value!
    transcript.push(entry('assistant', seq, approved.value!.questionText))
    seq += 1
    const answer = transcript.length === 1 && firstAnswer !== undefined
      ? firstAnswer
      : answerOverride?.(approved.value!.obligation.id) ??
        syntheticPatientAnswer(approved.value!.obligation.id, mode)
    transcript.push(entry('user', seq, answer))
    state = collectPatientEvidenceEntry(state, transcript.at(-1)!).value!
    state = settlePatientEvidenceAnswer(state, transcript).value!
    seq += 1
  }
  return { state, transcript }
}

describe('patient evidence controller', () => {
  it('keeps every primary and clarification prompt atomic and example-free', () => {
    expect(COMPREHENSIVE_PATIENT_EVIDENCE_PLAN).toHaveLength(59)
    for (const obligation of COMPREHENSIVE_PATIENT_EVIDENCE_PLAN) {
      expect(patientEvidenceQuestionContractIssues(obligation.question), obligation.id).toEqual([])
      expect(patientEvidenceQuestionContractIssues(obligation.clarification), `${obligation.id}:clarification`).toEqual([])
    }
  })

  it('approves and commits only the exact canonical next question', () => {
    const approved = approveNextPatientEvidenceQuestion(createPatientEvidenceState())
    expect(approved.value?.questionText).toBe(OPENING_QUESTION)
    expect(commitApprovedPatientEvidenceQuestion(approved.value!.state, 1, 'What brought you to be referred?')).toMatchObject({ ok: false })
    expect(commitApprovedPatientEvidenceQuestion(approved.value!.state, 1, approved.value!.questionText).value?.awaitingQuestion?.assistantSeq).toBe(1)
  })

  it('collects only contiguous patient sequences after the committed question', () => {
    const state = firstCommitted()
    const one = collectPatientEvidenceEntry(state, entry('user', 2, 'My doctor referred me for headaches.'))
    expect(one.ok).toBe(true)
    expect(collectPatientEvidenceEntry(one.value!, entry('user', 4, 'More detail.'))).toMatchObject({ ok: false })
    expect(collectPatientEvidenceEntry(one.value!, entry('assistant', 3, 'No.'))).toMatchObject({ ok: false })
  })

  it('does not credit a bare acknowledgement or patient question as an open-history answer', () => {
    for (const nonAnswer of ['Yes.', 'No.', 'What do you think is causing it?']) {
      let state = firstCommitted()
      const transcript = [entry('assistant', 1, OPENING_QUESTION), entry('user', 2, nonAnswer)]
      state = collectPatientEvidenceEntry(state, transcript[1]).value!
      state = settlePatientEvidenceAnswer(state, transcript).value!
      expect(state.records, nonAnswer).toHaveLength(0)
      expect(state.repeatObligationId, nonAnswer).toBe('referral_reason')
    }
  })

  it('does not credit a narrow clarification and re-asks the same obligation with its canonical clarification', () => {
    let state = firstCommitted()
    state = collectPatientEvidenceEntry(state, entry('user', 2, 'What do you mean?')).value!
    state = settlePatientEvidenceAnswer(state, [entry('assistant', 1, OPENING_QUESTION), entry('user', 2, 'What do you mean?')]).value!
    expect(state.records).toHaveLength(0)
    const retry = approveNextPatientEvidenceQuestion(state)
    expect(retry.value?.questionText).toBe('What is the main concern that led to this referral?')
    expect(validatePatientEvidenceState(retry.value!.state, [
      entry('assistant', 1, OPENING_QUESTION),
      entry('user', 2, 'What do you mean?'),
    ])).toEqual({ valid: true, issues: [] })

    state = commitApprovedPatientEvidenceQuestion(
      retry.value!.state,
      3,
      retry.value!.questionText,
    ).value!
    state = collectPatientEvidenceEntry(state, entry('user', 4, 'Headaches brought me here.')).value!
    state = settlePatientEvidenceAnswer(state, [
      entry('assistant', 1, OPENING_QUESTION),
      entry('user', 2, 'What do you mean?'),
      entry('assistant', 3, retry.value!.questionText),
      entry('user', 4, 'Headaches brought me here.'),
    ]).value!
    expect(validatePatientEvidenceState(state, [
      entry('assistant', 1, OPENING_QUESTION),
      entry('user', 2, 'What do you mean?'),
      entry('assistant', 3, retry.value!.questionText),
      entry('user', 4, 'Headaches brought me here.'),
    ])).toEqual({ valid: true, issues: [] })

    const secondClarification = collectPatientEvidenceEntry(
      commitApprovedPatientEvidenceQuestion(
        retry.value!.state,
        3,
        retry.value!.questionText,
      ).value!,
      entry('user', 4, 'Could you say that again?'),
    ).value!
    const bounded = settlePatientEvidenceAnswer(secondClarification, [
      entry('assistant', 1, OPENING_QUESTION),
      entry('user', 2, 'What do you mean?'),
      entry('assistant', 3, retry.value!.questionText),
      entry('user', 4, 'Could you say that again?'),
    ]).value!
    expect(bounded.records.at(-1)?.outcome).toBe('unknown')
    expect(bounded.repeatObligationId).toBeNull()
    expect(validatePatientEvidenceState(bounded, [
      entry('assistant', 1, OPENING_QUESTION),
      entry('user', 2, 'What do you mean?'),
      entry('assistant', 3, retry.value!.questionText),
      entry('user', 4, 'Could you say that again?'),
    ])).toEqual({ valid: true, issues: [] })
  })

  it('classifies declined, unknown, negative, and substantive patient answers', () => {
    expect(classifyPatientEvidenceResponse('I prefer not to say.')).toBe('declined')
    expect(classifyPatientEvidenceResponse("I don't know.")).toBe('unknown')
    expect(classifyPatientEvidenceResponse('None.')).toBe('negative')
    expect(classifyPatientEvidenceResponse("I don't have any allergies.")).toBe('negative')
    expect(classifyPatientEvidenceResponse('Could you give me an example?')).toBe('clarification')
    expect(classifyPatientEvidenceResponse('It began after dinner last Tuesday.')).toBe('substantive')
    expect(classifyPatientEvidenceResponse('No prescriptions, only aspirin.')).toBe('substantive')
    expect(classifyPatientEvidenceResponse('No allergies except penicillin.')).toBe('substantive')
  })

  it('preserves qualified medication, allergy, and prior-study details and asks their follow-ups', () => {
    const answers: Partial<Record<string, string>> = {
      medications: 'No prescriptions, only aspirin.',
      allergies: 'No allergies except penicillin.',
      prior_studies: 'No other tests, just a brain scan.',
    }
    const qualified = settleWholePlan(
      undefined,
      'baseline',
      (obligationId) => answers[obligationId],
    )
    const records = new Map(qualified.state.records.map((record) => [record.obligationId, record]))

    expect(records.get('medications')?.outcome).toBe('substantive')
    expect(records.has('medication_doses')).toBe(true)
    expect(records.has('medication_adherence')).toBe(true)
    expect(records.get('allergies')?.outcome).toBe('substantive')
    expect(records.has('allergy_reactions')).toBe(true)
    expect(records.get('prior_studies')?.outcome).toBe('substantive')
    expect(records.has('prior_study_results')).toBe(true)
  })

  it('treats a direct affirmative answer to the active red-flag question as contextual safety', () => {
    let state = createPatientEvidenceState()
    while (state.awaitingQuestion?.obligationId !== 'red_flags') {
      const approved = approveNextPatientEvidenceQuestion(state).value!
      state = approved.state
      if (state.awaitingQuestion?.obligationId === 'red_flags') break
      state = commitApprovedPatientEvidenceQuestion(state, 1, approved.questionText).value!
      const answer = syntheticPatientAnswer(approved.obligation.id)
      state = collectPatientEvidenceEntry(state, entry('user', 2, answer)).value!
      state = settlePatientEvidenceAnswer(state, [
        entry('assistant', 1, approved.questionText),
        entry('user', 2, answer),
      ]).value!
    }
    state = commitApprovedPatientEvidenceQuestion(
      state,
      3,
      state.awaitingQuestion!.questionText,
    ).value!
    expect(patientEvidenceAnswerRequiresSafetyEscalation(state, 'Yes.')).toBe(true)
    expect(patientEvidenceAnswerRequiresSafetyEscalation(state, 'Sure.')).toBe(true)
    expect(patientEvidenceAnswerRequiresSafetyEscalation(state, 'Yes, and I want to stop.')).toBe(true)
    expect(patientEvidenceAnswerRequiresSafetyEscalation(
      state,
      'No, but I cannot move my arm right now.',
    )).toBe(true)
    expect(patientEvidenceAnswerRequiresSafetyEscalation(
      state,
      'Yes, I can no longer move my arm.',
    )).toBe(true)
    expect(patientEvidenceAnswerRequiresSafetyEscalation(
      state,
      "Yes, I'm not experiencing vision in my left eye.",
    )).toBe(true)
    expect(patientEvidenceAnswerRequiresSafetyEscalation(
      state,
      'Yes, I can no longer feel this arm.',
    )).toBe(true)
    expect(patientEvidenceAnswerRequiresSafetyEscalation(
      state,
      'No, just a mild old headache.',
    )).toBe(false)
    expect(patientEvidenceAnswerRequiresSafetyEscalation(
      state,
      'No, but thanks for asking.',
    )).toBe(false)
    expect(patientEvidenceAnswerRequiresSafetyEscalation(
      state,
      'Yes, but not right now.',
    )).toBe(false)
    expect(patientEvidenceAnswerRequiresSafetyEscalation(
      state,
      'I am not experiencing that.',
    )).toBe(false)
    expect(patientEvidenceAnswerRequiresSafetyEscalation(state, 'I am okay.')).toBe(false)
    expect(patientEvidenceAnswerRequiresSafetyEscalation(state, 'It is mild.')).toBe(false)
    expect(patientEvidenceAnswerRequiresSafetyEscalation(
      state,
      'Yes, I no longer have that symptom.',
    )).toBe(false)
    expect(patientEvidenceAnswerRequiresSafetyEscalation(state, 'No, not right now.')).toBe(false)
    expect(patientEvidenceAnswerRequiresSafetyEscalation(state, 'What do you mean?')).toBe(false)
  })

  it('rejects forged assistant-supplied evidence and noncanonical questions', () => {
    const state: PatientEvidenceState = {
      ...createPatientEvidenceState(),
      records: [{ obligationId: 'referral_reason', domain: 'referral_reason', questionText: OPENING_QUESTION, assistantSeq: 1, patientSeqs: [2], outcome: 'substantive' }],
    }
    const forged = [entry('assistant', 1, OPENING_QUESTION), entry('assistant', 2, 'I have a headache.')]
    expect(validatePatientEvidenceState(state, forged).valid).toBe(false)
    const noncanonical = [entry('assistant', 1, 'Different question?'), entry('user', 2, 'I have a headache.')]
    expect(validatePatientEvidenceState(state, noncanonical).valid).toBe(false)
  })

  it('derives incomplete coverage until every applicable obligation has patient evidence', () => {
    const state = firstCommitted()
    expect(patientEvidenceCompletion(state)).toBe('incomplete')
    expect(derivePatientEvidenceCoverage(state).find((item) => item.domain === 'referral_reason')?.status).toBe('incomplete')
    expect(derivePatientEvidenceCoverage(state).find((item) => item.domain === 'medication_adherence_side_effects')?.status).toBe('incomplete')
  })

  it('distinguishes fully settled negative coverage from a patient-visible uncertainty', () => {
    const negative = settleWholePlan()
    expect(patientEvidenceCompletion(negative.state)).toBe('coverage_complete')
    expect(negative.state.records).toHaveLength(51)
    const uncertain = settleWholePlan("I don't know.")
    expect(patientEvidenceCompletion(uncertain.state)).toBe('complete_with_uncertainty')
    expect(derivePatientEvidenceCoverage(uncertain.state).find((item) => item.domain === 'referral_reason')?.status).toBe('uncertain')
  })

  it('closes every positive conditional follow-up below the 60-exchange ceiling', () => {
    const positive = settleWholePlan(undefined, 'maximal')
    expect(patientEvidenceCompletion(positive.state)).toBe('coverage_complete')
    expect(positive.state.records).toHaveLength(59)
    expect(positive.state.records.map((record) => record.obligationId)).toEqual(
      COMPREHENSIVE_PATIENT_EVIDENCE_PLAN.map((item) => item.id),
    )
  })

  it('rejects unknown closed obligation identifiers', () => {
    const state = {
      ...createPatientEvidenceState(),
      records: [{ obligationId: 'made_up', domain: 'referral_reason', questionText: 'Nope', assistantSeq: 1, patientSeqs: [2], outcome: 'substantive' }],
    } as unknown as PatientEvidenceState
    expect(validatePatientEvidenceState(state, [entry('assistant', 1, 'Nope'), entry('user', 2, 'Answer')]).valid).toBe(false)
  })

  it('rejects an out-of-order conditional record and a forged outcome', () => {
    const transcript = [
      entry('assistant', 1, 'What dose do you take for each medication?'),
      entry('user', 2, 'None.'),
    ]
    const state: PatientEvidenceState = {
      ...createPatientEvidenceState(),
      records: [{
        obligationId: 'medication_doses',
        domain: 'medications',
        questionText: 'What dose do you take for each medication?',
        assistantSeq: 1,
        patientSeqs: [2],
        outcome: 'substantive',
      }],
    }
    const result = validatePatientEvidenceState(state, transcript)
    expect(result.valid).toBe(false)
    expect(result.issues).toContain('Evidence record is out of order or not applicable.')
    expect(result.issues).toContain('Evidence record outcome does not match the patient transcript.')
  })

  it('strictly rejects unknown ledger fields', () => {
    const forged = { ...createPatientEvidenceState(), model_claimed_complete: true }
    expect(validatePatientEvidenceState(forged, [])).toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['Evidence state has unknown or missing fields.']),
    })
  })
})
