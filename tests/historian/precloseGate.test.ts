import { describe, expect, it } from 'vitest'
import { buildPrecloseNote, decidePreclose, orderPrecloseRejectActions, shouldPushLocalizer } from '@/lib/historian/precloseGate'

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
    expect(buildPrecloseNote(['alcohol use', 'family history'])).toBe('[INTERNAL SYSTEM NOTE — do NOT speak this aloud, do NOT mention it to the patient]: The record is not complete yet. Before finishing, ask the patient about: alcohol use; family history. Ask each listed item once, one question at a time, in your own words. If the patient declines or says they don\'t know, accept that and move on — do not re-ask. Then call save_interview_output again.')
  })
})


describe('provider reject ordering', () => {
  it('injects guidance before OpenAI tool results trigger response.create', () => {
    expect(orderPrecloseRejectActions(true)).toEqual(['injectNote', 'sendToolResult'])
  })
  it('sends Nova tool results before the forcing note turn', () => {
    expect(orderPrecloseRejectActions(false)).toEqual(['sendToolResult', 'injectNote'])
  })
})

describe('localizer push guards', () => {
  for (const speaking of [false, true]) {
    for (const safetyEscalated of [false, true]) {
      for (const payloadEmpty of [false, true]) {
        it(`speaking=${speaking}, safetyEscalated=${safetyEscalated}, payloadEmpty=${payloadEmpty}`, () => {
          expect(shouldPushLocalizer({ speaking, safetyEscalated, payloadEmpty }))
            .toBe(!speaking && !safetyEscalated && !payloadEmpty)
        })
      }
    }
  }
})
