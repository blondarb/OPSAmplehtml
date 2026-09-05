import { describe, expect, it } from 'vitest'
import { buildPrecloseNote, decidePreclose } from '@/lib/historian/precloseGate'

const input = { enabled: true, safetyEscalated: false, alreadyRejected: false, unmatched: [{ id: 'alcohol', label: 'alcohol use' }] }
describe('decidePreclose', () => {
  it('rejects uncovered history once', () => {
    expect(decidePreclose(input)).toEqual({ action: 'reject', askNext: ['alcohol use'] })
    expect(decidePreclose({ ...input, alreadyRejected: true })).toEqual({ action: 'finalize' })
  })
  it.each([{ enabled: false }, { safetyEscalated: true }, { alreadyRejected: true }, { unmatched: [] }])('finalizes for guard %j', guard => {
    expect(decidePreclose({ ...input, ...guard })).toEqual({ action: 'finalize' })
  })
  it('builds the exact internal note', () => {
    expect(buildPrecloseNote(['alcohol use', 'family history'])).toBe('[INTERNAL SYSTEM NOTE — do NOT speak this aloud, do NOT mention it to the patient]: The record is not complete yet. Before finishing, ask the patient about: alcohol use; family history. One question at a time, in your own words. When those are answered, call save_interview_output again.')
  })
})
