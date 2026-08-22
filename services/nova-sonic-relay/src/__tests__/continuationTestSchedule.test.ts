import { describe, expect, it } from 'vitest'

import {
  ContinuationTestBoundarySchedule,
  continuationTestBoundaryAfterTool,
  continuationTestBoundaryExchanges,
} from '../continuationTestSchedule.js'

describe('local continuation boundary schedule', () => {
  it('is unavailable outside NODE_ENV=test', () => {
    expect(continuationTestBoundaryExchanges('production', '20,46')).toEqual([])
    expect(continuationTestBoundaryExchanges('development', '20,46')).toEqual([])
  })

  it('accepts only a strictly increasing positive test schedule', () => {
    expect(continuationTestBoundaryExchanges('test', '20, 46')).toEqual([20, 46])
    expect(() => continuationTestBoundaryExchanges('test', '20,20')).toThrow()
    expect(() => continuationTestBoundaryExchanges('test', '46,20')).toThrow()
    expect(() => continuationTestBoundaryExchanges('test', '0,20')).toThrow()
    expect(() => continuationTestBoundaryExchanges('test', 'twenty')).toThrow()
  })

  it('allows only the fixed active-scale tool boundary in tests', () => {
    expect(continuationTestBoundaryAfterTool('production', 'scale_step')).toBeNull()
    expect(continuationTestBoundaryAfterTool('test', 'scale_step')).toBe('scale_step')
    expect(() => continuationTestBoundaryAfterTool('test', 'save_interview_output')).toThrow()
  })

  it('fires exact exchange boundaries and consumes the tool boundary once', () => {
    const exchanges = new ContinuationTestBoundarySchedule([2, 4], null)
    expect([
      exchanges.observeAssistantBoundary(),
      exchanges.observeAssistantBoundary(),
      exchanges.observeAssistantBoundary(),
      exchanges.observeAssistantBoundary(),
      exchanges.observeAssistantBoundary(),
    ]).toEqual([false, true, false, true, false])

    const tool = new ContinuationTestBoundarySchedule([], 'scale_step')
    tool.observeTool('scale_step')
    expect(tool.observeAssistantBoundary()).toBe(true)
    tool.observeTool('scale_step')
    expect(tool.observeAssistantBoundary()).toBe(false)
  })
})
