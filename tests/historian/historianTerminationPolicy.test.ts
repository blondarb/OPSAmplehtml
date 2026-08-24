import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  HISTORIAN_TERMINATION_REASONS,
  completionStatusForTermination,
  parseHistorianTerminationReason,
  terminationMatchesCompletionStatus,
} from '../../src/lib/historian/terminationPolicy'

const hookSource = readFileSync(
  join(__dirname, '..', '..', 'src/hooks/useRealtimeSession.ts'),
  'utf8',
)
const migrationSource = readFileSync(
  join(__dirname, '..', '..', 'migrations/060_historian_termination_reason.sql'),
  'utf8',
)
const v2MigrationSource = readFileSync(
  join(__dirname, '..', '..', 'migrations/061_historian_comprehensive_v2.sql'),
  'utf8',
)

describe('Historian termination reason policy', () => {
  it('reserves complete for the two deterministic coverage outcomes', () => {
    expect(completionStatusForTermination('coverage_complete')).toBe('complete')
    expect(completionStatusForTermination('complete_with_uncertainty')).toBe('complete')
    for (const reason of HISTORIAN_TERMINATION_REASONS) {
      expect(completionStatusForTermination(reason)).toBe(
        reason === 'coverage_complete' || reason === 'complete_with_uncertainty'
          ? 'complete'
          : 'ended_early',
      )
    }
  })

  it('parses only the closed termination vocabulary', () => {
    expect(parseHistorianTerminationReason('hard_stop')).toBe('hard_stop')
    expect(parseHistorianTerminationReason('provider_error')).toBe('provider_error')
    expect(parseHistorianTerminationReason('model_decided_complete')).toBeNull()
    expect(parseHistorianTerminationReason(null)).toBeNull()
  })

  it('rejects status/reason contradictions', () => {
    expect(terminationMatchesCompletionStatus('coverage_complete', 'complete')).toBe(true)
    expect(terminationMatchesCompletionStatus('hard_stop', 'complete')).toBe(false)
    expect(terminationMatchesCompletionStatus('safety_escalated', 'ended_early')).toBe(true)
    expect(terminationMatchesCompletionStatus('coverage_complete', 'ended_early')).toBe(false)
    expect(terminationMatchesCompletionStatus('complete_with_uncertainty', 'complete')).toBe(true)
  })

  it('wires terminal causes before deriving endedEarly in the live hook', () => {
    expect(hookSource).toContain("endSessionRef.current('transport_lost')")
    expect(hookSource).toContain("endSessionRef.current('provider_error')")
    expect(hookSource).toContain("endSessionRef.current('unresponsive')")
    expect(hookSource).toContain('void endSessionRef.current(reason)')
    expect(hookSource).toContain("terminationReason !== 'coverage_complete' &&")
    expect(hookSource).toContain("terminationReason !== 'complete_with_uncertainty'")
    expect(hookSource).toContain('terminationReason,')
  })

  it('persists a constrained reason on both historian and consult rows', () => {
    expect(migrationSource).toContain('ALTER TABLE historian_sessions')
    expect(migrationSource).toContain('ALTER TABLE neurology_consults')
    expect(migrationSource).toContain('interview_termination_reason')
    expect(migrationSource).toContain("interview_completion_status = 'complete'")
    expect(migrationSource).toContain("interview_termination_reason = 'coverage_complete'")
    expect(v2MigrationSource).toContain("'complete_with_uncertainty'")
  })
})
