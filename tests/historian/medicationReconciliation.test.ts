import { describe, expect, it } from 'vitest'

import type { HistorianTranscriptEntry } from '@/lib/historianTypes'
import type { LiveReviewMedicationMention } from '@/lib/historian/liveReviewContract'
import {
  MEDICATION_INVENTORY_QUESTION,
  approveMedicationQuestion,
  commitMedicationQuestion,
  completionWithMedicationUncertainty,
  confirmedMedicationSummary,
  createMedicationReconciliationState,
  medicationReconciliationClosed,
  medicationReconciliationHasUncertainty,
  medicationReconciliationMatchesReview,
  medicationReconciliationTranscriptIsValid,
  medicationReconciliationUnresolvedCount,
  nextMedicationQuestion,
  parseMedicationReconciliationState,
  recordMedicationAnswer,
  syncMedicationReview,
} from '@/lib/historian/medicationReconciliation'

function missingMedication(
  nameSpan: string,
  patientSeq: number,
): LiveReviewMedicationMention {
  return {
    nameSpan,
    patientSeq,
    dose: { status: 'missing', valueSpan: null, patientSeqs: [] },
    frequency: { status: 'missing', valueSpan: null, patientSeqs: [] },
  }
}

function appendQuestionAndAnswer(
  transcript: HistorianTranscriptEntry[],
  questionText: string,
  answerText: string,
): { assistantSeq: number; patientSeq: number } {
  const assistantSeq = transcript.length + 1
  transcript.push({ role: 'assistant', text: questionText, seq: assistantSeq, timestamp: assistantSeq })
  const patientSeq = assistantSeq + 1
  transcript.push({ role: 'user', text: answerText, seq: patientSeq, timestamp: patientSeq })
  return { assistantSeq, patientSeq }
}

describe('transcript-bound medication reconciliation', () => {
  it('confirms ibuprofen and Tylenol, then requires amount and schedule for both', () => {
    const transcript: HistorianTranscriptEntry[] = [
      { role: 'assistant', text: 'What medicines do you take?', seq: 1, timestamp: 1 },
      { role: 'user', text: 'I take ibuprofen and Tylenol.', seq: 2, timestamp: 2 },
    ]
    let mentions: LiveReviewMedicationMention[] = [
      missingMedication('ibuprofen', 2),
      missingMedication('Tylenol', 2),
    ]
    let state = syncMedicationReview(createMedicationReconciliationState(), mentions)

    for (const expectedName of ['ibuprofen', 'Tylenol']) {
      const confirmation = nextMedicationQuestion(state, { includeInventory: false })!
      expect(confirmation.kind).toBe('med_name_confirmation')
      expect(confirmation.questionText).toContain(`“${expectedName}”`)
      state = approveMedicationQuestion(state, confirmation)
      const turn = appendQuestionAndAnswer(transcript, confirmation.questionText, "Yes, that's correct.")
      state = commitMedicationQuestion(
        state,
        confirmation.obligationId,
        turn.assistantSeq,
        confirmation.questionText,
      )
      state = recordMedicationAnswer(state, turn.patientSeq, "Yes, that's correct.")
    }

    const ibuprofenQuestion = nextMedicationQuestion(state, { includeInventory: false })!
    expect(ibuprofenQuestion).toMatchObject({ kind: 'med_dose_and_frequency' })
    expect(ibuprofenQuestion.questionText).toContain('“ibuprofen”')
    state = approveMedicationQuestion(state, ibuprofenQuestion)
    let turn = appendQuestionAndAnswer(
      transcript,
      ibuprofenQuestion.questionText,
      'I take 400 mg twice a week.',
    )
    state = commitMedicationQuestion(
      state,
      ibuprofenQuestion.obligationId,
      turn.assistantSeq,
      ibuprofenQuestion.questionText,
    )
    state = recordMedicationAnswer(state, turn.patientSeq, 'I take 400 mg twice a week.')
    mentions = [
      {
        ...missingMedication('ibuprofen', 2),
        dose: { status: 'known', valueSpan: '400 mg', patientSeqs: [turn.patientSeq] },
        frequency: { status: 'known', valueSpan: 'twice a week', patientSeqs: [turn.patientSeq] },
      },
      missingMedication('Tylenol', 2),
    ]
    state = syncMedicationReview(state, mentions)

    const tylenolQuestion = nextMedicationQuestion(state, { includeInventory: false })!
    expect(tylenolQuestion.questionText).toContain('“Tylenol”')
    state = approveMedicationQuestion(state, tylenolQuestion)
    turn = appendQuestionAndAnswer(
      transcript,
      tylenolQuestion.questionText,
      'I take 500 mg once or twice a month.',
    )
    state = commitMedicationQuestion(
      state,
      tylenolQuestion.obligationId,
      turn.assistantSeq,
      tylenolQuestion.questionText,
    )
    state = recordMedicationAnswer(state, turn.patientSeq, 'I take 500 mg once or twice a month.')
    mentions = [
      mentions[0],
      {
        ...missingMedication('Tylenol', 2),
        dose: { status: 'known', valueSpan: '500 mg', patientSeqs: [turn.patientSeq] },
        frequency: {
          status: 'known',
          valueSpan: 'once or twice a month',
          patientSeqs: [turn.patientSeq],
        },
      },
    ]
    state = syncMedicationReview(state, mentions)

    const inventory = nextMedicationQuestion(state, { includeInventory: true })!
    expect(inventory.questionText).toBe(MEDICATION_INVENTORY_QUESTION)
    state = approveMedicationQuestion(state, inventory)
    turn = appendQuestionAndAnswer(transcript, inventory.questionText, 'No other medicines.')
    state = commitMedicationQuestion(
      state,
      inventory.obligationId,
      turn.assistantSeq,
      inventory.questionText,
    )
    state = recordMedicationAnswer(state, turn.patientSeq, 'No other medicines.')

    expect(state.medicationNameClarificationCount).toBe(2)
    expect(state.clinicalMedicationQuestionCount).toBe(3)
    expect(medicationReconciliationClosed(state)).toBe(true)
    expect(medicationReconciliationTranscriptIsValid(state, transcript)).toBe(true)
    expect(medicationReconciliationMatchesReview(state, mentions)).toBe(true)
    expect(confirmedMedicationSummary(state)).toContain(
      'ibuprofen — amount: 400 mg; schedule: twice a week',
    )
    expect(confirmedMedicationSummary(state)).toContain(
      'Tylenol — amount: 500 mg; schedule: once or twice a month',
    )
    expect(parseMedicationReconciliationState(state, transcript)).toEqual(state)
  })

  it('never substitutes trazodone for a patient correction to tirzepatide', () => {
    const transcript: HistorianTranscriptEntry[] = [
      { role: 'assistant', text: 'What medicines do you take?', seq: 1, timestamp: 1 },
      { role: 'user', text: 'I take trazodone.', seq: 2, timestamp: 2 },
    ]
    let state = syncMedicationReview(
      createMedicationReconciliationState(),
      [missingMedication('trazodone', 2)],
    )
    const mistakenName = nextMedicationQuestion(state, { includeInventory: false })!
    state = approveMedicationQuestion(state, mistakenName)
    let turn = appendQuestionAndAnswer(transcript, mistakenName.questionText, 'No, tirzepatide.')
    state = commitMedicationQuestion(
      state,
      mistakenName.obligationId,
      turn.assistantSeq,
      mistakenName.questionText,
    )
    state = recordMedicationAnswer(state, turn.patientSeq, 'No, tirzepatide.')
    state = syncMedicationReview(state, [
      missingMedication('trazodone', 2),
      missingMedication('tirzepatide', turn.patientSeq),
    ])

    const correctedName = nextMedicationQuestion(state, { includeInventory: false })!
    expect(correctedName.questionText).toContain('“tirzepatide”')
    state = approveMedicationQuestion(state, correctedName)
    turn = appendQuestionAndAnswer(transcript, correctedName.questionText, "Yes, that's right.")
    state = commitMedicationQuestion(
      state,
      correctedName.obligationId,
      turn.assistantSeq,
      correctedName.questionText,
    )
    state = recordMedicationAnswer(state, turn.patientSeq, "Yes, that's right.")

    expect(state.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ heardName: 'trazodone', nameStatus: 'uncertain' }),
      expect.objectContaining({ heardName: 'tirzepatide', nameStatus: 'confirmed' }),
    ]))
    expect(state.medicationNameClarificationCount).toBe(2)
    expect(state.clinicalMedicationQuestionCount).toBe(0)
    expect(nextMedicationQuestion(state, { includeInventory: false })?.questionText)
      .toContain('“tirzepatide”')
  })

  it('rejects browser-tampered counters and uncited medication values', () => {
    const transcript: HistorianTranscriptEntry[] = [
      { role: 'assistant', text: MEDICATION_INVENTORY_QUESTION, seq: 1, timestamp: 1 },
      { role: 'user', text: 'No medicines.', seq: 2, timestamp: 2 },
    ]
    const state = {
      ...createMedicationReconciliationState(),
      inventoryStatus: 'answered' as const,
      inventoryPatientSeq: 2,
      clinicalMedicationQuestionCount: 1,
    }
    expect(medicationReconciliationTranscriptIsValid(state, transcript)).toBe(true)
    expect(() => parseMedicationReconciliationState({
      ...state,
      clinicalMedicationQuestionCount: 0,
    }, transcript)).not.toThrow()
    expect(medicationReconciliationTranscriptIsValid({
      ...state,
      clinicalMedicationQuestionCount: 0,
    }, transcript)).toBe(false)

    const tampered = {
      ...state,
      items: [{
        id: 'med-2-ibuprofen',
        heardName: 'ibuprofen',
        sourcePatientSeq: 2,
        nameStatus: 'confirmed',
        nameConfirmationAttempts: 1,
        dose: { status: 'known', value: '400 mg', patientSeqs: [], attempts: 0 },
        frequency: { status: 'known', value: 'daily', patientSeqs: [], attempts: 0 },
      }],
    }
    expect(() => parseMedicationReconciliationState(tampered, transcript)).toThrow()
  })

  it('never binds symptom frequency from an unrelated patient turn to a medication', () => {
    const state = syncMedicationReview(
      createMedicationReconciliationState(),
      [missingMedication('ibuprofen', 2)],
    )
    const reviewed = syncMedicationReview(state, [{
      ...missingMedication('ibuprofen', 2),
      frequency: {
        status: 'known',
        valueSpan: 'twice a week',
        patientSeqs: [4],
      },
    }])

    expect(reviewed.items[0].frequency).toEqual({
      status: 'missing',
      value: null,
      patientSeqs: [],
      attempts: 0,
    })
  })

  it('turns conflicting medication-context values into a required clarification', () => {
    let state = syncMedicationReview(createMedicationReconciliationState(), [{
      ...missingMedication('ibuprofen', 2),
      dose: { status: 'known', valueSpan: '400 mg', patientSeqs: [2] },
      frequency: { status: 'known', valueSpan: 'daily', patientSeqs: [2] },
    }])
    state.items[0].nameStatus = 'confirmed'
    state.items[0].nameConfirmationAttempts = 1

    state = syncMedicationReview(state, [{
      ...missingMedication('ibuprofen', 4),
      dose: { status: 'known', valueSpan: '400 mg', patientSeqs: [4] },
      frequency: { status: 'known', valueSpan: 'twice weekly', patientSeqs: [4] },
    }])

    expect(state.items[0].frequency).toMatchObject({
      status: 'uncertain',
      value: null,
      attempts: 0,
    })
    expect(nextMedicationQuestion(state, { includeInventory: false })).toMatchObject({
      kind: 'med_frequency',
    })
    expect(medicationReconciliationClosed({
      ...state,
      inventoryStatus: 'answered',
      inventoryPatientSeq: 6,
    })).toBe(false)
  })

  it('does not let fabricated uncertainty close medication reconciliation', () => {
    const unearnedName = {
      ...createMedicationReconciliationState(),
      inventoryStatus: 'answered' as const,
      inventoryPatientSeq: 2,
      items: [{
        id: 'med-2-ibuprofen',
        heardName: 'ibuprofen',
        sourcePatientSeq: 2,
        nameStatus: 'uncertain' as const,
        nameConfirmationAttempts: 0,
        dose: { status: 'missing' as const, value: null, patientSeqs: [], attempts: 0 },
        frequency: { status: 'missing' as const, value: null, patientSeqs: [], attempts: 0 },
      }],
    }
    expect(medicationReconciliationClosed(unearnedName)).toBe(false)

    const unearnedValues = {
      ...unearnedName,
      items: [{
        ...unearnedName.items[0],
        nameStatus: 'confirmed' as const,
        nameConfirmationAttempts: 1,
        dose: { status: 'uncertain' as const, value: null, patientSeqs: [], attempts: 0 },
        frequency: { status: 'uncertain' as const, value: null, patientSeqs: [], attempts: 0 },
      }],
    }
    expect(medicationReconciliationClosed(unearnedValues)).toBe(false)
  })

  it('makes otherwise complete coverage explicitly uncertain when medication data is unresolved', () => {
    const state = {
      ...createMedicationReconciliationState(),
      inventoryStatus: 'answered' as const,
      inventoryPatientSeq: 2,
      items: [{
        id: 'med-2-unclear',
        heardName: 'unclear',
        sourcePatientSeq: 2,
        nameStatus: 'uncertain' as const,
        nameConfirmationAttempts: 1,
        dose: { status: 'missing' as const, value: null, patientSeqs: [], attempts: 0 },
        frequency: { status: 'missing' as const, value: null, patientSeqs: [], attempts: 0 },
      }],
    }

    expect(medicationReconciliationHasUncertainty(state)).toBe(true)
    expect(medicationReconciliationUnresolvedCount(state)).toBe(1)
    expect(completionWithMedicationUncertainty('coverage_complete', state))
      .toBe('complete_with_uncertainty')
    expect(completionWithMedicationUncertainty('incomplete', state)).toBe('incomplete')
  })
})
