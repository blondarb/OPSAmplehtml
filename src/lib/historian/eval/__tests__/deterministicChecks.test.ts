import { describe, it, expect } from 'vitest'
import {
  countStackedQuestions,
  STACKED_QUESTION_ISSUE_THRESHOLD,
  countNarratedReasoning,
  NARRATED_REASONING_ISSUE_THRESHOLD,
  runDeterministicChecks,
} from '../deterministicChecks'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

// Synthetic transcript text only — no PHI. Mirrors the shape reported from a
// real 2026-09-08 interview where the interviewer ("Henry") twice broke
// CORE_PROMPT RULE 1 ("Ask ONE question at a time"): once by asking two
// questions in a single breath, once across two consecutive assistant turns
// with no patient turn between them.

function turn(role: HistorianTranscriptEntry['role'], text: string, timestamp = 0): HistorianTranscriptEntry {
  return { role, text, timestamp }
}

describe('countStackedQuestions', () => {
  it('flags a single assistant turn containing two or more question marks', () => {
    const transcript: HistorianTranscriptEntry[] = [
      turn('assistant', 'Are you taking any medicines regularly? And if so, what are they and how much do you take?'),
      turn('user', 'Just a multivitamin.'),
    ]
    const result = countStackedQuestions(transcript)
    expect(result.count).toBe(1)
    expect(result.turns).toHaveLength(1)
    expect(result.turns[0].index).toBe(0)
  })

  it('flags the second of two consecutive assistant question turns with no patient turn between', () => {
    const transcript: HistorianTranscriptEntry[] = [
      turn('assistant', "What's the most you've had in one sitting recently?"),
      turn('assistant', 'Also, has the shaking made it harder to do everyday things?'),
      turn('user', 'Sometimes, yeah.'),
    ]
    const result = countStackedQuestions(transcript)
    expect(result.count).toBe(1)
    expect(result.turns).toHaveLength(1)
    expect(result.turns[0].index).toBe(1)
  })

  it('does not flag a normal alternating question/answer transcript', () => {
    const transcript: HistorianTranscriptEntry[] = [
      turn('assistant', 'When did the headaches start?'),
      turn('user', 'About three weeks ago.'),
      turn('assistant', 'Is the pain on one side or both?'),
      turn('user', 'Mostly the left side.'),
      turn('assistant', 'Thanks for sharing that. Any nausea with it?'),
      turn('user', 'A little.'),
    ]
    const result = countStackedQuestions(transcript)
    expect(result.count).toBe(0)
    expect(result.turns).toHaveLength(0)
  })

  it('does not flag a single clarifying turn with one question mark', () => {
    const transcript: HistorianTranscriptEntry[] = [
      turn('assistant', 'When you say head pain, is it more of a throbbing or pressure?'),
      turn('user', 'Throbbing.'),
    ]
    const result = countStackedQuestions(transcript)
    expect(result.count).toBe(0)
  })
})

describe('STACKED_QUESTION_ISSUE_THRESHOLD', () => {
  it('is 1 — any stacked-question turn is worth flagging', () => {
    expect(STACKED_QUESTION_ISSUE_THRESHOLD).toBe(1)
  })
})

describe('runDeterministicChecks — stacked question wiring', () => {
  it('includes stackedQuestions in the result and pushes an issue when count >= threshold', () => {
    const transcript: HistorianTranscriptEntry[] = [
      turn('assistant', 'Good morning, thanks for making time to talk with me today.'),
      turn('user', 'Sure.'),
      turn('assistant', 'Are you taking any medicines regularly? And if so, what are they and how much do you take?'),
      turn('user', 'Just a multivitamin.'),
    ]
    const result = runDeterministicChecks(transcript, null, null, [])
    expect(result.stackedQuestions.count).toBe(1)
    expect(result.issues).toContain('stacked questions in 1 assistant turns (RULE 1 drift)')
  })

  it('does not push a stacked-question issue when count is 0', () => {
    const transcript: HistorianTranscriptEntry[] = [
      turn('assistant', 'When did the headaches start?'),
      turn('user', 'About three weeks ago.'),
    ]
    const result = runDeterministicChecks(transcript, null, null, [])
    expect(result.stackedQuestions.count).toBe(0)
    expect(result.issues.some((issue) => issue.includes('stacked questions'))).toBe(false)
  })
})

// Synthetic transcript text only — no PHI, paraphrased from the prod
// regression (run 5fa4180b, 2026-09-09) where Nova 2 Sonic narrated its
// planning aloud to the patient.

describe('countNarratedReasoning', () => {
  it('flags a narration turn with no question mark, no second person, and a planning cue', () => {
    const transcript: HistorianTranscriptEntry[] = [
      turn('assistant', "Okay, the patient mentioned some weakness in one arm. I need to follow up on this."),
      turn('assistant', 'First, I should call get_attending_hint again as per the rules.'),
      turn('assistant', 'The next logical step is to ask about where the weakness is.'),
    ]
    const result = countNarratedReasoning(transcript)
    expect(result.count).toBe(3)
    expect(result.turns.map((t) => t.index)).toEqual([0, 1, 2])
  })

  it('does not flag a patient-facing bridge with no question mark', () => {
    const transcript: HistorianTranscriptEntry[] = [
      turn('assistant', "Let's talk about your medications."),
      turn('assistant', "I'm sorry — that sounds really hard."),
      turn('assistant', "Okay, let's move on to medications."),
    ]
    const result = countNarratedReasoning(transcript)
    expect(result.count).toBe(0)
  })

  it('does not flag a narration-shaped turn that still contains a question mark', () => {
    const transcript: HistorianTranscriptEntry[] = [
      turn('assistant', 'So my question should be: where do you feel this weakness?'),
    ]
    const result = countNarratedReasoning(transcript)
    expect(result.count).toBe(0)
  })

  it('does not flag a second-person line containing a cue word', () => {
    const transcript: HistorianTranscriptEntry[] = [
      turn('assistant', 'I need to ask you about any red flags your doctor mentioned.'),
    ]
    const result = countNarratedReasoning(transcript)
    expect(result.count).toBe(0)
  })

  it('does not flag user turns even when they match cues', () => {
    const transcript: HistorianTranscriptEntry[] = [
      turn('user', 'I should probably mention the patient history from my last doctor as per the rules.'),
    ]
    const result = countNarratedReasoning(transcript)
    expect(result.count).toBe(0)
  })
})

describe('NARRATED_REASONING_ISSUE_THRESHOLD', () => {
  it('is 1 — any narrated-reasoning turn is worth flagging', () => {
    expect(NARRATED_REASONING_ISSUE_THRESHOLD).toBe(1)
  })
})

describe('runDeterministicChecks — narrated reasoning wiring', () => {
  it('includes narratedReasoning in the result and pushes an issue when count >= threshold', () => {
    const transcript: HistorianTranscriptEntry[] = [
      turn('assistant', 'Good morning, thanks for making time to talk with me today.'),
      turn('user', 'Sure.'),
      turn('assistant', 'The next logical step is to ask about where the weakness is.'),
      turn('user', 'Okay.'),
    ]
    const result = runDeterministicChecks(transcript, null, null, [])
    expect(result.narratedReasoning.count).toBe(1)
    expect(result.issues).toContain('narrated reasoning in 1 assistant turns (spoken planning, never addressed to the patient)')
  })

  it('does not push a narrated-reasoning issue when count is 0', () => {
    const transcript: HistorianTranscriptEntry[] = [
      turn('assistant', 'When did the headaches start?'),
      turn('user', 'About three weeks ago.'),
    ]
    const result = runDeterministicChecks(transcript, null, null, [])
    expect(result.narratedReasoning.count).toBe(0)
    expect(result.issues.some((issue) => issue.includes('narrated reasoning'))).toBe(false)
  })
})
