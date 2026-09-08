import { describe, expect, it } from 'vitest'
import { extractAskedQuestions } from '@/lib/historian/askedQuestions'

describe('extractAskedQuestions', () => {
  it('extracts only assistant question sentences', () => {
    const turns = [
      { role: 'user', text: 'It started last week.' },
      { role: 'assistant', text: 'Where is the weakness most located?' },
      { role: 'user', text: 'On the left side.' },
    ]
    expect(extractAskedQuestions(turns)).toEqual(['Where is the weakness most located?'])
  })

  it('splits a multi-sentence assistant turn and keeps only the question', () => {
    const turns = [
      { role: 'assistant', text: 'Thanks for sharing that. When did you first notice the weakness? That helps a lot.' },
    ]
    expect(extractAskedQuestions(turns)).toEqual(['When did you first notice the weakness?'])
  })

  it('dedupes case-insensitively, keeping the most recent position', () => {
    const turns = [
      { role: 'assistant', text: 'Where is the weakness most located?' },
      { role: 'user', text: 'Mostly on the left arm.' },
      { role: 'assistant', text: 'When did it start?' },
      { role: 'user', text: 'Not totally sure.' },
      { role: 'assistant', text: 'WHERE IS THE WEAKNESS MOST LOCATED?' },
    ]
    expect(extractAskedQuestions(turns)).toEqual([
      'When did it start?',
      'WHERE IS THE WEAKNESS MOST LOCATED?',
    ])
  })

  it('respects max', () => {
    const turns = Array.from({ length: 5 }, (_, i) => ({ role: 'assistant', text: `Question number ${i}?` }))
    const result = extractAskedQuestions(turns, { max: 2 })
    expect(result).toEqual(['Question number 3?', 'Question number 4?'])
  })

  it('respects maxLen', () => {
    const longQuestion = `Is the weakness ${'very '.repeat(40)}bad?`
    const turns = [{ role: 'assistant', text: longQuestion }]
    const result = extractAskedQuestions(turns, { maxLen: 30 })
    expect(result).toHaveLength(1)
    expect(result[0].length).toBeLessThanOrEqual(30)
  })

  it('ignores user turns', () => {
    const turns = [
      { role: 'user', text: 'Do I need to answer this?' },
      { role: 'assistant', text: 'Okay, thank you.' },
    ]
    expect(extractAskedQuestions(turns)).toEqual([])
  })

  it('returns [] for an empty transcript', () => {
    expect(extractAskedQuestions([])).toEqual([])
  })
})
