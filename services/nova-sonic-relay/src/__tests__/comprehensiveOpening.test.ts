import { describe, expect, it } from 'vitest'
import { comprehensiveOpeningAction } from '../comprehensiveOpening.js'

describe('Nova Comprehensive opening transition', () => {
  it('nudges age exactly after the first substantive Comprehensive reply', () => {
    expect(comprehensiveOpeningAction('comprehensive', false, 'I was referred for trouble walking.')).toBe('ask_age')
    expect(comprehensiveOpeningAction('comprehensive', true, 'Another ASR segment.')).toBe('ignore')
  })

  it('does not alter Standard interviews', () => {
    expect(comprehensiveOpeningAction('standard', false, 'I was referred for headaches.')).toBe('ignore')
  })

  it.each([
    'I am having the worst headache of my life right now.',
    'I cannot move my arm.',
    'I want to hurt myself.',
    'Please stop the interview.',
  ])('suppresses the age nudge when safety or stopping language is present: %s', (text) => {
    expect(comprehensiveOpeningAction('comprehensive', false, text)).toBe('suppress')
  })
})
