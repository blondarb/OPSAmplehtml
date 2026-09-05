import { describe, expect, it } from 'vitest'
import { canStartInterview, referralNoteMode } from '@/lib/historian/intakeGates'

describe('referralNoteMode', () => {
  it.each(['', '   ', '\t\n'])('treats whitespace-only input %j as empty', note => {
    expect(referralNoteMode(note)).toBe('empty')
  })

  it.each(['x', 'Referral for recurrent headaches.'])('accepts a short reason: %s', note => {
    expect(referralNoteMode(note)).toBe('short')
  })

  it('uses trimmed length at the 49/50-character extraction boundary', () => {
    expect(referralNoteMode(' ' + 'x'.repeat(49) + '\n')).toBe('short')
    expect(referralNoteMode(' ' + 'x'.repeat(50) + '\n')).toBe('full')
    expect(referralNoteMode('x'.repeat(100))).toBe('full')
  })
})

describe('canStartInterview', () => {
  const nothingSelected = {
    hasScenario: false,
    hasSessionConfig: false,
    hasReferral: false,
    openEnded: false,
  }

  it('cannot start with nothing selected', () => {
    expect(canStartInterview(nothingSelected)).toBe(false)
  })

  it.each(['hasScenario', 'hasSessionConfig', 'hasReferral', 'openEnded'] as const)(
    'can start with %s alone', key => {
      expect(canStartInterview({ ...nothingSelected, [key]: true })).toBe(true)
    },
  )
})
