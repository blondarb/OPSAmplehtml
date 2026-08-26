import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import ClinicianHistoryReportCard from '@/components/historian/ClinicianHistoryReportCard'
import {
  hasLegacyHistorianSummary,
  historianReportReadyForImport,
} from '@/components/HistorianSessionPanel'
import { CLINICIAN_HISTORY_SECTION_IDS } from '@/lib/historian/eval/clinicianHistoryReport'
import { createMedicationReconciliationState } from '@/lib/historian/medicationReconciliation'
import type { HistorianSession } from '@/lib/historianTypes'

function session(overrides: Partial<HistorianSession> = {}): HistorianSession {
  return {
    id: 'session-1', tenant_id: 'tenant-1', patient_id: null, session_type: 'new_patient',
    patient_name: 'Synthetic Patient', referral_reason: 'Synthetic referral', structured_output: null,
    narrative_summary: null, transcript: [], red_flags: [], safety_escalated: false,
    duration_seconds: 120, question_count: 12, status: 'completed', reviewed: false,
    imported_to_note: false, created_at: '2026-08-25T00:00:00.000Z', updated_at: '2026-08-25T00:00:00.000Z',
    ...overrides,
  }
}

function report(status: 'complete' | 'complete_with_uncertainty' | 'partial') {
  const medications = createMedicationReconciliationState()
  medications.items.push({
    id: 'med-2-tirzepatide', heardName: 'tirzepatide', sourcePatientSeq: 2,
    nameStatus: 'confirmed', nameConfirmationAttempts: 1,
    dose: { status: 'known', value: 'patient-stated amount', patientSeqs: [4], attempts: 1 },
    frequency: { status: 'known', value: 'patient-stated schedule', patientSeqs: [4], attempts: 1 },
  })
  medications.inventoryStatus = 'answered'
  medications.inventoryPatientSeq = 6
  return {
    version: 1 as const,
    report_status: status,
    input_digest: 'a'.repeat(64),
    sections: CLINICIAN_HISTORY_SECTION_IDS.map((id) => ({
      id,
      claims: id === 'chief_concern_and_timeline'
        ? [{ text: 'Synthetic recurrent headache history.', citations: [{ patient_seq: 2, quote: 'Synthetic recurrent headaches.' }] }]
        : [],
    })),
    medication_reconciliation: medications,
    limitations: status === 'partial' ? ['Interview stopped before normal completion.'] : [],
    completion: { termination_reason: status === 'partial' ? 'provider_error' as const : 'coverage_complete' as const, patient_turn_count: 12, reviewed_through_seq: 24 },
    provenance: {
      model_id: 'synthetic-model', prompt_version: 'clinician-history-report-v1' as const,
      inference_params: { temperature: 0, max_tokens: 3500, tool: 'record_grounded_clinician_history' },
      generated_at: '2026-08-25T00:00:00.000Z', transcript_digest: 'b'.repeat(64), redacted_medication_span_count: 1,
    },
  }
}

describe('ClinicianHistoryReportCard', () => {
  it('shows a fail-closed state when a completed job has no report', () => {
    const html = renderToStaticMarkup(
      <ClinicianHistoryReportCard report={null} sufficiency={null} evaluationStatus="completed" terminationReason={null} />,
    )
    expect(html).toContain('completed without a valid clinician history report')
    expect(html).toContain('do not treat this interview as summarized')
  })

  it('labels a partial report and presents the exact application-owned medication name', () => {
    const html = renderToStaticMarkup(
      <ClinicianHistoryReportCard
        report={report('partial')}
        sufficiency={{ medication: { status: 'closed', unresolved_count: 0 } } as never}
        evaluationStatus="completed"
        terminationReason="provider_error"
      />,
    )
    expect(html).toContain('Partial history report')
    expect(html).toContain('tirzepatide')
    expect(html).not.toContain('trazodone')
    expect(html).toContain('Patient turn 2')
  })

  it('warns when an otherwise completed report retains uncertainty', () => {
    const html = renderToStaticMarkup(
      <ClinicianHistoryReportCard
        report={report('complete_with_uncertainty')}
        sufficiency={{ medication: { status: 'closed_with_uncertainty', unresolved_count: 1 } } as never}
        evaluationStatus="completed"
        terminationReason="complete_with_uncertainty"
      />,
    )
    expect(html).toContain('completed with unresolved information')
    expect(html).toContain('Medication reconciliation has unresolved')
  })
})

describe('HistorianSessionPanel report compatibility', () => {
  it('keeps a pre-v3 narrative importable while never treating v3/v4 prose as a report', () => {
    const legacy = session({ narrative_summary: 'Legacy synthetic summary.' })
    expect(hasLegacyHistorianSummary(legacy)).toBe(true)
    expect(historianReportReadyForImport(legacy)).toBe(true)

    for (const interview_prompt_version of ['comprehensive-v3', 'comprehensive-v4'] as const) {
      const modern = session({
        narrative_summary: 'Untrusted model prose.',
        structured_output: { interview_prompt_version },
        clinician_history_report: report('complete'),
      })
      expect(hasLegacyHistorianSummary(modern)).toBe(false)
      expect(historianReportReadyForImport(modern)).toBe(false)
    }
  })
})
