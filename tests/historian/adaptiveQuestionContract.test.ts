import { describe, expect, it } from 'vitest'

import {
  ADAPTIVE_AGE_QUESTION,
  ADAPTIVE_OPENING_QUESTION,
  adaptiveQuestionIssues,
  approvedAdaptiveAgeQuestion,
  approvedAdaptiveOpeningQuestion,
  approvedAdaptiveQuestion,
  canonicalAdaptiveQuestion,
} from '@/lib/historian/adaptiveQuestionContract'

describe('adaptive Historian question contract', () => {
  it('allows one brief patient-specific acknowledgement followed by one question', () => {
    const question = 'That started after the fall. Did the weakness begin immediately afterward?'
    expect(adaptiveQuestionIssues(question)).toEqual([])
    expect(approvedAdaptiveQuestion(question)).toBe(question)
  })

  it('keeps the two application-owned opening questions stable', () => {
    expect(ADAPTIVE_OPENING_QUESTION).toContain('What brought you')
    expect(ADAPTIVE_AGE_QUESTION).toBe('How old are you?')
  })

  it('accepts natural Nova wording while preserving the first-two clinical intents', () => {
    expect(approvedAdaptiveOpeningQuestion(
      "Hi, I'm Henry. What brings you in for your neurology visit today?",
    )).toBe("Hi, I'm Henry. What brings you in for your neurology visit today?")
    expect(approvedAdaptiveOpeningQuestion('How old are you?')).toBeNull()
    expect(approvedAdaptiveOpeningQuestion('What brought on the headache in the morning?')).toBeNull()
    expect(approvedAdaptiveAgeQuestion('Got it. What is your age?')).toBe(
      'Got it. What is your age?',
    )
    expect(approvedAdaptiveAgeQuestion('What brings you in today?')).toBeNull()
    expect(canonicalAdaptiveQuestion('HOW long do they last?')).toBe(
      canonicalAdaptiveQuestion('How long do they last.'),
    )
  })

  it.each([
    ['How has the symptom changed?', 'generic_symptom_reference'],
    ['When did it begin? For example, was it last week?', 'unsolicited_example'],
    ['When did it begin and how often does it happen?', 'multiple_questions'],
    ['Please describe how it began. How often does it happen?', 'multiple_questions'],
    ['It sounds like migraine. How long does the pain last?', 'diagnostic_assertion'],
    ['You should rest more. How often does this happen?', 'medical_advice'],
    ['Thanks for sharing. When did the headaches begin?', 'formulaic_filler'],
  ])('rejects %s', (question, expectedIssue) => {
    expect(adaptiveQuestionIssues(question)).toContain(expectedIssue)
    expect(approvedAdaptiveQuestion(question)).toBeNull()
  })

  it('rejects long or multiline model output', () => {
    expect(adaptiveQuestionIssues(`First line\nWhat happened next?`)).toContain('multiline')
    expect(adaptiveQuestionIssues(`${'A'.repeat(281)}?`)).toContain('too_long')
  })
})
