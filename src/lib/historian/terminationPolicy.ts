import type { HistorianTerminationReason } from '@/lib/historianTypes'

export const HISTORIAN_TERMINATION_REASONS = [
  'coverage_complete',
  'complete_with_uncertainty',
  'patient_requested_stop',
  'safety_escalated',
  'hard_stop',
  'manual_end',
  'transport_lost',
  'provider_error',
  'unresponsive',
] as const satisfies readonly HistorianTerminationReason[]

const TERMINATION_REASON_SET = new Set<string>(HISTORIAN_TERMINATION_REASONS)

export function parseHistorianTerminationReason(value: unknown): HistorianTerminationReason | null {
  return typeof value === 'string' && TERMINATION_REASON_SET.has(value)
    ? (value as HistorianTerminationReason)
    : null
}

export function completionStatusForTermination(
  reason: HistorianTerminationReason,
): 'complete' | 'ended_early' {
  return reason === 'coverage_complete' || reason === 'complete_with_uncertainty'
    ? 'complete'
    : 'ended_early'
}

export function terminationMatchesCompletionStatus(
  reason: HistorianTerminationReason,
  status: 'complete' | 'ended_early',
): boolean {
  return completionStatusForTermination(reason) === status
}
