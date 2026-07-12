import { describe, expect, it, vi } from 'vitest'

import {
  coordinateCompletedExtraction,
  retainedSafetyHoldFromError,
  triageBoundExtraction,
} from '@/lib/triage/canonicalReferralCoordinator'
import type { BoundExtractionTriageRequest } from '@/lib/triage/boundExtractionRequest'
import { TriageStartError } from '@/lib/triage/pollClient'
import type { ClinicalExtraction } from '@/lib/triage/types'

function completedExtraction(
  overrides: Partial<ClinicalExtraction> = {},
): ClinicalExtraction {
  return {
    extraction_id: 'extraction-1',
    note_type_detected: 'referral',
    extraction_confidence: 'high',
    extracted_summary: 'Synthetic source-bound summary.',
    key_findings: {
      chief_complaint: 'Synthetic symptom',
      neurological_symptoms: [],
      timeline: '',
      relevant_history: '',
      medications_and_therapies: [],
      failed_therapies: [],
      imaging_results: [],
      red_flags_noted: [],
      functional_status: '',
    },
    original_text_length: 100,
    coverage_status: 'complete',
    ...overrides,
  }
}

describe('canonical referral coordinator', () => {
  it('applies the same post-extraction policy to paste and file outcomes', () => {
    const paste = coordinateCompletedExtraction(completedExtraction())
    const file = coordinateCompletedExtraction(
      completedExtraction({ source_filename: 'synthetic-referral.pdf' }),
    )

    expect(paste.decision).toStrictEqual(file.decision)
    expect(paste.triageRequest).toStrictEqual({
      source_extraction_id: 'extraction-1',
      source_type: 'paste',
    })
    expect(file.triageRequest).toStrictEqual({
      source_extraction_id: 'extraction-1',
      source_type: 'pdf',
    })
  })

  it('keeps time-critical action and incomplete coverage hold orthogonal', () => {
    const coordinated = coordinateCompletedExtraction(
      completedExtraction({
        coverage_status: 'failed',
        packet_safety: {
          care_pathway: 'same_day_clinician_review',
          review_requirement: 'immediate_clinician_review',
          clinician_hold: true,
          signals: [],
        },
      }),
    )

    expect(coordinated.decision).toMatchObject({
      nextStep: 'triage',
      immediateCarePathway: 'same_day_clinician_review',
      humanReviewHold: true,
      approvalBlockedReason: expect.stringContaining(
        'Complete source coverage has not been verified',
      ),
    })
  })

  it('passes only the bound extraction request to the triage transport', async () => {
    const transport = vi.fn(
      async (request: BoundExtractionTriageRequest) => ({
        accepted: true,
        request,
      }),
    )
    const extraction = completedExtraction({
      source_filename: 'synthetic-referral.docx',
    }) as ClinicalExtraction & {
      referral_text: string
      patient_age: number
      patient_sex: string
    }
    extraction.referral_text = 'Synthetic raw referral must not cross transport.'
    extraction.patient_age = 72
    extraction.patient_sex = 'Female'

    await expect(
      triageBoundExtraction(extraction, transport),
    ).resolves.toStrictEqual({
      accepted: true,
      request: {
        source_extraction_id: 'extraction-1',
        source_type: 'docx',
      },
    })
    expect(transport).toHaveBeenCalledExactlyOnceWith({
      source_extraction_id: 'extraction-1',
      source_type: 'docx',
    })
    expect(Object.keys(transport.mock.calls[0][0]).sort()).toStrictEqual([
      'source_extraction_id',
      'source_type',
    ])
  })

  it('does not call transport when the source extraction identity is invalid', async () => {
    const transport = vi.fn(
      async () => ({ accepted: true }),
    )

    await expect(
      triageBoundExtraction(
        completedExtraction({ extraction_id: '  ' }),
        transport,
      ),
    ).rejects.toThrow('Source extraction identifier is missing.')
    expect(transport).not.toHaveBeenCalled()
  })

  it.each(['emergency_now', 'same_day_clinician_review'] as const)(
    'retains a governed %s hold only from typed triage start errors',
    (safetyPathway) => {
      const error = new TriageStartError('Synthetic governed hold.', {
        reason: 'synthetic_safety_hold',
        safetyPathway,
        immediateActionRequired: true,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
      })

      expect(retainedSafetyHoldFromError(error)).toStrictEqual({
        carePathway: safetyPathway,
        outpatientScoringBlocked: true,
        humanReviewHold: true,
      })
    },
  )

  it('preserves the typed safety error identity across the transport boundary', async () => {
    const error = new TriageStartError('Synthetic emergency start hold.', {
      safetyPathway: 'emergency_now',
      immediateActionRequired: true,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
    })
    const transport = vi.fn(
      async (): Promise<never> => {
        throw error
      },
    )

    let caught: unknown
    try {
      await triageBoundExtraction(completedExtraction(), transport)
    } catch (transportError) {
      caught = transportError
    }

    expect(caught).toBe(error)
    expect(retainedSafetyHoldFromError(caught)).toStrictEqual({
      carePathway: 'emergency_now',
      outpatientScoringBlocked: true,
      humanReviewHold: true,
    })
  })

  it('does not trust an untyped lookalike error carrying forged safety fields', () => {
    expect(
      retainedSafetyHoldFromError(
        Object.assign(new Error('Synthetic untyped failure.'), {
          name: 'TriageStartError',
          safetyPathway: 'emergency_now',
          immediateActionRequired: true,
          outpatientScoringBlocked: true,
        }),
      ),
    ).toBeNull()
  })

  it('does not manufacture a pathway from a typed pathless hold', () => {
    const error = new TriageStartError('Synthetic pathless hold.', {
      immediateActionRequired: false,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
    })

    expect(retainedSafetyHoldFromError(error)).toBeNull()
  })
})
