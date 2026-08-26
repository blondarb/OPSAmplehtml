import { describe, expect, it } from 'vitest'

import {
  APPROVED_HISTORIAN_CLOSING_TEXT,
  HistorianTurnQuarantine,
  PRODUCTION_TURN_CONFIRMATION_TIMEOUT_MS,
  canonicalSpokenText,
  countResponseRequests,
  parseApprovedHistorianTurn,
  validateTurnText,
} from '../turnAdmission.js'

const APPROVAL = {
  obligationId: 'presenting_symptom_onset',
  approvedText: 'When did the main problem first begin?',
  allowExample: false,
}

describe('Historian assistant turn admission', () => {
  it('allows a bounded provider-finalization window longer than normal mobile startup latency', () => {
    expect(PRODUCTION_TURN_CONFIRMATION_TIMEOUT_MS).toBe(30_000)
  })

  it('releases exact approved text and its quarantined audio together', () => {
    const gate = new HistorianTurnQuarantine(1_000)
    expect(gate.approveQuestion(APPROVAL)).toBe(true)
    gate.bufferText('WHEN DID THE MAIN PROBLEM FIRST BEGIN!')
    gate.bufferFinalText(APPROVAL.approvedText)
    expect(gate.bufferAudio('AAAA')).toBe(true)
    expect(gate.bufferAudio('BBBB')).toBe(true)
    expect(gate.finalize()).toEqual({
      allowed: true,
      text: APPROVAL.approvedText,
      audio: ['AAAA', 'BBBB'],
      obligationId: APPROVAL.obligationId,
      mode: 'approved_question',
    })
  })

  it('starts adaptive streaming only after the full speculative question exactly matches approval', () => {
    const gate = new HistorianTurnQuarantine(1_000)
    expect(gate.approveQuestion(APPROVAL)).toBe(true)
    gate.bufferText('When did the main problem')
    expect(gate.beginApprovedQuestionStreaming()).toEqual({
      allowed: false,
      reason: 'approved_stream_waiting_for_more_text',
      waitForMoreText: true,
    })

    const ready = new HistorianTurnQuarantine(1_000)
    ready.approveQuestion(APPROVAL)
    ready.bufferText(APPROVAL.approvedText)
    expect(ready.beginApprovedQuestionStreaming()).toEqual({
      allowed: true,
      text: APPROVAL.approvedText,
      obligationId: APPROVAL.obligationId,
      mode: 'approved_question',
      bufferedAudio: [],
    })
    expect(ready.observeStreamedAudio('AAAA')).toBe(true)
    ready.bufferFinalText(APPROVAL.approvedText)
    expect(ready.finalize()).toEqual({
      allowed: true,
      text: APPROVAL.approvedText,
      audio: [],
      obligationId: APPROVAL.obligationId,
      mode: 'approved_question',
      alreadyReleased: true,
    })
  })

  it('holds audio for an exact approved sentence prefix until the full question arrives', () => {
    const gate = new HistorianTurnQuarantine(1_000)
    const approval = {
      obligationId: 'opening',
      approvedText: "Hi, I'm Henry, an AI assistant helping collect your history for your neurologist. What would you most like your neurologist to understand about why you were referred?",
      allowExample: false,
    }
    gate.approveQuestion(approval)
    gate.bufferText("Hi, I'm Henry, an AI assistant helping collect your history for your neurologist.")
    expect(gate.beginApprovedQuestionStreaming()).toEqual({
      allowed: false,
      reason: 'approved_stream_waiting_for_more_text',
      waitForMoreText: true,
    })
    expect(gate.bufferApprovedQuestionPrefixAudio('INTRO_PCM')).toBe(true)

    gate.bufferText('What would you most like your neurologist to understand about why you were referred?')
    expect(gate.beginApprovedQuestionStreaming()).toEqual({
      allowed: true,
      text: approval.approvedText,
      obligationId: approval.obligationId,
      mode: 'approved_question',
      bufferedAudio: ['INTRO_PCM'],
    })
    expect(gate.observeStreamedAudio('QUESTION_PCM')).toBe(true)
    gate.bufferFinalText("Hi, I'm Henry, an AI assistant helping collect your history for your neurologist.")
    gate.bufferFinalText('What would you most like your neurologist to understand about why you were referred?')
    expect(gate.finalize()).toEqual({
      allowed: true,
      text: approval.approvedText,
      audio: [],
      obligationId: approval.obligationId,
      mode: 'approved_question',
      alreadyReleased: true,
    })
  })

  it('never admits a full approved question using only prefix audio', () => {
    const gate = new HistorianTurnQuarantine(1_000)
    const approval = {
      obligationId: 'opening',
      approvedText: 'I am Henry. What brought you to neurology?',
      allowExample: false,
    }
    gate.approveQuestion(approval)
    gate.bufferText('I am Henry.')
    expect(gate.beginApprovedQuestionStreaming()).toMatchObject({
      allowed: false,
      waitForMoreText: true,
    })
    expect(gate.bufferApprovedQuestionPrefixAudio('INTRO_ONLY_PCM')).toBe(true)
    gate.bufferText('What brought you to neurology?')
    gate.bufferFinalText('I am Henry.')
    gate.bufferFinalText('What brought you to neurology?')
    expect(gate.finalize()).toEqual({
      allowed: false,
      reason: 'approved_question_audio_incomplete',
    })
  })

  it('rejects a spoken prefix that is not an exact word-boundary prefix of approval', () => {
    const gate = new HistorianTurnQuarantine(1_000)
    gate.approveQuestion(APPROVAL)
    gate.bufferText('When did a different problem')
    expect(gate.beginApprovedQuestionStreaming()).toEqual({
      allowed: false,
      reason: 'approved_text_mismatch',
    })
  })

  it('rejects any extra speculative block after adaptive streaming begins', () => {
    const gate = new HistorianTurnQuarantine(1_000)
    gate.approveQuestion(APPROVAL)
    expect(gate.bufferText(APPROVAL.approvedText)).toBe(true)
    expect(gate.beginApprovedQuestionStreaming()).toMatchObject({ allowed: true })
    expect(gate.bufferText('What else happened?')).toBe(false)
  })

  it('requires every speculative sentence block to receive its matching FINAL block', () => {
    const gate = new HistorianTurnQuarantine(1_000)
    const approval = {
      obligationId: 'onset',
      approvedText: 'I will ask one question. When did the symptom begin?',
      allowExample: false,
    }
    gate.approveQuestion(approval)
    gate.bufferText('I will ask one question.')
    gate.bufferText('When did the symptom begin?')
    gate.bufferAudio('AAAA')
    gate.bufferFinalText('I will ask one question.')
    expect(gate.hasConfirmedTextMatch()).toBe(false)
    gate.bufferFinalText('When did the symptom begin?')
    expect(gate.hasConfirmedTextMatch()).toBe(true)
    expect(gate.finalize()).toMatchObject({
      allowed: true,
      text: approval.approvedText,
      obligationId: approval.obligationId,
    })
  })

  it('rejects question, unsolicited example, then a second question with zero release', () => {
    const gate = new HistorianTurnQuarantine(1_000)
    gate.approveQuestion(APPROVAL)
    gate.bufferText(
      'When did it begin? For example, was it last week? How has it changed?',
    )
    gate.bufferFinalText(
      'When did it begin? For example, was it last week? How has it changed?',
    )
    gate.bufferAudio('SHOULD_NOT_RELEASE')
    expect(gate.finalize()).toEqual({ allowed: false, reason: 'approved_text_mismatch' })
  })

  it('rejects a compound single-punctuation question as two obligations', () => {
    expect(countResponseRequests('When did it start and how has it changed?')).toBeGreaterThan(1)
    expect(validateTurnText({
      text: 'When did it start and how has it changed?',
      mode: 'approved_question',
      approval: {
        obligationId: 'bad',
        approvedText: 'When did it start and how has it changed?',
        allowExample: false,
      },
    })).toEqual({ valid: false, reason: 'normal_turn_must_have_one_request' })
  })

  it('allows punctuation variation but no added or removed words', () => {
    expect(canonicalSpokenText('HOW old are you?')).toBe(canonicalSpokenText('How old are you.'))
    expect(validateTurnText({
      text: 'HOW old are you?',
      mode: 'approved_question',
      approval: { obligationId: 'age', approvedText: 'How old are you?', allowExample: false },
    })).toEqual({ valid: true, obligationId: 'age' })
    expect(validateTurnText({
      text: 'So, how old are you?',
      mode: 'approved_question',
      approval: { obligationId: 'age', approvedText: 'How old are you?', allowExample: false },
    })).toEqual({ valid: false, reason: 'approved_text_mismatch' })
  })

  it('requires authorization, text, and audio before release', () => {
    const unauthorised = new HistorianTurnQuarantine(1_000)
    unauthorised.bufferText('How old are you?')
    unauthorised.bufferFinalText('How old are you?')
    unauthorised.bufferAudio('AAAA')
    expect(unauthorised.finalize()).toEqual({ allowed: false, reason: 'turn_not_authorized' })

    const silent = new HistorianTurnQuarantine(1_000)
    silent.approveQuestion({ obligationId: 'age', approvedText: 'How old are you?', allowExample: false })
    silent.bufferText('How old are you?')
    silent.bufferFinalText('How old are you?')
    expect(silent.finalize()).toEqual({ allowed: false, reason: 'turn_has_no_audio' })
  })

  it('fails closed on an oversized audio turn', () => {
    const gate = new HistorianTurnQuarantine(4)
    gate.approveQuestion(APPROVAL)
    gate.bufferText(APPROVAL.approvedText)
    gate.bufferFinalText(APPROVAL.approvedText)
    expect(gate.bufferAudio('AAAAA')).toBe(false)
    expect(gate.finalize()).toEqual({ allowed: false, reason: 'turn_audio_buffer_overflow' })
  })

  it('permits a question-free terminal statement and rejects a terminal question', () => {
    expect(validateTurnText({
      text: APPROVED_HISTORIAN_CLOSING_TEXT,
      mode: 'terminal_statement',
    })).toEqual({ valid: true })
    expect(validateTurnText({
      text: 'Is there anything else?',
      mode: 'terminal_statement',
    })).toEqual({ valid: false, reason: 'terminal_turn_must_not_ask' })
    expect(validateTurnText({
      text: 'Your history proves that everything is fine.',
      mode: 'terminal_statement',
    })).toEqual({ valid: false, reason: 'terminal_text_mismatch' })
  })

  it('requires a matching final assistant text copy before releasing audio', () => {
    const missing = new HistorianTurnQuarantine(1_000)
    missing.approveQuestion(APPROVAL)
    missing.bufferText(APPROVAL.approvedText)
    missing.bufferAudio('AAAA')
    expect(missing.finalize()).toEqual({ allowed: false, reason: 'turn_missing_confirmed_text' })

    const changed = new HistorianTurnQuarantine(1_000)
    changed.approveQuestion(APPROVAL)
    changed.bufferText(APPROVAL.approvedText)
    changed.bufferFinalText('How has the main problem changed?')
    changed.bufferAudio('AAAA')
    expect(changed.finalize()).toEqual({ allowed: false, reason: 'turn_text_stage_mismatch' })
  })

  it('exposes only structural diagnostics while a turn is quarantined', () => {
    const gate = new HistorianTurnQuarantine(1_000)
    gate.approveQuestion(APPROVAL)
    gate.bufferText('Synthetic private wording must not appear in diagnostics.')
    gate.bufferAudio('SYNTHETIC_PRIVATE_PCM')

    const diagnostics = gate.diagnostics()
    expect(diagnostics).toEqual({
      authorization: 'approved_question',
      speculativeTextSeen: true,
      finalTextSeen: false,
      speculativeTextPartCount: 1,
      finalTextPartCount: 0,
      speculativeMatchesApproval: false,
      finalMatchesApproval: null,
      stageTextMatches: null,
      speculativeWordCount: 8,
      finalWordCount: 0,
      approvedWordCount: 7,
      audioChunkCount: 1,
      overflowed: false,
    })
    expect(JSON.stringify(diagnostics)).not.toContain('private')
    expect(gate.hasConfirmedTextMatch()).toBe(false)
  })

  it('parses only the exact application approval shape', () => {
    expect(parseApprovedHistorianTurn({
      success: true,
      status: 'approved',
      obligation_id: 'age',
      approved_text: 'How old are you?',
      allow_example: false,
    })).toEqual({ obligationId: 'age', approvedText: 'How old are you?', allowExample: false })
    expect(parseApprovedHistorianTurn({
      success: true,
      status: 'approved',
      obligation_id: 'age',
      approved_text: 'How old are you?',
    })).toBeNull()
    expect(parseApprovedHistorianTurn({
      success: true,
      status: 'approved',
      obligation_id: 'age',
      approved_text: 'How old are you?',
      allow_example: true,
    })).toEqual({ obligationId: 'age', approvedText: 'How old are you?', allowExample: true })
  })
})
