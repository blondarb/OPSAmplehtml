/**
 * Pure-function tests for the text-mode simulator Henry (no Bedrock).
 */
import { describe, it, expect } from 'vitest'
import {
  SIM_END_TOKEN,
  buildSimHenrySystemPrompt,
  isSimInterviewDone,
  stripSimEndToken,
  toHenryMessages,
} from '@/lib/historian/sim/simHenry'

describe('buildSimHenrySystemPrompt', () => {
  it('keeps the real historian guidance and appends the tool-free sim override', () => {
    const prompt = buildSimHenrySystemPrompt('new_patient')
    expect(prompt).toContain('Henry') // base historian prompt is present
    expect(prompt).toContain('SIMULATION MODE')
    expect(prompt).toContain(SIM_END_TOKEN)
    expect(prompt.toLowerCase()).toContain('no tools')
  })

  it('embeds the referral reason when provided', () => {
    const prompt = buildSimHenrySystemPrompt('new_patient', 'progressive hand tremor')
    expect(prompt).toContain('progressive hand tremor')
  })
})

describe('isSimInterviewDone / stripSimEndToken', () => {
  it('detects and strips the end token', () => {
    const withToken = `Thanks, take care.\n${SIM_END_TOKEN}`
    expect(isSimInterviewDone(withToken)).toBe(true)
    expect(stripSimEndToken(withToken)).toBe('Thanks, take care.')
  })
  it('is false and unchanged without the token', () => {
    expect(isSimInterviewDone('What brings you in today?')).toBe(false)
    expect(stripSimEndToken('What brings you in today?')).toBe('What brings you in today?')
  })
})

describe('toHenryMessages', () => {
  it('prepends a user kickoff for an empty transcript', () => {
    const msgs = toHenryMessages([])
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('user')
  })

  it('maps Henry→assistant and patient→user, always starting with user and alternating', () => {
    const msgs = toHenryMessages([
      { role: 'assistant', text: 'Hi, what brings you in?' },
      { role: 'user', text: 'My head hurts.' },
    ])
    expect(msgs[0].role).toBe('user') // synthetic kickoff
    expect(msgs[1]).toEqual({ role: 'assistant', content: 'Hi, what brings you in?' })
    expect(msgs[2]).toEqual({ role: 'user', content: 'My head hurts.' })
    // strict alternation
    for (let i = 1; i < msgs.length; i++) {
      expect(msgs[i].role).not.toBe(msgs[i - 1].role)
    }
  })
})
