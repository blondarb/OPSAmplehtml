import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import ExtractionIngressSafetyAlert, {
  retainExtractionIngressSafetyNotice,
} from '@/components/triage/ExtractionIngressSafetyAlert'
import TriageOutputPanel from '@/components/triage/TriageOutputPanel'
import {
  coordinateCompletedExtraction,
  triageBoundExtraction,
} from '@/lib/triage/canonicalReferralCoordinator'
import { parseUploadedFile, type ParsedFile } from '@/lib/triage/fileParser'
import { TriageStartError } from '@/lib/triage/pollClient'
import { triageOutputPolicy } from '@/lib/triage/triageOutputPolicy'
import type { ClinicalExtraction, TriageResult } from '@/lib/triage/types'

const FIXTURE_PATH = resolve(
  process.cwd(),
  'public/samples/triage/outpatient/09_Washington_Eugene.pdf',
)

let parsedPdf: ParsedFile

function completeSourceBoundExtraction(input: {
  extractionId: string
  sourceFilename?: string
}): ClinicalExtraction {
  return {
    extraction_id: input.extractionId,
    note_type_detected: 'referral',
    extraction_confidence: 'high',
    extracted_summary:
      'Synthetic complete extraction of a resolved acute focal neurologic episode.',
    key_findings: {
      chief_complaint: 'Resolved focal neurologic episode',
      neurological_symptoms: [
        'Right facial droop',
        'Right hand numbness',
        'Expressive language difficulty',
      ],
      timeline: 'Resolved after 15-20 minutes.',
      relevant_history: 'Atrial fibrillation with an anticoagulation gap.',
      medications_and_therapies: ['Apixaban'],
      failed_therapies: [],
      imaging_results: [],
      red_flags_noted: ['Acute focal neurologic episode'],
      functional_status: 'Returned to baseline.',
    },
    original_text_length: parsedPdf.text.length,
    ...(input.sourceFilename
      ? { source_filename: input.sourceFilename }
      : {}),
    ingestion_mode: 'single_pass',
    coverage_status: 'complete',
    packet_safety: {
      care_pathway: 'emergency_now',
      review_requirement: 'emergency_action',
      clinician_hold: true,
      signals: [
        {
          code: 'NEURO_EMERGENCY_ACUTE_CEREBROVASCULAR',
          syndrome: 'acute_cerebrovascular',
          action: 'emergency_now',
          evidence: [
            {
              quote:
                'Episode of acute-onset right facial droop, right hand numbness, and expressive language difficulty',
              documentId: null,
              pageNumber: null,
              startOffset: 0,
              endOffset: 105,
            },
          ],
        },
      ],
    },
  }
}

function deterministicResult(): TriageResult {
  return {
    session_id: 'triage-controlled-parity',
    triage_tier: 'emergent',
    triage_tier_display: 'Emergent',
    confidence: 'high',
    dimension_scores: {
      symptom_acuity: {
        score: 5,
        rationale: 'Synthetic acute focal neurologic episode.',
      },
      diagnostic_concern: {
        score: 5,
        rationale: 'Synthetic cerebrovascular concern.',
      },
      rate_of_progression: {
        score: 4,
        rationale: 'Abrupt episode requires immediate action.',
      },
      functional_impairment: {
        score: 4,
        rationale: 'Transient loss of hand and language function.',
      },
      red_flag_presence: {
        score: 5,
        rationale: 'Acute focal deficits are a red flag.',
      },
    },
    weighted_score: 4.65,
    red_flag_override: true,
    emergent_override: true,
    emergent_reason:
      'Synthetic resolved acute focal neurologic episode requires emergency evaluation.',
    insufficient_data: false,
    missing_information: [
      'Synthetic exact symptom-onset timestamp requires confirmation.',
    ],
    clinical_reasons: [
      'Acute focal neurologic symptoms occurred during an anticoagulation gap.',
    ],
    red_flags: ['Resolved facial droop, hand numbness, and aphasia.'],
    suggested_workup: ['Synthetic outpatient MRI before clinic.'],
    failed_therapies: [],
    subspecialty_recommendation: 'Stroke',
    subspecialty_rationale: 'Synthetic outpatient routing must be suppressed.',
    redirect_to_non_neuro: false,
    redirect_specialty: null,
    redirect_rationale: null,
    disclaimer: 'Synthetic teaching result.',
    care_pathway: 'emergency_now',
    data_quality: 'conflicting',
    coverage_status: 'complete',
    review_requirement: 'emergency_action',
    workflow_status: 'emergency_hold',
    scheduling_locked: true,
    outpatient_finalization_allowed: false,
    safety_review: null,
  }
}

function normalizeSafetyMarkup(markup: string): string {
  return markup.replace(/\s+/g, ' ').trim()
}

beforeAll(async () => {
  const fixtureBytes = await readFile(FIXTURE_PATH)
  parsedPdf = await parseUploadedFile(
    new File([fixtureBytes], '09_Washington_Eugene.pdf', {
      type: 'application/pdf',
    }),
  )
})

describe('canonical complete-result paste/PDF runtime parity', () => {
  it('coordinates different source identities into the same controlled full result', async () => {
    expect(parsedPdf.pages).toHaveLength(2)
    expect(parsedPdf.text).toBe(
      parsedPdf.pages.map((page) => page.text).join('\n\n'),
    )

    const pastedExtraction = completeSourceBoundExtraction({
      extractionId: 'extraction-controlled-paste',
    })
    const pdfExtraction = completeSourceBoundExtraction({
      extractionId: 'extraction-controlled-pdf',
      sourceFilename: '09_Washington_Eugene.pdf',
    })
    const pastedCoordination = coordinateCompletedExtraction(pastedExtraction)
    const pdfCoordination = coordinateCompletedExtraction(pdfExtraction)

    expect(pastedCoordination.decision).toStrictEqual(pdfCoordination.decision)
    expect(pastedCoordination.decision).toMatchObject({
      nextStep: 'triage',
      immediateCarePathway: 'emergency_now',
      humanReviewHold: true,
    })
    expect(pastedCoordination.triageRequest).toStrictEqual({
      source_extraction_id: 'extraction-controlled-paste',
      source_type: 'paste',
    })
    expect(pdfCoordination.triageRequest).toStrictEqual({
      source_extraction_id: 'extraction-controlled-pdf',
      source_type: 'pdf',
    })

    const transport = vi.fn(async () => deterministicResult())
    const [pastedResult, pdfResult] = await Promise.all([
      triageBoundExtraction(pastedExtraction, transport),
      triageBoundExtraction(pdfExtraction, transport),
    ])

    expect(transport.mock.calls.map(([request]) => request)).toStrictEqual([
      {
        source_extraction_id: 'extraction-controlled-paste',
        source_type: 'paste',
      },
      {
        source_extraction_id: 'extraction-controlled-pdf',
        source_type: 'pdf',
      },
    ])
    expect(triageOutputPolicy(pastedResult)).toStrictEqual(
      triageOutputPolicy(pdfResult),
    )
    expect(triageOutputPolicy(pdfResult)).toMatchObject({
      timeframe: 'Emergency evaluation now',
      requiresHumanReviewHold: true,
      schedulingLocked: true,
      showPreVisitWorkup: false,
      showOutpatientRouting: false,
    })

    const pastedMarkup = renderToStaticMarkup(
      <TriageOutputPanel
        result={pastedResult}
        onTryAnother={() => undefined}
      />,
    )
    const pdfMarkup = renderToStaticMarkup(
      <TriageOutputPanel result={pdfResult} onTryAnother={() => undefined} />,
    )

    expect(normalizeSafetyMarkup(pastedMarkup)).toBe(
      normalizeSafetyMarkup(pdfMarkup),
    )
    for (const markup of [pastedMarkup, pdfMarkup]) {
      expect(markup).toContain('Triage Recommendation')
      expect(markup).toContain('Dimension Scores')
      expect(markup).toContain('Emergency evaluation now')
      expect(markup).toContain('Closed-loop emergency action')
      expect(markup).toContain('Missing information — active action remains')
      expect(markup).toContain('Human review hold')
      expect(markup).toContain('Scheduling remains locked.')
      expect(markup).not.toContain('Batch Triage Results')
      expect(markup).not.toContain('New Batch')
      expect(markup).not.toContain('Suggested Pre-Visit Workup')
      expect(markup).not.toContain('Subspecialty Routing')
    }
  })

  it('renders a structured missing-summary emergency as an immediate human-review hold', () => {
    const structuredError = new TriageStartError(
      'The authoritative source extraction summary is missing.',
      {
        reason: 'source_extraction_summary_missing',
        safetyPathway: 'emergency_now',
        immediateActionRequired: true,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
      },
    )
    const notice = retainExtractionIngressSafetyNotice(null, structuredError)

    expect(notice).toMatchObject({
      immediateReviewRequired: true,
      safetyPathway: 'emergency_now',
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
      holdReason: 'source_extraction_summary_missing',
    })
    expect(notice).not.toBeNull()
    if (!notice) return

    const markup = renderToStaticMarkup(
      <ExtractionIngressSafetyAlert
        immediateReviewRequired={notice.immediateReviewRequired}
        safetyTriageSessionId={notice.safetyTriageSessionId}
        safetyPathway={notice.safetyPathway}
        outpatientScoringBlocked={notice.outpatientScoringBlocked}
        humanReviewRequired={notice.humanReviewRequired}
        schedulingLocked={notice.schedulingLocked}
        holdReason={notice.holdReason}
      />,
    )

    expect(markup).toContain('Emergency evaluation now')
    expect(markup).toContain(
      'Missing extraction data does not weaken this action',
    )
    expect(markup).toContain('Outpatient/model scoring is blocked')
    expect(markup).toContain('maintain the manual safety hold')
    expect(markup).not.toContain('An unexpected error occurred')
  })
})
