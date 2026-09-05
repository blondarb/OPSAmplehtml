import { describe, expect, it, vi } from 'vitest'
import { BACKGROUND_ITEMS, computeCoverageGaps } from '@/lib/historian/eval/coverageGate'
import { loadRubric } from '@/lib/historian/eval/rubric'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

vi.mock('@/lib/historian/eval/rubric', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/historian/eval/rubric')>(),
  loadRubric: vi.fn(() => ({ criticalQuestions: [
  { id: 'critical_a', question: 'the onset of your symptoms', severity: 'critical', coverage_hints: ['sudden'] },
  { id: 'critical_b', question: '', severity: 'critical', coverage_hints: ['weakness'] },
  { id: 'no_hints', question: 'uncheckable', severity: 'critical' },
  { id: 'important', question: 'other', severity: 'important', coverage_hints: ['other'] },
] })) }))
const turn = (role: 'assistant' | 'user', text: string): HistorianTranscriptEntry => ({ role, text, timestamp: 0 })
const background = 'MEDICATION DOSE ALCOHOL FAMILY'

describe('computeCoverageGaps', () => {
  it('only counts assistant turns for background, caps at three, and puts background first', () => {
    expect(computeCoverageGaps([turn('user', background)]).unmatched.map(item => item.id))
      .toEqual(BACKGROUND_ITEMS.slice(0, 3).map(item => item.id))
    expect(computeCoverageGaps([turn('assistant', 'medication dose')]).unmatched.map(item => item.id))
      .toEqual(['background_alcohol', 'background_family_history', 'critical_a'])
  })
  it.each(['user', 'assistant'] as const)('counts critical rubric coverage from %s turns', role => {
    expect(computeCoverageGaps([turn('assistant', background), turn(role, 'SUDDEN weakness')]).unmatched).toEqual([])
  })
  it('uses question labels, falls back to ids, excludes null hints, and counts checkable items', () => {
    expect(computeCoverageGaps([turn('assistant', background)], 'headache')).toEqual({
      unmatched: [{ id: 'critical_a', label: 'the onset of your symptoms' }, { id: 'critical_b', label: 'critical_b' }], checked: 6,
    })
    expect(loadRubric).toHaveBeenCalledWith({ chiefComplaint: 'headache' })
  })
  it('accepts every prescribed background hint independently', () => {
    for (const item of BACKGROUND_ITEMS) {
      for (const hint of item.hints) {
        const otherHints = BACKGROUND_ITEMS.filter(other => other.id !== item.id).map(other => other.hints[0]).join(' ')
        expect(computeCoverageGaps([turn('assistant', `${otherHints} ${hint}`)]).unmatched.map(gap => gap.id)).not.toContain(item.id)
      }
    }
  })
})
