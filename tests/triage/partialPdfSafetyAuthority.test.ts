import { describe, expect, it } from 'vitest'

import {
  screenPartialPdfEmergencyGateway,
  validatePersistedPartialPdfSafety,
} from '@/lib/triage/partialPdfSafetyAuthority'
import type { PartialParsedFile } from '@/lib/triage/fileParser'

function partialPdf(
  pages: Array<{ pageNumber: number; text: string }>,
  missingPageNumbers: number[],
  filename = 'synthetic-partial.pdf',
): PartialParsedFile {
  return {
    sourceType: 'pdf',
    filename,
    originalSize: 1,
    pages: pages.map((page) => ({
      ...page,
      extractionMethod: 'native_text',
      extractionConfidence: null,
    })),
    text: pages.map((page) => page.text).join('\n\n'),
    totalPageCount: pages.length + missingPageNumbers.length,
    missingPageNumbers,
  }
}

function persistedPartialPdfRow(
  partial: PartialParsedFile,
  packetEmergencyResult: unknown,
) {
  const sourcePages = partial.pages.map((page) => ({
    documentId: 'document-1',
    ...page,
  }))
  return {
    coverage_status: 'failed',
    text_input: partial.text,
    source_pages: sourcePages,
    coverage_report: {
      status: 'failed',
      reason: 'ocr_required',
      totalPageCount: partial.totalPageCount,
      availablePageNumbers: sourcePages.map((page) => page.pageNumber),
      missingPageNumbers: partial.missingPageNumbers,
      nativeTextCharacterCount: partial.text.length,
    },
    original_text_length: partial.text.length,
    ingestion_mode: 'legacy_unknown',
    packet_plan: null,
    source_sha256: null,
    source_filename: partial.filename.trim(),
    packet_emergency_result: packetEmergencyResult,
  }
}

function expectPageBoundEvidence(
  partial: PartialParsedFile,
  evidence: {
    pageNumber: number | null
    startOffset: number
    endOffset: number
    quote: string
  },
) {
  const page = partial.pages.find(
    (candidate) => candidate.pageNumber === evidence.pageNumber,
  )
  expect(page).toBeDefined()
  expect(Number.isSafeInteger(evidence.startOffset)).toBe(true)
  expect(Number.isSafeInteger(evidence.endOffset)).toBe(true)
  expect(evidence.startOffset).toBeGreaterThanOrEqual(0)
  expect(evidence.endOffset).toBeGreaterThan(evidence.startOffset)
  expect(evidence.endOffset).toBeLessThanOrEqual(page!.text.length)
  expect(page!.text.slice(evidence.startOffset, evidence.endOffset)).toBe(
    evidence.quote,
  )
}

describe('partial PDF safety authority', () => {
  it('detects a current emergency across a long contiguous page boundary without losing remote acuity context', () => {
    const firstPage =
      'The patient suddenly developed ' + 'progress note filler '.repeat(40)
    const secondPage = 'aphasia.'
    const partial = partialPdf(
      [
        { pageNumber: 1, text: firstPage.trim() },
        { pageNumber: 2, text: secondPage },
      ],
      [3],
    )

    const result = screenPartialPdfEmergencyGateway(partial)

    expect(result).toMatchObject({
      kind: 'valid',
      gateway: { carePathway: 'emergency_now' },
    })
    if (result.kind !== 'valid' || !result.gateway) {
      throw new Error('Expected a source-bound emergency gateway.')
    }
    const evidence = result.gateway.signals.flatMap(
      (signal) => signal.evidence,
    )
    expect(evidence.map((item) => item.pageNumber)).toEqual(
      expect.arrayContaining([1, 2]),
    )
    for (const item of evidence) expectPageBoundEvidence(partial, item)
  })

  it('does not promote a cross-page family-history statement when its heading is more than 512 characters away', () => {
    const partial = partialPdf(
      [
        {
          pageNumber: 1,
          text:
            'Family history: mother had ' +
            'stable background '.repeat(40) +
            'sudden',
        },
        { pageNumber: 2, text: 'aphasia.' },
      ],
      [3],
    )

    expect(screenPartialPdfEmergencyGateway(partial)).toMatchObject({
      kind: 'valid',
      sourceFilename: 'synthetic-partial.pdf',
    })
    expect(screenPartialPdfEmergencyGateway(partial)).not.toHaveProperty(
      'gateway',
    )
  })

  it('canonicalizes the uploaded filename before the same value is persisted and polled', () => {
    const partial = partialPdf(
      [
        {
          pageNumber: 1,
          text: 'Sudden aphasia and right facial droop began now.',
        },
      ],
      [2],
      ' partial-referral.PDF ',
    )

    const result = screenPartialPdfEmergencyGateway(partial)

    expect(result).toMatchObject({
      kind: 'valid',
      sourceFilename: 'partial-referral.PDF',
      gateway: { carePathway: 'emergency_now' },
    })
  })

  it.each(['{', 'not-json', 'null']) (
    'treats malformed routine artifact %s as invalid instead of absent',
    (packetEmergencyResult) => {
      const partial = partialPdf(
        [
          { pageNumber: 1, text: 'Stable native referral context.' },
          { pageNumber: 3, text: 'Routine outpatient follow up.' },
        ],
        [2],
      )

      expect(
        validatePersistedPartialPdfSafety(
          persistedPartialPdfRow(partial, packetEmergencyResult),
        ),
      ).toMatchObject({
        kind: 'invalid',
        reason: 'source_extraction_packet_safety_invalid',
      })
    },
  )

  it('bounds a 101-page positive run while preserving exact actionable evidence', () => {
    const pages = Array.from({ length: 101 }, (_, index) => ({
      pageNumber: index + 1,
      text: `Sudden aphasia began now on synthetic page ${index + 1}.`,
    }))
    const partial = partialPdf(pages, [102])

    const result = screenPartialPdfEmergencyGateway(partial)

    expect(result).toMatchObject({
      kind: 'valid',
      gateway: { carePathway: 'emergency_now' },
    })
    if (result.kind !== 'valid' || !result.gateway) {
      throw new Error('Expected a bounded emergency gateway.')
    }
    expect(result.gateway.signals.length).toBeLessThanOrEqual(16)
    expect(result.gateway.lexicalHits.length).toBeLessThanOrEqual(2_000)
    for (const signal of result.gateway.signals) {
      expect(signal.evidence.length).toBeLessThanOrEqual(32)
      for (const evidence of signal.evidence) {
        expect(evidence.quote.length).toBeLessThanOrEqual(2_000)
        expectPageBoundEvidence(partial, evidence)
      }
    }

    const persisted = persistedPartialPdfRow(partial, result.gateway)
    const validation = validatePersistedPartialPdfSafety(persisted)
    expect(validation).toMatchObject({
      kind: 'valid',
      gateway: { carePathway: 'emergency_now' },
    })
    if (validation.kind !== 'valid' || !validation.gateway) {
      throw new Error('Expected bounded persisted safety authority.')
    }
    expect(validation.gateway.signals.length).toBeLessThanOrEqual(16)
    expect(
      Math.max(
        ...validation.gateway.signals.map(
          (signal) => signal.evidence.length,
        ),
      ),
    ).toBeLessThanOrEqual(32)
  })

  it('returns an explicit invalid hold decision instead of routine absence when the partial manifest exceeds limits', () => {
    const partial = partialPdf(
      [{ pageNumber: 1, text: 'Stable native referral context.' }],
      [2],
    )
    partial.totalPageCount = 3_001

    expect(screenPartialPdfEmergencyGateway(partial)).toMatchObject({
      kind: 'invalid',
      reason: 'partial_pdf_manifest_invalid',
    })
  })

  it('applies the sentence-span budget across all noncontiguous available runs', () => {
    const manySpans = 'Stable.\n'.repeat(20_000).trim()
    const partial = partialPdf(
      [
        { pageNumber: 1, text: manySpans },
        { pageNumber: 3, text: manySpans },
        { pageNumber: 5, text: manySpans },
      ],
      [2, 4, 6],
    )

    expect(screenPartialPdfEmergencyGateway(partial)).toMatchObject({
      kind: 'invalid',
      reason: 'partial_pdf_safety_scan_failed',
    })
  })

  it('applies the lexical-hit budget globally across noncontiguous positive runs', () => {
    const positiveHits = 'Sudden aphasia began now.\n'.repeat(2_000).trim()
    const partial = partialPdf(
      [
        { pageNumber: 1, text: positiveHits },
        { pageNumber: 3, text: positiveHits },
        { pageNumber: 5, text: positiveHits },
      ],
      [2, 4, 6],
    )

    const result = screenPartialPdfEmergencyGateway(partial)

    expect(result).toMatchObject({
      kind: 'valid',
      gateway: { carePathway: 'emergency_now' },
    })
    if (result.kind !== 'valid' || !result.gateway) {
      throw new Error('Expected a bounded emergency gateway.')
    }
    expect(result.gateway.lexicalHits.length).toBeLessThanOrEqual(2_000)
  })
})
