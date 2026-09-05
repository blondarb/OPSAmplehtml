import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAttendingTranscriptWindow, getAttendingConfig, shouldRunAttending } from '@/lib/consult/attendingGaps'
import { buildAttendingPrompt } from '@/lib/consult/attendingPrompt'
import { sanitizeAttendingGaps } from '@/lib/consult/attendingSanitize'

const gate = { enabled: true, interval: 2, localizerCycle: 2, transcriptTurnCount: 8, safetyEscalated: false }
const gap = (topic = 'timing', question = 'When did this start?') => ({ topic, question, why: 'Not yet asked.' })
afterEach(() => vi.unstubAllEnvs())

describe('attending gate and config', () => {
  it.each([
    [{ enabled: false }, false], [{ safetyEscalated: true }, false],
    [{ transcriptTurnCount: 5 }, false], [{ localizerCycle: 2 }, true],
    [{ localizerCycle: 3 }, false], [{ localizerCycle: undefined }, true],
    [{ localizerCycle: undefined, transcriptTurnCount: 6 }, false],
  ])('handles %j', (override, expected) => {
    expect(shouldRunAttending({ ...gate, ...override })).toBe(expected)
  })
  it.each(['', '0', '-1', '2.5', '2junk', 'Infinity', '9007199254740992'])('defaults invalid interval %s', value => {
    vi.stubEnv('HISTORIAN_ATTENDING_INTERVAL', value)
    expect(getAttendingConfig().interval).toBe(2)
  })
  it('uses literal true and a positive integer', () => {
    vi.stubEnv('HISTORIAN_ATTENDING_ENABLED', 'TRUE')
    vi.stubEnv('HISTORIAN_ATTENDING_INTERVAL', '3')
    expect(getAttendingConfig()).toEqual({ enabled: false, interval: 3 })
    vi.stubEnv('HISTORIAN_ATTENDING_ENABLED', 'true')
    expect(getAttendingConfig().enabled).toBe(true)
  })
})

it('keeps a bounded suffix, counts dropped turns, and does not mutate input', () => {
  const turns = [
    { role: 'assistant' as const, text: 'Old question?' },
    { role: 'user' as const, text: 'New answer.' },
  ]
  expect(buildAttendingTranscriptWindow(turns, 20)).toEqual({ window: [turns[1]], dropped_turns: 1 })
  expect(buildAttendingTranscriptWindow(turns, 0)).toEqual({ window: [], dropped_turns: 2 })
  expect(buildAttendingTranscriptWindow(turns)).toEqual({ window: turns, dropped_turns: 0 })
  expect(turns).toHaveLength(2)
})

describe('sanitization', () => {
  it.each([null, undefined, 1, 'text', [], {}, { gaps: 'no' }, { gaps: [null, {}, { topic: 3 }] }])('tolerates garbage %j', raw => {
    expect(sanitizeAttendingGaps(raw)).toEqual([])
  })
  it('trims, deduplicates topics, then caps at three', () => {
    expect(sanitizeAttendingGaps({ gaps: [gap(' timing '), gap('TIMING'), gap('family'), gap('medicine'), gap('function')] })
      .map(g => g.topic)).toEqual(['timing', 'family', 'medicine'])
  })
  it.each(['stroke', 'TIA', 'MS', 'multiple sclerosis', 'epilepsy', 'Parkinson', 'ALS', 'myasthenia', 'Guillain', 'tumor', 'cancer', 'aneurysm', 'meningitis', 'encephalitis', 'migraine with aura'])('drops diagnosis term %s from either field', term => {
    expect(sanitizeAttendingGaps({ gaps: [gap(term), gap('history', `Have you had ${term}?`)] })).toEqual([])
  })
  it('enforces 160 characters without substring false positives', () => {
    expect(sanitizeAttendingGaps({ gaps: [gap('long', 'x'.repeat(161)), gap('symptoms', 'x'.repeat(160))] })).toEqual([gap('symptoms', 'x'.repeat(160))])
  })
})

it('pins patient-language and referral boundaries and serializes input as data', () => {
  const prompt = buildAttendingPrompt({ transcriptWindow: [], referralText: 'Synthetic referral' })
  expect(prompt.system).toContain('no diagnosis names')
  expect(prompt.system).toContain('Referral-note facts do not count as asked')
  expect(prompt.system).toContain('already asked directly in the transcript is NOT a gap')
  expect(prompt.system).toContain('Synthetic example 1')
  expect(prompt.system).toContain('Synthetic example 2')
  expect(JSON.parse(prompt.user).referralText).toBe('Synthetic referral')
})
