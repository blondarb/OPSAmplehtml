import { describe, expect, it } from 'vitest'

import { buildDiagnosticInputProjection } from '@/lib/historian/eval/diagnosticInput'
import { createMedicationReconciliationState } from '@/lib/historian/medicationReconciliation'

describe('post-session diagnostic input medication boundary', () => {
  it('removes confirmed and rejected ASR medication names but supplies only the patient-confirmed ledger value', () => {
    const transcript = [
      { role: 'assistant' as const, text: 'Which medication name is correct?', timestamp: 1, seq: 1 },
      { role: 'user' as const, text: 'I said tirzepatide, not trazodone.', timestamp: 2, seq: 2 },
    ]
    const medication = createMedicationReconciliationState()
    medication.inventoryStatus = 'answered'
    medication.inventoryPatientSeq = 2
    medication.items.push(
      {
        id: 'confirmed', heardName: 'tirzepatide', sourcePatientSeq: 2,
        nameStatus: 'confirmed', nameConfirmationAttempts: 1,
        dose: { status: 'known', value: 'patient-stated amount', patientSeqs: [2], attempts: 1 },
        frequency: { status: 'known', value: 'patient-stated schedule', patientSeqs: [2], attempts: 1 },
      },
      {
        id: 'rejected', heardName: 'trazodone', sourcePatientSeq: 2,
        nameStatus: 'uncertain', nameConfirmationAttempts: 2,
        dose: { status: 'uncertain', value: null, patientSeqs: [], attempts: 2 },
        frequency: { status: 'uncertain', value: null, patientSeqs: [], attempts: 2 },
      },
    )

    const projected = buildDiagnosticInputProjection(transcript, medication)
    expect(projected.transcript[1].text).toBe('[medication redacted]')
    expect(projected.trustedMedicationContext).toContain('tirzepatide')
    expect(projected.trustedMedicationContext).not.toContain('trazodone')
    expect(projected.trustedMedicationContext).toContain('remains unresolved')
    expect(projected.redactedMedicationSpanCount).toBe(1)
  })

  it('does not fabricate a negative medication history when reconciliation was never completed', () => {
    const projected = buildDiagnosticInputProjection([
      { role: 'user' as const, text: 'I am not sure what I take.', timestamp: 1, seq: 1 },
    ], null)
    expect(projected.trustedMedicationContext).toMatch(/incomplete or unresolved/i)
    expect(projected.trustedMedicationContext).not.toMatch(/takes no|no current/i)
  })
})
