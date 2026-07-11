import { describe, it, expect } from 'vitest'
import { detectRedFlag } from '@/lib/clara/redFlagGate'

describe('detectRedFlag — positives (must fire)', () => {
  const cases: Array<[string, string]> = [
    ['his face is drooping and his arm feels weak', 'stroke'],
    ['sudden slurred speech since this morning', 'stroke'],
    ['she can\'t lift her arm and one side of her body is numb', 'stroke'],
    ['I think I am having a stroke right now', 'stroke'],
    ['he suddenly lost vision in one eye', 'stroke'],
    ['patient is having a seizure and it will not stop', 'seizure'],
    ['seizure lasting more than 5 minutes', 'seizure'],
    ['back to back seizures without waking up in between', 'seizure'],
    ['this is status epilepticus', 'seizure'],
    ['worst headache of my life, came on all of a sudden', 'headache'],
    ['sudden severe headache, thunderclap onset', 'headache'],
    ['patient says he wants to kill himself', 'self_harm'],
    ['I want to die, I can\'t take it anymore', 'self_harm'],
    ['she has been talking about suicide', 'self_harm'],
    ['he said he wants to hurt himself', 'self_harm'],
    ['patient is unresponsive and not breathing', 'acute_emergency'],
    ['he is unconscious and there is a lot of bleeding', 'acute_emergency'],
  ]

  it.each(cases)('fires on: %s', (text) => {
    const result = detectRedFlag(text)
    expect(result.isRedFlag).toBe(true)
    expect(result.category).not.toBeNull()
    expect(result.matchedTerms.length).toBeGreaterThan(0)
  })

  it('reports the expected category for a clear stroke phrase', () => {
    const result = detectRedFlag('his face is drooping and his arm feels weak')
    expect(result.category).toBe('stroke')
  })

  it('reports the expected category for a clear seizure phrase', () => {
    const result = detectRedFlag('patient is having a seizure and it will not stop')
    expect(result.category).toBe('seizure')
  })

  it('reports the expected category for self-harm', () => {
    const result = detectRedFlag('patient says he wants to kill himself')
    expect(result.category).toBe('self_harm')
  })

  it('is case-insensitive', () => {
    expect(detectRedFlag('HIS FACE IS DROOPING').isRedFlag).toBe(true)
  })
})

describe('detectRedFlag — negatives (must NOT fire)', () => {
  const clearNegatives = [
    'the patient would like to schedule a follow-up visit next month',
    'she has a mild headache that started a few days ago',
    'he has chronic lower back pain, stable for years',
    'just calling to confirm the appointment time',
    'his tremor is about the same as last visit',
    'reviewing the CT scan results, no acute findings',
    'patient is doing well on his current medication',
    'this is a routine outpatient consult for memory concerns',
  ]

  it.each(clearNegatives)('does not fire on: %s', (text) => {
    const result = detectRedFlag(text)
    expect(result.isRedFlag).toBe(false)
    expect(result.category).toBeNull()
    expect(result.matchedTerms).toEqual([])
  })

  it('returns a safe empty result for empty input', () => {
    expect(detectRedFlag('')).toEqual({ isRedFlag: false, category: null, matchedTerms: [] })
  })
})
