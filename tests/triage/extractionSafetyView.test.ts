import { describe, expect, it } from 'vitest'

import {
  buildExtractionSafetyView,
  shouldAutoCreateSafetyWorkflow,
} from '@/lib/triage/extractionSafetyView'
import type { ClinicalExtraction } from '@/lib/triage/types'

function extraction(
  packetSafety?: ClinicalExtraction['packet_safety'],
): ClinicalExtraction {
  return {
    extraction_id: 'extraction-1',
    note_type_detected: 'unknown',
    extraction_confidence: 'high',
    extracted_summary: 'Synthetic summary',
    key_findings: {
      chief_complaint: '',
      neurological_symptoms: [],
      timeline: '',
      relevant_history: '',
      medications_and_therapies: [],
      failed_therapies: [],
      imaging_results: [],
      red_flags_noted: [],
      functional_status: '',
    },
    original_text_length: 60_000,
    packet_safety: packetSafety,
  }
}

describe('buildExtractionSafetyView', () => {
  it('surfaces an emergency hold and page-grounded evidence', () => {
    const view = buildExtractionSafetyView(
      extraction({
        care_pathway: 'emergency_now',
        review_requirement: 'emergency_action',
        clinician_hold: true,
        signals: [
          {
            code: 'acute_aphasia',
            syndrome: 'acute_cerebrovascular',
            action: 'emergency_now',
            evidence: [
              {
                quote: 'sudden aphasia today',
                documentId: 'document-1',
                pageNumber: 20,
                startOffset: 5,
                endOffset: 25,
              },
            ],
          },
        ],
      }),
    )

    expect(view).toMatchObject({
      severity: 'emergency',
      requiresImmediateAction: true,
      title: expect.stringContaining('Emergency'),
      evidence: [expect.objectContaining({ pageNumber: 20 })],
    })
    expect(shouldAutoCreateSafetyWorkflow(extraction({
      care_pathway: 'emergency_now',
      review_requirement: 'emergency_action',
      clinician_hold: true,
      signals: [],
    }))).toBe(true)
  })

  it('does not create an alert for a complete quiet packet', () => {
    expect(
      buildExtractionSafetyView(
        extraction({
          care_pathway: 'routine_outpatient',
          review_requirement: 'clinician_confirmation',
          clinician_hold: false,
          signals: [],
        }),
      ),
    ).toMatchObject({
      severity: 'none',
      requiresImmediateAction: false,
      evidence: [],
    })
    expect(shouldAutoCreateSafetyWorkflow(extraction())).toBe(false)
  })
})
