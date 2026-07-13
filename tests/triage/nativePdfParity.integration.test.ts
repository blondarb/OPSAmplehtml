import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { parseUploadedFile, type ParsedFile } from '@/lib/triage/fileParser'
import {
  buildLongPacketIngestionArtifacts,
  longPacketSourceDigest,
  type LongPacketIngestionArtifacts,
} from '@/lib/triage/longPacketIngestion'
import { assertCompleteLongPacketCoverage } from '@/lib/triage/longPacketPlanner'
import { nextStepAfterExtraction } from '@/lib/triage/referralFlowPolicy'
import { FILE_CONSTRAINTS, type ClinicalExtraction } from '@/lib/triage/types'

const FIXTURE_PATH = resolve(
  process.cwd(),
  'public/samples/triage/outpatient/09_Washington_Eugene.pdf',
)

let parsedPdf: ParsedFile

function reconstructSource(
  artifacts: LongPacketIngestionArtifacts,
): string {
  return artifacts.sourcePages.map((page) => page.text).join('\n\n')
}

function completeExtraction(
  extractionId: string,
  artifacts: LongPacketIngestionArtifacts,
  sourceFilename?: string,
): ClinicalExtraction {
  return {
    extraction_id: extractionId,
    note_type_detected: 'referral',
    extraction_confidence: 'high',
    extracted_summary:
      'Synthetic source-bound summary of a resolved focal neurologic episode.',
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
    ...(sourceFilename ? { source_filename: sourceFilename } : {}),
    ingestion_mode: artifacts.ingestionMode,
    coverage_status: 'complete',
    packet_safety: {
      care_pathway: artifacts.emergency.carePathway,
      review_requirement: artifacts.emergency.reviewRequirement,
      clinician_hold: artifacts.emergency.schedulingLocked,
      signals: artifacts.emergency.signals.map((signal) => ({
        code: signal.code,
        syndrome: signal.syndrome,
        action: signal.action,
        evidence: signal.evidence.map((evidence) => ({
          quote: evidence.quote,
          documentId: evidence.documentId,
          pageNumber: evidence.pageNumber,
          startOffset: evidence.startOffset,
          endOffset: evidence.endOffset,
        })),
      })),
    },
  }
}

beforeAll(async () => {
  const fixtureBytes = await readFile(FIXTURE_PATH)
  parsedPdf = await parseUploadedFile(
    new File([fixtureBytes], '09_Washington_Eugene.pdf', {
      type: 'application/pdf',
    }),
  )
})

describe('native PDF and exact-paste canonical parity', () => {
  it('parses every real native-text page and retains the late focal episode', () => {
    expect(parsedPdf.sourceType).toBe('pdf')
    expect(parsedPdf.pages).toHaveLength(2)
    expect(parsedPdf.pages.map((page) => page.pageNumber)).toStrictEqual([1, 2])
    expect(parsedPdf.pages.every((page) => page.extractionMethod === 'native_text'))
      .toBe(true)
    expect(parsedPdf.pages[1]?.text).toContain('Probable TIA')
    expect(parsedPdf.pages[1]?.text).toContain(
      'acute-onset right facial droop, right hand numbness, and expressive language difficulty',
    )
    expect(parsedPdf.text).toBe(
      parsedPdf.pages.map((page) => page.text).join('\n\n'),
    )
  })

  it('keeps PDF pages and exact pasted text on one complete deterministic pathway', () => {
    const pdfArtifacts = buildLongPacketIngestionArtifacts({
      packetId: 'packet-shared-source',
      documentId: 'document-shared-source',
      text: parsedPdf.text,
      pages: parsedPdf.pages,
      singlePassCharacterLimit: FILE_CONSTRAINTS.MAX_TEXT_LENGTH,
    })
    const pasteArtifacts = buildLongPacketIngestionArtifacts({
      packetId: 'packet-shared-source',
      documentId: 'document-shared-source',
      text: parsedPdf.text,
      singlePassCharacterLimit: FILE_CONSTRAINTS.MAX_TEXT_LENGTH,
    })

    expect(reconstructSource(pdfArtifacts)).toBe(parsedPdf.text)
    expect(reconstructSource(pasteArtifacts)).toBe(parsedPdf.text)
    expect(assertCompleteLongPacketCoverage(
      pdfArtifacts.plan,
      pdfArtifacts.documents,
    )).toStrictEqual(pdfArtifacts.plan.coverage)
    expect(assertCompleteLongPacketCoverage(
      pasteArtifacts.plan,
      pasteArtifacts.documents,
    )).toStrictEqual(pasteArtifacts.plan.coverage)
    expect(pdfArtifacts.plan.coverage).toMatchObject({
      status: 'complete',
      uncoveredCharacterCount: 0,
      documentCount: 1,
      pageCount: 2,
    })
    expect(pasteArtifacts.plan.coverage).toMatchObject({
      status: 'complete',
      uncoveredCharacterCount: 0,
      documentCount: 1,
      pageCount: 1,
    })

    for (const artifacts of [pdfArtifacts, pasteArtifacts]) {
      expect(artifacts.sourceSha256).toMatch(/^[a-f0-9]{64}$/)
      expect(artifacts.sourceSha256).toBe(
        longPacketSourceDigest(artifacts.plan.packetId, artifacts.sourcePages),
      )
      expect(artifacts.emergency).toMatchObject({
        status: 'completed',
        carePathway: 'emergency_now',
        reviewRequirement: 'emergency_action',
        schedulingLocked: true,
      })
      expect(
        artifacts.emergency.signals.some(
          (signal) =>
            signal.syndrome === 'acute_cerebrovascular' &&
            signal.evidence.some((evidence) =>
              evidence.quote.includes('acute-onset right facial droop'),
            ),
        ),
      ).toBe(true)
    }

    // Page-aware source identity is deliberately part of the durable digest.
    expect(pdfArtifacts.sourceSha256).not.toBe(pasteArtifacts.sourceSha256)

    const pdfDecision = nextStepAfterExtraction(
      completeExtraction(
        'extraction-real-pdf',
        pdfArtifacts,
        '09_Washington_Eugene.pdf',
      ),
    )
    const pasteDecision = nextStepAfterExtraction(
      completeExtraction('extraction-exact-paste', pasteArtifacts),
    )

    expect(pdfDecision).toStrictEqual(pasteDecision)
    expect(pdfDecision).toMatchObject({
      nextStep: 'triage',
      immediateCarePathway: 'emergency_now',
      humanReviewHold: true,
    })
  })

  it('keeps the production page contract single-referral with no batch branch', () => {
    const pageSource = readFileSync(
      resolve(process.cwd(), 'src/app/triage/page.tsx'),
      'utf8',
    )

    expect(pageSource).toContain('coordinateCompletedExtraction(')
    expect(pageSource).toContain('<TriageOutputPanel')
    expect(pageSource).not.toContain("setPageState('batch')")
    expect(pageSource).not.toContain('<BatchResultsPanel')
    expect(pageSource).not.toContain('batchItems')
  })
})
