import type { SQSEvent, SQSRecord } from 'aws-lambda'
import { describe, expect, it, vi } from 'vitest'

import type { ScannedPacketJobBinding } from '@/lib/triage/scannedPacketAws'
import { processScannedPacketSqsEvent } from '@/workers/triageScannedPacketWorkerCore'

const INGESTION_ID = '05240000-0000-4000-8000-000000000101'
const UPLOAD_SESSION_ID = '05240000-0000-4000-8000-000000000102'
const JOB_ID = 'opaqueTextractJob_1'
const BUCKET = 'synthetic-neurology-packets'
const COMPOSITE_CHECKSUM = `${Buffer.alloc(32, 3).toString('base64')}-2`

function binding(overrides: Record<string, unknown> = {}): ScannedPacketJobBinding {
  return {
    version: 'neurology-scanned-packet-job-binding-v1',
    ingestionId: INGESTION_ID,
    uploadSessionId: UPLOAD_SESSION_ID,
    declaredPageCount: 2,
    trustedPageCount: 2,
    source: {
      bucket: BUCKET,
      key: `quarantine/${INGESTION_ID}/source.pdf`,
      versionId: 'opaque-version-1',
      sizeBytes: 8 * 1024 * 1024 + 1,
      partCount: 2,
      checksumSha256: COMPOSITE_CHECKSUM,
      contentType: 'application/pdf',
    },
    textract: {
      api: 'StartDocumentTextDetection',
      jobId: JOB_ID,
    },
    ...overrides,
  } as ScannedPacketJobBinding
}

function message(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    JobId: JOB_ID,
    Status: 'SUCCEEDED',
    API: 'StartDocumentTextDetection',
    JobTag: INGESTION_ID,
    Timestamp: 1_783_770_000_000,
    DocumentLocation: {
      S3Bucket: BUCKET,
      S3ObjectName: `quarantine/${INGESTION_ID}/source.pdf`,
    },
    ...overrides,
  })
}

function record(body = message(), messageId = 'message-1'): SQSRecord {
  return { body, messageId } as SQSRecord
}

function event(...records: SQSRecord[]): SQSEvent {
  return { Records: records }
}

function pageResponse(input: {
  page: number
  pages?: number
  text?: string
  nextToken?: string
  jobStatus?: string
  warnings?: unknown[]
}) {
  const blocks: Array<Record<string, unknown>> = [
    { BlockType: 'PAGE', Page: input.page, Id: `page-${input.page}` },
  ]
  if (input.text !== undefined) {
    blocks.push({
      BlockType: 'LINE',
      Page: input.page,
      Id: `line-${input.page}`,
      Text: input.text,
      Confidence: 96,
    })
  }
  return {
    JobStatus: input.jobStatus ?? 'SUCCEEDED',
    DocumentMetadata: { Pages: input.pages ?? 2 },
    Blocks: blocks,
    ...(input.nextToken ? { NextToken: input.nextToken } : {}),
    ...(input.warnings ? { Warnings: input.warnings } : {}),
  }
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const responses = [
    pageResponse({ page: 1, text: 'Synthetic first page', nextToken: 'next-1' }),
    pageResponse({ page: 2, text: 'Synthetic second page' }),
  ]
  let responseIndex = 0
  return {
    loadBinding: vi.fn(async () => binding()),
    getResultPage: vi.fn(async () => responses[responseIndex++]),
    persistManifest: vi.fn(async () => 'created' as const),
    persistReviewOutcome: vi.fn(async () => 'created' as const),
    maxResultRequests: 20,
    ...overrides,
  }
}

describe('scanned-packet completion worker core', () => {
  it('loads the exact binding, retrieves every result page, and persists one complete manifest', async () => {
    const deps = dependencies()

    await expect(
      processScannedPacketSqsEvent(event(record()), deps),
    ).resolves.toEqual({ batchItemFailures: [] })

    expect(deps.loadBinding).toHaveBeenCalledWith(INGESTION_ID)
    expect(deps.getResultPage).toHaveBeenNthCalledWith(1, {
      jobId: JOB_ID,
      nextToken: undefined,
    })
    expect(deps.getResultPage).toHaveBeenNthCalledWith(2, {
      jobId: JOB_ID,
      nextToken: 'next-1',
    })
    expect(deps.persistManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        binding: expect.objectContaining({ ingestionId: INGESTION_ID }),
        manifest: expect.objectContaining({
          pageCount: 2,
          coverageStatus: 'complete',
          dataQualityStatus: 'complete',
          humanReviewRequired: false,
        }),
      }),
    )
    expect(deps.persistReviewOutcome).not.toHaveBeenCalled()
  })

  it('persists a page-preserving review manifest when one PAGE block is blank', async () => {
    const responses = [
      pageResponse({ page: 1, text: 'Synthetic first page', nextToken: 'next' }),
      pageResponse({ page: 2 }),
    ]
    let index = 0
    const deps = dependencies({
      getResultPage: vi.fn(async () => responses[index++]),
    })

    const result = await processScannedPacketSqsEvent(event(record()), deps)

    expect(result.batchItemFailures).toEqual([])
    expect(deps.persistManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: expect.objectContaining({
          pageCount: 2,
          humanReviewRequired: true,
          coverageStatus: 'incomplete',
          pages: expect.arrayContaining([
            expect.objectContaining({
              pageNumber: 2,
              status: 'blank_or_unreadable',
              text: '',
            }),
          ]),
        }),
      }),
    )
  })

  it.each(['FAILED', 'ERROR'])('records %s as human review without fetching results', async (status) => {
    const deps = dependencies()
    const result = await processScannedPacketSqsEvent(
      event(record(message({ Status: status }))),
      deps,
    )

    expect(result.batchItemFailures).toEqual([])
    expect(deps.getResultPage).not.toHaveBeenCalled()
    expect(deps.persistManifest).not.toHaveBeenCalled()
    expect(deps.persistReviewOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: expect.objectContaining({
          ingestionId: INGESTION_ID,
          disposition: 'human_review_required',
          reasonCode: status === 'FAILED' ? 'textract_failed' : 'textract_error',
        }),
      }),
    )
  })

  it('stops and records review on partial/warned Textract output', async () => {
    for (const response of [
      pageResponse({ page: 1, jobStatus: 'PARTIAL_SUCCESS' }),
      pageResponse({ page: 1, warnings: [{ ErrorCode: 'PAGE_UNREADABLE' }] }),
    ]) {
      const deps = dependencies({ getResultPage: vi.fn(async () => response) })
      const result = await processScannedPacketSqsEvent(event(record()), deps)
      expect(result.batchItemFailures).toEqual([])
      expect(deps.getResultPage).toHaveBeenCalledOnce()
      expect(deps.persistManifest).not.toHaveBeenCalled()
      expect(deps.persistReviewOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: expect.objectContaining({
            reasonCode: 'textract_result_incomplete',
          }),
        }),
      )
    }
  })

  it('detects repeated pagination tokens without an unbounded loop', async () => {
    const deps = dependencies({
      getResultPage: vi.fn(async () =>
        pageResponse({ page: 1, text: 'Synthetic', nextToken: 'same-token' }),
      ),
    })

    const result = await processScannedPacketSqsEvent(event(record()), deps)

    expect(result.batchItemFailures).toEqual([])
    expect(deps.getResultPage).toHaveBeenCalledTimes(2)
    expect(deps.persistReviewOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: expect.objectContaining({
          reasonCode: 'textract_pagination_invalid',
        }),
      }),
    )
  })

  it('forces review when an optional declared count disagrees with detected pages', async () => {
    const deps = dependencies({
      loadBinding: vi.fn(async () => binding({ declaredPageCount: 3 })),
    })

    const result = await processScannedPacketSqsEvent(event(record()), deps)

    expect(result.batchItemFailures).toEqual([])
    expect(deps.persistManifest).not.toHaveBeenCalled()
    expect(deps.persistReviewOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: expect.objectContaining({
          reasonCode: 'declared_page_count_mismatch',
        }),
      }),
    )
  })

  it('sends malformed, unbound, mismatched, and unpersisted records to retry/DLQ', async () => {
    const malformed = dependencies()
    const missing = dependencies({ loadBinding: vi.fn(async () => null) })
    const mismatched = dependencies({
      loadBinding: vi.fn(async () =>
        binding({ textract: { api: 'StartDocumentTextDetection', jobId: 'differentJob' } }),
      ),
    })
    const unavailable = dependencies({
      getResultPage: vi.fn(async () => {
        throw new Error('synthetic service unavailable')
      }),
    })
    const persistFailed = dependencies({
      persistManifest: vi.fn(async () => {
        throw new Error('synthetic S3 write failed')
      }),
    })

    expect(
      (await processScannedPacketSqsEvent(event(record('not-json', 'bad')), malformed))
        .batchItemFailures,
    ).toEqual([{ itemIdentifier: 'bad' }])
    expect(
      (await processScannedPacketSqsEvent(event(record(undefined, 'missing')), missing))
        .batchItemFailures,
    ).toEqual([{ itemIdentifier: 'missing' }])
    expect(
      (await processScannedPacketSqsEvent(event(record(undefined, 'mismatch')), mismatched))
        .batchItemFailures,
    ).toEqual([{ itemIdentifier: 'mismatch' }])
    expect(
      (await processScannedPacketSqsEvent(event(record(undefined, 'fetch')), unavailable))
        .batchItemFailures,
    ).toEqual([{ itemIdentifier: 'fetch' }])
    expect(
      (await processScannedPacketSqsEvent(event(record(undefined, 'persist')), persistFailed))
        .batchItemFailures,
    ).toEqual([{ itemIdentifier: 'persist' }])
  })

  it('returns only failed identifiers in a mixed batch', async () => {
    const deps = dependencies()
    const result = await processScannedPacketSqsEvent(
      event(record('bad', 'invalid'), record(undefined, 'valid')),
      deps,
    )
    expect(result).toEqual({
      batchItemFailures: [{ itemIdentifier: 'invalid' }],
    })
  })
})
