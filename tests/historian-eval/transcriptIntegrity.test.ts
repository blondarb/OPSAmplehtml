import { describe, expect, it } from 'vitest'

import { validateTranscript } from '@/lib/historian/transcriptIntegrity'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

function entry(
  overrides: Partial<HistorianTranscriptEntry> = {},
): HistorianTranscriptEntry {
  return { role: 'assistant', text: 'Hello there.', timestamp: 0, seq: 1, ...overrides }
}

describe('validateTranscript', () => {
  it('accepts an empty transcript', () => {
    expect(validateTranscript([])).toEqual({ valid: true, issues: [] })
  })

  it('accepts a well-formed monotonic transcript', () => {
    const entries: HistorianTranscriptEntry[] = [
      entry({ role: 'assistant', text: 'Hi, how can I help?', timestamp: 0, seq: 1 }),
      entry({ role: 'user', text: 'I have a headache.', timestamp: 4, seq: 2 }),
      entry({ role: 'assistant', text: 'How long has this been going on?', timestamp: 8, seq: 3 }),
    ]
    const result = validateTranscript(entries)
    expect(result.valid).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('flags a non-monotonic seq', () => {
    const entries: HistorianTranscriptEntry[] = [
      entry({ seq: 1, timestamp: 0 }),
      entry({ seq: 3, timestamp: 1 }),
      entry({ seq: 2, timestamp: 2 }),
    ]
    const result = validateTranscript(entries)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => /seq/i.test(i) && /order|monoton/i.test(i))).toBe(true)
  })

  it('flags a duplicate seq distinctly from an out-of-order seq', () => {
    const entries: HistorianTranscriptEntry[] = [
      entry({ seq: 1, timestamp: 0 }),
      entry({ seq: 2, timestamp: 1 }),
      entry({ seq: 2, timestamp: 2 }),
    ]
    const result = validateTranscript(entries)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => /duplicate/i.test(i) && /seq/i.test(i))).toBe(true)
  })

  it('flags a negative timestamp', () => {
    const entries: HistorianTranscriptEntry[] = [entry({ seq: 1, timestamp: -1 })]
    const result = validateTranscript(entries)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => /timestamp/i.test(i) && /negative/i.test(i))).toBe(true)
  })

  it('flags a non-monotonic timestamp', () => {
    const entries: HistorianTranscriptEntry[] = [
      entry({ seq: 1, timestamp: 10 }),
      entry({ seq: 2, timestamp: 5 }),
    ]
    const result = validateTranscript(entries)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => /timestamp/i.test(i) && /(monoton|order)/i.test(i))).toBe(true)
  })

  it('allows equal consecutive timestamps (same-second turns)', () => {
    const entries: HistorianTranscriptEntry[] = [
      entry({ seq: 1, timestamp: 5 }),
      entry({ seq: 2, timestamp: 5 }),
    ]
    const result = validateTranscript(entries)
    expect(result.valid).toBe(true)
  })

  it('flags an unknown role', () => {
    const entries = [
      { role: 'system', text: 'hi', timestamp: 0, seq: 1 } as unknown as HistorianTranscriptEntry,
    ]
    const result = validateTranscript(entries)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => /role/i.test(i))).toBe(true)
  })

  it('flags empty (or whitespace-only) text', () => {
    const entries: HistorianTranscriptEntry[] = [entry({ text: '   ', seq: 1 })]
    const result = validateTranscript(entries)
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => /text/i.test(i) && /empty/i.test(i))).toBe(true)
  })

  it('never echoes the offending patient/assistant text into an issue message', () => {
    const secretText = 'PATIENT SAID SOMETHING SENSITIVE HERE'
    const entries: HistorianTranscriptEntry[] = [entry({ text: secretText, seq: 1, role: 'nope' as unknown as HistorianTranscriptEntry['role'] })]
    const result = validateTranscript(entries)
    expect(result.issues.join(' ')).not.toContain(secretText)
  })

  it('tolerates entries with no seq at all (legacy transcripts predating this feature)', () => {
    const entries: HistorianTranscriptEntry[] = [
      { role: 'assistant', text: 'Hi', timestamp: 0 },
      { role: 'user', text: 'Hello', timestamp: 2 },
    ]
    const result = validateTranscript(entries)
    expect(result.valid).toBe(true)
    expect(result.issues).toEqual([])
  })
})
