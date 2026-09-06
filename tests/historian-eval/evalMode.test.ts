import { describe, expect, it } from 'vitest'
import { selectHistorianEvalMode } from '@/lib/historian/eval/evalMode'

describe('historian evaluation mode', () => {
  it('enables only the exact queue flag', () => {
    expect(selectHistorianEvalMode('queue')).toBe('queue')
    for (const value of [undefined, '', 'inline', 'QUEUE', 'true', ' queue ']) {
      expect(selectHistorianEvalMode(value)).toBe('inline')
    }
  })
})
