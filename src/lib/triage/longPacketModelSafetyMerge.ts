import { moreConservativeDataQuality } from './gatewayPersistence'
import type {
  SafetyModelCarePathway,
  SafetyModelSignal,
  ValidatedModelSafetyExtraction,
} from './modelSafetyExtraction'

const SAFETY_PATHWAY_RANK: Record<SafetyModelCarePathway, number> = {
  no_time_critical_signal: 0,
  undetermined: 1,
  same_day_clinician_review: 2,
  emergency_now: 3,
}

function signalKey(signal: SafetyModelSignal): string {
  return JSON.stringify({
    code: signal.code,
    syndrome: signal.syndrome,
    action: signal.action,
    assertion: signal.assertion,
    temporality: signal.temporality,
    experiencer: signal.experiencer,
    evidence: signal.evidence,
  })
}

export function mergeLongPacketModelSafety(
  prior: ValidatedModelSafetyExtraction | null,
  incoming: ValidatedModelSafetyExtraction,
): ValidatedModelSafetyExtraction {
  if (!prior) return incoming
  const carePathway =
    SAFETY_PATHWAY_RANK[prior.carePathway] >=
    SAFETY_PATHWAY_RANK[incoming.carePathway]
      ? prior.carePathway
      : incoming.carePathway
  const signals = new Map<string, SafetyModelSignal>()
  for (const signal of [...incoming.signals, ...prior.signals]) {
    signals.set(signalKey(signal), signal)
  }
  const criticalUnknowns = [
    ...new Set([...prior.criticalUnknowns, ...incoming.criticalUnknowns]),
  ].slice(0, 50)

  return {
    carePathway,
    dataQuality: moreConservativeDataQuality(
      prior.dataQuality,
      incoming.dataQuality,
    ),
    criticalUnknowns,
    signals: [...signals.values()]
      .sort((left, right) =>
        left.action === right.action
          ? 0
          : left.action === 'emergency_now'
            ? -1
            : 1,
      )
      .slice(0, 50),
  }
}
