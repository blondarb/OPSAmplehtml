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
      return 'MD1 — emergent on-call neurologist (URGENT)'
    case CONSULT_TYPE.NON_EMERGENT:
      if (statLevel === 1) return 'STAT 1 — acute non-stroke neuro (GBS/MG/cord/meningitis); verbal recs to docs ≤60 min'
      if (statLevel === 2) return 'STAT 2 — disposition support ≤60 min'
      // statLevel null = PLAIN non-emergent (Steve 2026-07-12): caller framed
      // it as routine / stable floor patient with no urgency request — goes to
      // the non-emergent provider, no timed STAT SLA.
      return 'Non-emergent provider — routine queue (no STAT SLA)'
    case CONSULT_TYPE.CT_RETURN:
      return 'CT-return — prior provider if already seen; if no prior record → probable emergent → MD1'
    case CONSULT_TYPE.EEG_READ:
      return 'EEG reader'
    case CONSULT_TYPE.CERIBELL_EEG:
      return 'Ceribell — ≥20% → MD1 (emergent) + EEG reader, simultaneously; <20% → EEG reader (routine)'
    case CONSULT_TYPE.ROUNDING:
      return 'MD2 — rounding physician (scheduled inpatient follow-up, incl. new-patient rounding)'
    case CONSULT_TYPE.OUTPATIENT:
      return 'not covered — refer to the patient’s primary care provider'
    default:
      return `${consultType || 'unknown'} (unmapped routing target)`
  }
}
