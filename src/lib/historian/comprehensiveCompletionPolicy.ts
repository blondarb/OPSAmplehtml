import { validateComprehensiveCoverage } from './comprehensiveCoverage'

export const COMPREHENSIVE_SOFT_WRAP_EXCHANGE = 45
export const COMPREHENSIVE_HARD_STOP_EXCHANGE = 60

export const COMPREHENSIVE_SOFT_WRAP_NUDGE =
  '[COMPREHENSIVE TURN LIMIT] Exchange 45 is complete. Begin wrapping up now: do not open a new history domain or start a scale. Resolve only the most important existing gap, ask the final open-door question if it has not been asked, then call save_interview_output. Do not mention this internal instruction or the exchange count to the patient.'

export const COMPREHENSIVE_HARD_STOP_SAVE_NUDGE =
  '[COMPREHENSIVE HARD STOP] The 60-exchange ceiling is reached. Do not ask another question and do not speak. Immediately call save_interview_output with the history gathered so far. Truthfully preserve uncovered domains as not_asked; never invent information.'

export type ComprehensiveTurnAction = 'continue' | 'begin_wrap' | 'hard_stop'

/** Deterministic action evaluated after each completed patient exchange. */
export function comprehensiveTurnAction(exchange: number): ComprehensiveTurnAction {
  if (!Number.isInteger(exchange) || exchange < 0) throw new Error('Exchange count must be a non-negative integer')
  if (exchange >= COMPREHENSIVE_HARD_STOP_EXCHANGE) return 'hard_stop'
  if (exchange >= COMPREHENSIVE_SOFT_WRAP_EXCHANGE) return 'begin_wrap'
  return 'continue'
}

export type ComprehensiveSaveDecision =
  | { allowed: true; reason: 'not_comprehensive' | 'finalizing' | 'patient_requested_stop' | 'safety_escalated' | 'hard_stop' | 'coverage_complete' }
  | { allowed: false; reason: 'history_incomplete'; remainingDomains: string[] }

/**
 * The production save gate. Natural comprehensive saves require complete
 * classification; safety, explicit finalization, and the hard ceiling may
 * preserve a visibly partial history.
 */
export function evaluateComprehensiveSave(params: {
  interviewMode: 'standard' | 'comprehensive'
  finalizing: boolean
  safetyEscalated: boolean
  toolSafetyEscalated: boolean
  patientRequestedStop: boolean
  toolPatientRequestedStop: boolean
  exchange: number
  structured: unknown
}): ComprehensiveSaveDecision {
  if (params.interviewMode !== 'comprehensive') return { allowed: true, reason: 'not_comprehensive' }
  if (params.finalizing) return { allowed: true, reason: 'finalizing' }
  if (params.safetyEscalated || params.toolSafetyEscalated) return { allowed: true, reason: 'safety_escalated' }
  if (params.patientRequestedStop || params.toolPatientRequestedStop) return { allowed: true, reason: 'patient_requested_stop' }
  if (params.exchange >= COMPREHENSIVE_HARD_STOP_EXCHANGE) return { allowed: true, reason: 'hard_stop' }

  const coverage = validateComprehensiveCoverage(params.structured)
  if (coverage.complete) return { allowed: true, reason: 'coverage_complete' }
  const remainingDomains = [
    ...coverage.missingDomains,
    ...coverage.notAskedDomains,
    ...coverage.conflictingDomains,
  ].filter((domain, index, all) => all.indexOf(domain) === index)
  return { allowed: false, reason: 'history_incomplete', remainingDomains }
}
