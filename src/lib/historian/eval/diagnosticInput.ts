import type { HistorianTranscriptEntry } from '@/lib/historianTypes'
import {
  confirmedMedicationSummary,
  createMedicationReconciliationState,
  medicationReconciliationHasUncertainty,
  type MedicationReconciliationState,
} from '@/lib/historian/medicationReconciliation'
import { redactMedicationNameSpans } from './clinicianHistoryReport'

export interface DiagnosticInputProjection {
  transcript: HistorianTranscriptEntry[]
  trustedMedicationContext: string
  redactedMedicationSpanCount: number
}

/**
 * Builds the only transcript projection permitted to reach post-session DDx
 * models in the report-first pipeline. Raw or rejected ASR medication names
 * are removed; only patient-confirmed application-ledger values are supplied
 * as medication authority.
 */
export function buildDiagnosticInputProjection(
  transcript: readonly HistorianTranscriptEntry[],
  medicationState: MedicationReconciliationState | null,
): DiagnosticInputProjection {
  const state = medicationState ?? createMedicationReconciliationState()
  const redacted = redactMedicationNameSpans(transcript, state)
  const confirmed = confirmedMedicationSummary(state)
  const uncertain = medicationReconciliationHasUncertainty(state)

  let trustedMedicationContext: string
  if (confirmed) {
    trustedMedicationContext =
      `Application-verified patient medication reconciliation:\n${confirmed}` +
      (uncertain
        ? '\nAdditional medication information remains unresolved; do not infer or name it.'
        : '')
  } else if (state.inventoryStatus === 'answered' && !uncertain) {
    trustedMedicationContext =
      'The application ledger contains no patient-confirmed current medication name.'
  } else {
    trustedMedicationContext =
      'Medication reconciliation is incomplete or unresolved. Do not infer any medication name, amount, schedule, adherence, or effect.'
  }

  return {
    transcript: redacted.transcript,
    trustedMedicationContext,
    redactedMedicationSpanCount: redacted.redactedSpanCount,
  }
}
