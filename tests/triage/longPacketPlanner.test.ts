import { describe, expect, it } from 'vitest'

import {
  assertCompleteLongPacketCoverage,
  DEFAULT_LONG_PACKET_PLANNER_OPTIONS,
  LongPacketPlanningError,
  planLongPacketChunks,
  type LongPacketSourceDocument,
} from '@/lib/triage/longPacketPlanner'

function documentFixture(
  overrides: Partial<LongPacketSourceDocument> = {},
): LongPacketSourceDocument {
  return {
    packetId: 'packet-1',
    expectedDocumentCount: 1,
    documentId: 'document-1',
    documentOrder: 1,
    expectedPageCount: 2,
    pages: [
      {
        pageNumber: 1,
        text: 'Page one begins. '.repeat(8),
        extractionMethod: 'native_text',
        extractionConfidence: null,
      },
      {
        pageNumber: 2,
        text: 'Page two continues. '.repeat(8),
        extractionMethod: 'native_text',
        extractionConfidence: null,
      },
    ],
    ...overrides,
  }
}

describe('planLongPacketChunks', () => {
  it('creates bounded overlapping chunks with stable page offsets and complete source coverage', () => {
    const documents = [documentFixture()]
    const plan = planLongPacketChunks(documents, {
      maxChunkCharacters: 120,
      overlapCharacters: 24,
    })

    expect(plan.chunks.length).toBeGreaterThan(1)
    expect(plan.chunks.every((chunk) => chunk.text.length <= 120)).toBe(true)
    expect(plan.chunks.every((chunk) => chunk.sourceSpans.length > 0)).toBe(true)
    expect(plan.coverage).toMatchObject({
      status: 'complete',
      sourceCharacterCount:
        documents[0].pages[0].text.length + documents[0].pages[1].text.length,
      uncoveredCharacterCount: 0,
    })
    expect(assertCompleteLongPacketCoverage(plan, documents)).toEqual(plan.coverage)

    const repeatedPlan = planLongPacketChunks(documents, {
      maxChunkCharacters: 120,
      overlapCharacters: 24,
    })
    expect(repeatedPlan.chunks.map((chunk) => chunk.id)).toEqual(
      plan.chunks.map((chunk) => chunk.id),
    )
  })

  it.each([
    {
      name: 'a missing page number',
      document: documentFixture({
        expectedPageCount: 2,
        pages: [
          {
            pageNumber: 1,
            text: 'First page text.',
            extractionMethod: 'native_text',
            extractionConfidence: null,
          },
          {
            pageNumber: 3,
            text: 'Third page text with page two absent.',
            extractionMethod: 'native_text',
            extractionConfidence: null,
          },
        ],
      }),
    },
    {
      name: 'a duplicate page number',
      document: documentFixture({
        expectedPageCount: 2,
        pages: [
          {
            pageNumber: 1,
            text: 'First copy.',
            extractionMethod: 'native_text',
            extractionConfidence: null,
          },
          {
            pageNumber: 1,
            text: 'Second copy cannot replace page two.',
            extractionMethod: 'native_text',
            extractionConfidence: null,
          },
        ],
      }),
    },
    {
      name: 'an invalid zero page number',
      document: documentFixture({
        expectedPageCount: 1,
        pages: [
          {
            pageNumber: 0,
            text: 'Invalid page metadata.',
            extractionMethod: 'native_text',
            extractionConfidence: null,
          },
        ],
      }),
    },
  ])('fails closed when page metadata contains $name', ({ document }) => {
    expect(() =>
      planLongPacketChunks([document], {
        maxChunkCharacters: 120,
        overlapCharacters: 24,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<LongPacketPlanningError>>({
        code: 'INVALID_PAGE_METADATA',
      }),
    )
  })

  it('rejects an overlap that is not strictly smaller than the chunk bound', () => {
    expect(() =>
      planLongPacketChunks([documentFixture()], {
        maxChunkCharacters: 100,
        overlapCharacters: 100,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<LongPacketPlanningError>>({
        code: 'INVALID_CHUNK_OPTIONS',
      }),
    )
  })

  it('rejects zero overlap because it can lose a boundary-spanning emergency phrase', () => {
    expect(() =>
      planLongPacketChunks([documentFixture()], {
        maxChunkCharacters: 100,
        overlapCharacters: 0,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<LongPacketPlanningError>>({
        code: 'INVALID_CHUNK_OPTIONS',
      }),
    )
  })

  it('uses page identity and offsets rather than text search when source text repeats', () => {
    const repeated = 'Repeated copied-forward sentence. '
    const document = documentFixture({
      pages: [
        {
          pageNumber: 1,
          text: repeated.repeat(10),
          extractionMethod: 'native_text',
          extractionConfidence: null,
        },
        {
          pageNumber: 2,
          text: repeated.repeat(10),
          extractionMethod: 'native_text',
          extractionConfidence: null,
        },
      ],
    })
    const plan = planLongPacketChunks([document], {
      maxChunkCharacters: 100,
      overlapCharacters: 20,
    })

    expect(new Set(plan.chunks.map((chunk) => chunk.id)).size).toBe(
      plan.chunks.length,
    )
    const pageIds = new Set(
      plan.chunks.flatMap((chunk) =>
        chunk.sourceSpans.map((span) => span.pageId),
      ),
    )
    expect(pageIds.size).toBe(2)
    for (const chunk of plan.chunks) {
      for (const span of chunk.sourceSpans) {
        const page = document.pages.find(
          (candidate) => candidate.pageNumber === span.pageNumber,
        )
        expect(
          chunk.text.slice(span.chunkStartOffset, span.chunkEndOffset),
        ).toBe(page?.text.slice(span.pageStartOffset, span.pageEndOffset))
      }
    }
  })

  it('rejects a plan whose chunk text no longer matches the immutable source', () => {
    const documents = [documentFixture()]
    const plan = planLongPacketChunks(documents, {
      maxChunkCharacters: 120,
      overlapCharacters: 24,
    })
    const tampered = structuredClone(plan)
    tampered.chunks[0].text = `X${tampered.chunks[0].text.slice(1)}`

    expect(() =>
      assertCompleteLongPacketCoverage(tampered, documents),
    ).toThrowError(
      expect.objectContaining<Partial<LongPacketPlanningError>>({
        code: 'INCOMPLETE_COVERAGE',
      }),
    )
  })

  it('rejects a plan whose declared overlap no longer matches its source windows', () => {
    const documents = [documentFixture()]
    const plan = planLongPacketChunks(documents, {
      maxChunkCharacters: 120,
      overlapCharacters: 24,
    })
    plan.options.overlapCharacters = 1

    expect(() =>
      assertCompleteLongPacketCoverage(plan, documents),
    ).toThrowError(
      expect.objectContaining<Partial<LongPacketPlanningError>>({
        code: 'INCOMPLETE_COVERAGE',
      }),
    )
  })

  it('rejects inconsistent packet and document identity instead of fusing sources', () => {
    const secondDocument = documentFixture({
      packetId: 'different-packet',
      documentId: 'document-2',
      documentOrder: 2,
    })

    expect(() =>
      planLongPacketChunks([documentFixture(), secondDocument], {
        maxChunkCharacters: 120,
        overlapCharacters: 24,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<LongPacketPlanningError>>({
        code: 'INVALID_PACKET_METADATA',
      }),
    )
  })

  it('rejects a packet whose expected document count does not reconcile', () => {
    const incompletePacket = documentFixture({ expectedDocumentCount: 2 })

    expect(() =>
      planLongPacketChunks([incompletePacket], {
        maxChunkCharacters: 120,
        overlapCharacters: 24,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<LongPacketPlanningError>>({
        code: 'INVALID_PACKET_METADATA',
      }),
    )
  })

  it.each([
    {
      name: 'empty extracted text',
      page: {
        pageNumber: 1,
        text: '   ',
        extractionMethod: 'native_text' as const,
        extractionConfidence: null,
      },
    },
    {
      name: 'low-confidence OCR',
      page: {
        pageNumber: 1,
        text: 'Possible poorly recognized text.',
        extractionMethod: 'ocr' as const,
        extractionConfidence: 0.42,
      },
    },
    {
      name: 'OCR without confidence metadata',
      page: {
        pageNumber: 1,
        text: 'OCR text without a confidence score.',
        extractionMethod: 'ocr' as const,
        extractionConfidence: null,
      },
    },
  ])('does not silently omit or trust a page with $name', ({ page }) => {
    const document = documentFixture({
      expectedPageCount: 1,
      pages: [page],
    })

    expect(() =>
      planLongPacketChunks([document], {
        maxChunkCharacters: 120,
        overlapCharacters: 24,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<LongPacketPlanningError>>({
        code: 'UNSCANNABLE_PAGE',
      }),
    )
  })

  it('establishes complete coverage for a synthetic packet with more than 500 pages', () => {
    const pages = Array.from({ length: 520 }, (_, index) => ({
      pageNumber: index + 1,
      text: `Synthetic page ${index + 1}. Stable chronic follow-up details. `.repeat(
        20,
      ),
      extractionMethod: 'native_text' as const,
      extractionConfidence: null,
    }))
    const document = documentFixture({
      expectedPageCount: pages.length,
      pages,
    })

    const plan = planLongPacketChunks([document])

    expect(plan.coverage.pageCount).toBe(520)
    expect(plan.coverage.sourceCharacterCount).toBe(
      pages.reduce((total, page) => total + page.text.length, 0),
    )
    expect(plan.chunks.every(
      (chunk) =>
        chunk.text.length <=
        DEFAULT_LONG_PACKET_PLANNER_OPTIONS.maxChunkCharacters,
    )).toBe(true)
    expect(
      plan.chunks.some((chunk) =>
        chunk.sourceSpans.some((span) => span.pageNumber === 520),
      ),
    ).toBe(true)
  })

  it('prefers a nearby complete page boundary while retaining bounded cross-page overlap', () => {
    const firstPageText = 'A'.repeat(90)
    const secondPageText = 'B'.repeat(90)
    const document = documentFixture({
      pages: [
        {
          pageNumber: 1,
          text: firstPageText,
          extractionMethod: 'native_text',
          extractionConfidence: null,
        },
        {
          pageNumber: 2,
          text: secondPageText,
          extractionMethod: 'native_text',
          extractionConfidence: null,
        },
      ],
    })

    const plan = planLongPacketChunks([document], {
      maxChunkCharacters: 100,
      overlapCharacters: 20,
    })

    expect(plan.chunks[0].text).toBe(firstPageText)
    expect(plan.chunks[0].sourceSpans.map((span) => span.pageNumber)).toEqual([
      1,
    ])
    for (let index = 1; index < plan.chunks.length; index += 1) {
      const previous = plan.chunks[index - 1]
      const current = plan.chunks[index]
      const overlap = previous.documentEndOffset - current.documentStartOffset
      expect(overlap).toBeGreaterThanOrEqual(0)
      expect(overlap).toBeLessThanOrEqual(20)
    }
  })

  it('keeps documents separate and reports complete document-level coverage', () => {
    const first = documentFixture({
      expectedDocumentCount: 2,
      expectedPageCount: 1,
      pages: [
        {
          pageNumber: 1,
          text: 'First document source text. '.repeat(6),
          extractionMethod: 'native_text',
          extractionConfidence: null,
        },
      ],
    })
    const second = documentFixture({
      expectedDocumentCount: 2,
      documentId: 'document-2',
      documentOrder: 2,
      expectedPageCount: 1,
      pages: [
        {
          pageNumber: 1,
          text: 'Second document source text. '.repeat(6),
          extractionMethod: 'native_text',
          extractionConfidence: null,
        },
      ],
    })

    const plan = planLongPacketChunks([second, first], {
      maxChunkCharacters: 100,
      overlapCharacters: 20,
    })

    expect(plan.coverage.documentCount).toBe(2)
    expect(plan.chunks.map((chunk) => chunk.documentId)).toEqual(
      [...plan.chunks]
        .sort(
          (left, right) =>
            left.documentOrder - right.documentOrder ||
            left.chunkIndex - right.chunkIndex,
        )
        .map((chunk) => chunk.documentId),
    )
    expect(
      plan.chunks.every(
        (chunk) =>
          new Set(chunk.sourceSpans.map((span) => span.documentId)).size === 1,
      ),
    ).toBe(true)
  })
})
