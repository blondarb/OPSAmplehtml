import { describe, expect, it } from 'vitest'
import { auditHenryTurns } from '../../src/lib/historian/eval/turnStyleChecks'

const henry = (...texts: string[]) => texts.map((text) => ({ role: 'assistant', text }))

describe('auditHenryTurns', () => {
  it('reports the observed gratitude and compound-question drift', () => {
    const report = auditHenryTurns(henry(
      'Hello, I am Henry. What brings you here?',
      'Thanks for sharing that. When did it begin?',
      'Thank you for mentioning that. How long did it last?',
      'Thanks for clarifying that. What happened next?',
      'I appreciate you telling me. Who was there?',
      'What medications and allergies do you have?',
      'Was there any warning?', 'How did you feel afterward?',
      'When was the most recent episode?', 'Is there anything else?',
      'Thank you for your time.',
    ))
    expect(report.henry_turns).toBe(11)
    expect(report.gratitude_turns).toBe(4)
    expect(report.gratitude_rate).toBe(0.4)
    expect(report.compound_question_turns).toBe(1)
    expect(report.passes).toBe(false)
  })

  it('passes a clean transcript and allows a one-topic clarifying choice', () => {
    const report = auditHenryTurns(henry('Hello. What brings you in?', 'Was it throbbing or pressure?', 'When did it start?', 'Thank you for your time.'))
    expect(report.passes).toBe(true)
    expect(report.compound_question_turns).toBe(0)
    expect(report.gratitude_turns).toBe(0)
  })

  it('excludes the final Henry turn even when a patient turn follows', () => {
    expect(auditHenryTurns([...henry('What happened?', 'Thank you.'), { role: 'user', text: 'Goodbye' }]).gratitude_turns).toBe(0)
    expect(auditHenryTurns(henry('Thank you.')).gratitude_rate).toBe(0)
    expect(auditHenryTurns([])).toMatchObject({ henry_turns: 0, gratitude_rate: 0, max_repeated_opener: 0, passes: true })
  })

  it('accepts case-insensitive Henry roles and treats every other role as patient', () => {
    expect(auditHenryTurns([
      { role: 'AsSiStAnT', text: 'What happened?' },
      { role: 'HISTORIAN', text: 'When was that?' },
      { role: 'Henry', text: 'Thank you.' },
      { role: 'system', text: 'Thanks. What medications and allergies?' },
    ])).toMatchObject({ henry_turns: 3, gratitude_turns: 0, compound_question_turns: 0 })
  })

  it.each([
    ['What medication do you take, and do you have allergies?', 1],
    ['Any surgery or family history?', 1],
    ['Any numbness, tingling?', 0],
    ['Any numbness or tingling in your hands?', 0],
    ['Do you take any medications, and do you have allergies?', 1],
    ['Any weakness or numbness on one side?', 0],
    ['Any numbness? Any tingling?', 1],
    ['What happened? When?', 1],
    ['Does the headache come and does the headache go?', 0],
    ['Any allergies or allergic reactions?', 0],
    ['About your medications and allergies. What do you take?', 0],
    ['Tell me about sleep and work.', 0],
  ])('audits question boundaries and different topic clusters: %s', (text, count) => {
    expect(auditHenryTurns(henry(text)).compound_question_turns).toBe(count)
  })

  it('counts restatements without making them an additional gate', () => {
    expect(auditHenryTurns(henry('So what happened?', 'Okay, so when?', 'It sounds like a long day.', 'You mentioned that before.')))
      .toMatchObject({ restatement_turns: 4, passes: true })
  })

  it('normalizes openers, excludes the greeting, and reports only Henry excerpts', () => {
    const secret = 'PATIENT_ONLY_SENTINEL'
    const text = 'Thanks for sharing ' + 'x'.repeat(100) + ' medications and allergies?'
    const report = auditHenryTurns([
      ...henry(text, text, text, text, text, 'Goodbye.'),
      { role: 'patient', text: secret },
    ])
    expect(report.max_repeated_opener).toBe(4)
    expect(report.repeated_openers[0]).toEqual({ opener: 'thanks for sharing', count: 4 })
    expect(report.findings).toHaveLength(3)
    expect(JSON.stringify(report.findings)).not.toContain(secret)
    for (const finding of report.findings) {
      expect(JSON.parse(finding.slice(finding.indexOf('"')))).toHaveLength(60)
    }
    expect(auditHenryTurns(henry('Greeting.', 'Okay, what next?', 'OKAY! What next?', 'okay what next?')).max_repeated_opener).toBe(3)
    expect(report.repeated_openers.length).toBeLessThanOrEqual(3)
  })

  it('allows exactly five percent gratitude', () => {
    const turns = henry('Thanks for sharing.', ...Array.from({ length: 19 }, (_, i) => `Question ${i} now?`), 'Goodbye.')
    expect(auditHenryTurns(turns)).toMatchObject({ gratitude_rate: 0.05, passes: true })
  })
})
