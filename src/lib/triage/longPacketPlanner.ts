import { createHash } from 'node:crypto'

import { canonicalLongPacketJSONStringify } from './longPacketCanonicalHash'

export const LONG_PACKET_PLANNER_VERSION = 'neurology-long-packet-planner-v1'
export const MIN_SCANNABLE_OCR_CONFIDENCE = 0.5

export interface LongPacketSourcePage {
  pageNumber: number
  text: string
  extractionMethod: 'native_text' | 'ocr'
  extractionConfidence: number | null
}

export interface LongPacketSourceDocument {
  packetId: string
  expectedDocumentCount: number
  documentId: string
  documentOrder: number
  expectedPageCount: number
  pages: LongPacketSourcePage[]
}

export interface LongPacketPlannerOptions {
  maxChunkCharacters: number
  overlapCharacters: number
}

// At approximately four characters per token this targets ~2,000-token chunks
// with 12.5% overlap, inside the approved 1,500-2,500 / 10-15% design range.
// Runtime model tokenization remains a later integration responsibility.
export const DEFAULT_LONG_PACKET_PLANNER_OPTIONS: LongPacketPlannerOptions =
  Object.freeze({
    maxChunkCharacters: 8_000,
    overlapCharacters: 1_000,
  })

export interface LongPacketChunkSourceSpan {
  pageId: string
  packetId: string
  documentId: string
  documentOrder: number
  pageNumber: number
  pageStartOffset: number
  pageEndOffset: number
  chunkStartOffset: number
  chunkEndOffset: number
  extractionMethod: 'native_text' | 'ocr'
  extractionConfidence: number | null
}

export interface LongPacketChunk {
  id: string
  packetId: string
  documentId: string
  documentOrder: number
  chunkIndex: number
  documentStartOffset: number
  documentEndOffset: number
  text: string
  sourceSpans: LongPacketChunkSourceSpan[]
  provenanceSha256: string
}

export interface LongPacketCoverageReport {
  status: 'complete'
  sourceCharacterCount: number
  coveredCharacterCount: number
  uncoveredCharacterCount: 0
  documentCount: number
  pageCount: number
  chunkCount: number
}

export interface LongPacketPlan {
  version: typeof LONG_PACKET_PLANNER_VERSION
  packetId: string
  options: LongPacketPlannerOptions
  chunks: LongPacketChunk[]
  coverage: LongPacketCoverageReport
}

export class LongPacketPlanningError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'INVALID_CHUNK_OPTIONS'
      | 'INVALID_PACKET_METADATA'
      | 'INVALID_DOCUMENT_METADATA'
      | 'INVALID_PAGE_METADATA'
      | 'UNSCANNABLE_PAGE'
      | 'INCOMPLETE_COVERAGE',
  ) {
    super(message)
    this.name = 'LongPacketPlanningError'
  }
}

interface DocumentPageSegment extends LongPacketSourcePage {
  logicalStartOffset: number
  logicalEndOffset: number
}

interface DocumentStream {
  text: string
  pages: DocumentPageSegment[]
}

const PAGE_SEPARATOR = '\n\n'

function stablePageId(
  packetId: string,
  documentId: string,
  pageNumber: number,
): string {
  return [
    'long-packet-page-v1',
    encodeURIComponent(packetId),
    encodeURIComponent(documentId),
    pageNumber,
  ].join(':')
}

function validatePlannerInput(
  documents: LongPacketSourceDocument[],
  options: LongPacketPlannerOptions,
): void {
  if (
    !Number.isSafeInteger(options.maxChunkCharacters) ||
    options.maxChunkCharacters < 2 ||
    !Number.isSafeInteger(options.overlapCharacters) ||
    options.overlapCharacters < 1 ||
    options.overlapCharacters >= options.maxChunkCharacters
  ) {
    throw new LongPacketPlanningError(
      'Chunk size must be a positive integer and overlap must be a smaller positive integer.',
      'INVALID_CHUNK_OPTIONS',
    )
  }

  if (documents.length === 0) {
    throw new LongPacketPlanningError(
      'A long packet must contain at least one source document.',
      'INVALID_PACKET_METADATA',
    )
  }

  const packetId = documents[0].packetId
  const expectedDocumentCount = documents[0].expectedDocumentCount
  if (
    !packetId?.trim() ||
    !Number.isSafeInteger(expectedDocumentCount) ||
    expectedDocumentCount < 1 ||
    documents.length !== expectedDocumentCount ||
    documents.some(
      (document) =>
        !document.packetId?.trim() ||
        document.packetId !== packetId ||
        document.expectedDocumentCount !== expectedDocumentCount,
    )
  ) {
    throw new LongPacketPlanningError(
      'Packet identity and expected document count must reconcile before long-packet planning.',
      'INVALID_PACKET_METADATA',
    )
  }

  const orderedDocuments = [...documents].sort(
    (left, right) => left.documentOrder - right.documentOrder,
  )
  const documentIds = new Set<string>()
  for (const [index, document] of orderedDocuments.entries()) {
    if (
      !document.documentId?.trim() ||
      documentIds.has(document.documentId) ||
      !Number.isSafeInteger(document.documentOrder) ||
      document.documentOrder !== index + 1
    ) {
      throw new LongPacketPlanningError(
        'Document identifiers must be non-empty and unique, and document order must be contiguous from 1.',
        'INVALID_DOCUMENT_METADATA',
      )
    }
    documentIds.add(document.documentId)
  }

  for (const document of documents) {
    const pageNumbers = document.pages
      .map((page) => page.pageNumber)
      .sort((left, right) => left - right)
    const pagesAreComplete =
      Number.isSafeInteger(document.expectedPageCount) &&
      document.expectedPageCount > 0 &&
      document.pages.length === document.expectedPageCount &&
      pageNumbers.every((pageNumber, index) => pageNumber === index + 1)

    if (!pagesAreComplete) {
      throw new LongPacketPlanningError(
        `Document ${document.documentId || '(missing id)'} does not contain exactly pages 1 through ${document.expectedPageCount}.`,
        'INVALID_PAGE_METADATA',
      )
    }

    for (const page of document.pages) {
      const invalidConfidence =
        page.extractionConfidence !== null &&
        (!Number.isFinite(page.extractionConfidence) ||
          page.extractionConfidence < 0 ||
          page.extractionConfidence > 1)
      if (invalidConfidence) {
        throw new LongPacketPlanningError(
          `Document ${document.documentId} page ${page.pageNumber} has invalid extraction confidence metadata.`,
          'INVALID_PAGE_METADATA',
        )
      }
      if (
        !page.text.trim() ||
        (page.extractionMethod === 'ocr' &&
          (page.extractionConfidence === null ||
            page.extractionConfidence < MIN_SCANNABLE_OCR_CONFIDENCE))
      ) {
        throw new LongPacketPlanningError(
          `Document ${document.documentId} page ${page.pageNumber} needs successful extraction or OCR before emergency scanning.`,
          'UNSCANNABLE_PAGE',
        )
      }
    }
  }
}

function buildDocumentStream(document: LongPacketSourceDocument): DocumentStream {
  let text = ''
  const pages: DocumentPageSegment[] = []

  for (const [index, page] of [...document.pages]
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .entries()) {
    if (index > 0) text += PAGE_SEPARATOR
    const logicalStartOffset = text.length
    text += page.text
    pages.push({
      ...page,
      logicalStartOffset,
      logicalEndOffset: text.length,
    })
  }

  return { text, pages }
}

function sourceSpansForWindow(
  document: LongPacketSourceDocument,
  stream: DocumentStream,
  windowStart: number,
  windowEnd: number,
): LongPacketChunkSourceSpan[] {
  const spans: LongPacketChunkSourceSpan[] = []

  for (const page of stream.pages) {
    const logicalStart = Math.max(windowStart, page.logicalStartOffset)
    const logicalEnd = Math.min(windowEnd, page.logicalEndOffset)
    if (logicalEnd <= logicalStart) continue

    spans.push({
      pageId: stablePageId(
        document.packetId,
        document.documentId,
        page.pageNumber,
      ),
      packetId: document.packetId,
      documentId: document.documentId,
      documentOrder: document.documentOrder,
      pageNumber: page.pageNumber,
      pageStartOffset: logicalStart - page.logicalStartOffset,
      pageEndOffset: logicalEnd - page.logicalStartOffset,
      chunkStartOffset: logicalStart - windowStart,
      chunkEndOffset: logicalEnd - windowStart,
      extractionMethod: page.extractionMethod,
      extractionConfidence: page.extractionConfidence,
    })
  }

  return spans
}

function selectWindowEnd(
  stream: DocumentStream,
  windowStart: number,
  options: LongPacketPlannerOptions,
): number {
  const hardEnd = Math.min(
    stream.text.length,
    windowStart + options.maxChunkCharacters,
  )
  if (hardEnd === stream.text.length) return hardEnd

  const minimumUsefulLength = Math.max(
    options.overlapCharacters + 1,
    Math.floor(options.maxChunkCharacters * 0.6),
  )
  const preferredPageBoundary = stream.pages
    .map((page) => page.logicalEndOffset)
    .filter(
      (offset) =>
        offset <= hardEnd && offset - windowStart >= minimumUsefulLength,
    )
    .at(-1)

  return preferredPageBoundary ?? hardEnd
}

function stableChunkId(
  document: LongPacketSourceDocument,
  chunkIndex: number,
  spans: LongPacketChunkSourceSpan[],
): string {
  const first = spans[0]
  const last = spans.at(-1)
  return [
    LONG_PACKET_PLANNER_VERSION,
    encodeURIComponent(document.packetId),
    document.documentOrder,
    encodeURIComponent(document.documentId),
    chunkIndex,
    `p${first.pageNumber}-${first.pageStartOffset}`,
    `p${last?.pageNumber}-${last?.pageEndOffset}`,
  ].join(':')
}

export function longPacketChunkProvenanceDigest(
  chunk: Omit<LongPacketChunk, 'provenanceSha256'> | LongPacketChunk,
): string {
  const canonical = JSON.stringify({
    id: chunk.id,
    packetId: chunk.packetId,
    documentId: chunk.documentId,
    documentOrder: chunk.documentOrder,
    chunkIndex: chunk.chunkIndex,
    documentStartOffset: chunk.documentStartOffset,
    documentEndOffset: chunk.documentEndOffset,
    text: chunk.text,
    // Keep the v1 digest byte-compatible while normalizing JSONB object-key
    // order back to the planner's original versioned field order.
    sourceSpans: chunk.sourceSpans.map((span) => ({
      pageId: span.pageId,
      packetId: span.packetId,
      documentId: span.documentId,
      documentOrder: span.documentOrder,
      pageNumber: span.pageNumber,
      pageStartOffset: span.pageStartOffset,
      pageEndOffset: span.pageEndOffset,
      chunkStartOffset: span.chunkStartOffset,
      chunkEndOffset: span.chunkEndOffset,
      extractionMethod: span.extractionMethod,
      extractionConfidence: span.extractionConfidence,
    })),
  })
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

function mergeIntervals(
  intervals: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  const sorted = [...intervals].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  )
  const merged: Array<{ start: number; end: number }> = []

  for (const interval of sorted) {
    const previous = merged.at(-1)
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval })
    } else {
      previous.end = Math.max(previous.end, interval.end)
    }
  }

  return merged
}

export function assertCompleteLongPacketCoverage(
  plan: LongPacketPlan,
  documents: LongPacketSourceDocument[],
): LongPacketCoverageReport {
  const fail = (message: string): never => {
    throw new LongPacketPlanningError(message, 'INCOMPLETE_COVERAGE')
  }
  try {
    validatePlannerInput(documents, plan.options)
  } catch (error) {
    fail(
      error instanceof Error
        ? `Long-packet source validation failed: ${error.message}`
        : 'Long-packet source validation failed.',
    )
  }
  if (
    plan.version !== LONG_PACKET_PLANNER_VERSION ||
    plan.packetId !== documents[0].packetId
  ) {
    fail('Long-packet plan identity does not match its immutable source packet.')
  }
  const documentStreams = new Map(
    documents.map((document) => [
      `${document.packetId}\u0000${document.documentId}\u0000${document.documentOrder}`,
      { document, stream: buildDocumentStream(document) },
    ]),
  )

  for (const { document, stream } of documentStreams.values()) {
    const documentChunks = plan.chunks
      .filter(
        (chunk) =>
          chunk.packetId === document.packetId &&
          chunk.documentId === document.documentId &&
          chunk.documentOrder === document.documentOrder,
      )
      .sort((left, right) => left.chunkIndex - right.chunkIndex)
    if (documentChunks.length === 0) {
      fail(`Document ${document.documentId} has no planned chunks.`)
    }
    for (const [index, chunk] of documentChunks.entries()) {
      const expectedStart =
        index === 0
          ? 0
          : documentChunks[index - 1].documentEndOffset -
            plan.options.overlapCharacters
      if (
        chunk.chunkIndex !== index ||
        chunk.documentStartOffset !== expectedStart
      ) {
        fail(
          `Document ${document.documentId} has a gap, excessive overlap, or unstable chunk sequence.`,
        )
      }
    }
    if (documentChunks.at(-1)?.documentEndOffset !== stream.text.length) {
      fail(`Document ${document.documentId} does not reach its final source character.`)
    }
  }

  for (const chunk of plan.chunks) {
    const entry = documentStreams.get(
      `${chunk.packetId}\u0000${chunk.documentId}\u0000${chunk.documentOrder}`,
    )
    const { document, stream } =
      entry ?? fail(`Chunk ${chunk.id} does not map to a source document.`)
    if (
      !Number.isSafeInteger(chunk.documentStartOffset) ||
      !Number.isSafeInteger(chunk.documentEndOffset) ||
      chunk.documentStartOffset < 0 ||
      chunk.documentEndOffset <= chunk.documentStartOffset ||
      chunk.documentEndOffset > stream.text.length ||
      chunk.documentEndOffset - chunk.documentStartOffset >
        plan.options.maxChunkCharacters ||
      chunk.text !==
        stream.text.slice(chunk.documentStartOffset, chunk.documentEndOffset)
    ) {
      fail(`Chunk ${chunk.id} does not exactly match its immutable source window.`)
    }
    if (
      chunk.provenanceSha256 !== longPacketChunkProvenanceDigest(chunk)
    ) {
      fail(`Chunk ${chunk.id} failed its source provenance checksum.`)
    }
    const expectedSpans = sourceSpansForWindow(
      document,
      stream,
      chunk.documentStartOffset,
      chunk.documentEndOffset,
    )
    if (
      canonicalLongPacketJSONStringify(chunk.sourceSpans) !==
      canonicalLongPacketJSONStringify(expectedSpans)
    ) {
      fail(`Chunk ${chunk.id} has invalid page-level source spans.`)
    }
    if (chunk.id !== stableChunkId(document, chunk.chunkIndex, expectedSpans)) {
      fail(`Chunk ${chunk.id} has an unstable or invalid source identifier.`)
    }
  }

  let sourceCharacterCount = 0
  let coveredCharacterCount = 0
  let pageCount = 0

  for (const document of documents) {
    for (const page of document.pages) {
      sourceCharacterCount += page.text.length
      pageCount += 1
      const intervals = mergeIntervals(
        plan.chunks.flatMap((chunk) =>
          chunk.sourceSpans
            .filter(
              (span) =>
                span.packetId === document.packetId &&
                span.documentId === document.documentId &&
                span.pageNumber === page.pageNumber,
            )
            .map((span) => ({
              start: span.pageStartOffset,
              end: span.pageEndOffset,
            })),
        ),
      )

      if (
        intervals.length !== 1 ||
        intervals[0].start !== 0 ||
        intervals[0].end !== page.text.length
      ) {
        fail(
          `Long-packet coverage is incomplete for ${document.documentId} page ${page.pageNumber}`,
        )
      }
      coveredCharacterCount += intervals[0].end - intervals[0].start
    }
  }

  return {
    status: 'complete',
    sourceCharacterCount,
    coveredCharacterCount,
    uncoveredCharacterCount: 0,
    documentCount: documents.length,
    pageCount,
    chunkCount: plan.chunks.length,
  }
}

export function planLongPacketChunks(
  documents: LongPacketSourceDocument[],
  options: LongPacketPlannerOptions = DEFAULT_LONG_PACKET_PLANNER_OPTIONS,
): LongPacketPlan {
  validatePlannerInput(documents, options)
  const packetId = documents[0]?.packetId ?? ''
  const chunks: LongPacketChunk[] = []

  for (const document of [...documents].sort(
    (left, right) => left.documentOrder - right.documentOrder,
  )) {
    const stream = buildDocumentStream(document)
    let windowStart = 0
    let chunkIndex = 0

    while (windowStart < stream.text.length) {
      const windowEnd = selectWindowEnd(stream, windowStart, options)
      const sourceSpans = sourceSpansForWindow(
        document,
        stream,
        windowStart,
        windowEnd,
      )
      if (sourceSpans.length > 0) {
        const chunkWithoutDigest: Omit<LongPacketChunk, 'provenanceSha256'> = {
          id: stableChunkId(document, chunkIndex, sourceSpans),
          packetId: document.packetId,
          documentId: document.documentId,
          documentOrder: document.documentOrder,
          chunkIndex,
          documentStartOffset: windowStart,
          documentEndOffset: windowEnd,
          text: stream.text.slice(windowStart, windowEnd),
          sourceSpans,
        }
        chunks.push({
          ...chunkWithoutDigest,
          provenanceSha256:
            longPacketChunkProvenanceDigest(chunkWithoutDigest),
        })
        chunkIndex += 1
      }

      if (windowEnd === stream.text.length) break
      windowStart = windowEnd - options.overlapCharacters
    }
  }

  const provisionalPlan: LongPacketPlan = {
    version: LONG_PACKET_PLANNER_VERSION,
    packetId,
    options: { ...options },
    chunks,
    coverage: {
      status: 'complete',
      sourceCharacterCount: 0,
      coveredCharacterCount: 0,
      uncoveredCharacterCount: 0,
      documentCount: documents.length,
      pageCount: 0,
      chunkCount: chunks.length,
    },
  }
  provisionalPlan.coverage = assertCompleteLongPacketCoverage(
    provisionalPlan,
    documents,
  )
  return provisionalPlan
}
