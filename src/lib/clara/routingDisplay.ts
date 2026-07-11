/**
 * Human-readable routing targets for Clara's 7 consultType values.
 *
 * Distinct from the narrated `routing.label` the /classify route already
 * returns (which describes the *action* — "would transfer now", "would
 * route to X workflow") — this maps straight to the *destination role/queue*
 * a real call would land on, for the results/feedback review UI. Mirrors
 * the routing table in sevaro-voice-agent's live call-handling logic.
 */

import { CONSULT_TYPE } from './claraRulebook'

export const URGENCY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  moderate: '#eab308',
  low: '#22c55e',
}

export function describeRoutingTarget(consultType: string, statLevel: number | null): string {
  switch (consultType) {
    case CONSULT_TYPE.EMERGENT:
      return 'MD1 / on-call neurologist — URGENT transfer'
    case CONSULT_TYPE.NON_EMERGENT:
      if (statLevel === 1) return 'MD2 / on-call — STAT1 (callback ≤15–20 min)'
      if (statLevel === 2) return 'MD2 / on-call — STAT2 (callback ≤60 min)'
      return 'MD2 / on-call — STAT1 ≤15–20m or STAT2 ≤60m per statLevel'
    case CONSULT_TYPE.CT_RETURN:
      return 'neurologist who already saw this patient (CT-return review)'
    case CONSULT_TYPE.EEG_READ:
      return 'EEG reader'
    case CONSULT_TYPE.CERIBELL_EEG:
      return 'Ceribell/rapid EEG — ≥20% → emergent on-call neurologist + EEG reader (simultaneous); <20% → EEG reader (routine)'
    case CONSULT_TYPE.ROUNDING:
      return 'rounding queue (incl. follow-ups on patients already being seen)'
    case CONSULT_TYPE.OUTPATIENT:
      return 'scheduling'
    default:
      return `${consultType || 'unknown'} (unmapped routing target)`
  }
}
