import { describe, expect, it } from 'vitest'

import {
  SCANNED_PACKET_MAX_BYTES,
  SCANNED_PACKET_MAX_PAGES,
  SCANNED_PACKET_PART_BYTES,
  ScannedPacketIngestionError,
  assembleScannedPacketManifest,
  assertScannedPacketMagic,
  compositeSha256Base64,
  planScannedPacketUpload,
  toLongPacketSourcePages,
  validateScannedPacketCompletionParts,
} from '@/lib/triage/scannedPacketIngestion'

const INGESTION_ID = '05240000-0000-4000-8000-000000000101'
const UPLOAD_SESSION_ID = '05240000-0000-4000-8000-000000000102'
const SHA256_BASE64 = Buffer.alloc(32, 7).toString('base64')
const COMPOSITE_SHA256 = `${SHA256_BASE64}-1`

function block(
  BlockType: 'PAGE' | 'LINE',
  Page: number,
  Id: string,
  extra: Record<string, unknown> = {},
) {
  return { BlockType, Page, Id, ...extra }
}

function response(
  pages: number,
  blocks: ReturnType<typeof block>[],
  extra: Record<string, unknown> = {},
) {
  return {
    JobStatus: 'SUCCEEDED',
    DocumentMetadata: { Pages: pages },
    Blocks: blocks,
    ...extra,
  }
}

function manifestInput(
  responses: ReturnType<typeof response>[],
  trustedSourcePageCount = responses[0].DocumentMetadata.Pages,
) {
  return {
    ingestionId: INGESTION_ID,
    trustedSourcePageCount,
    source: {
      bucket: 'synthetic-neurology-packets',
      key: `quarantine/${INGESTION_ID}/source.pdf`,
      versionId: 'opaque-version-1',
      sizeBytes: 4096,
      partCount: 1,
      checksumSha256: COMPOSITE_SHA256,
      contentType: 'application/pdf' as const,
    },
    textract: {
      jobId: 'opaqueTextractJob_1',
      api: 'StartDocumentTextDetection' as const,
    },
    responses,
  }
}

function errorCode(error: unknown): string | undefined {
  return error instanceof ScannedPacketIngestionError ? error.code : undefined
}

describe('scanned-packet upload planning', () => {
  it('creates opaque PDF/TIFF keys and consecutive bounded multipart plans', () => {
    const plan = planScannedPacketUpload({
      ingestionId: INGESTION_ID,
      uploadSessionId: UPLOAD_SESSION_ID,
      contentType: 'application/pdf',
      sizeBytes: SCANNED_PACKET_PART_BYTES * 2 + 17,
      declaredPageCount: 12,
    })

    expect(plan).toMatchObject({
      ingestionId: INGESTION_ID,
      uploadSessionId: UPLOAD_SESSION_ID,
      sourceKey: `quarantine/${INGESTION_ID}/source.pdf`,
      resultKey: `validated/${INGESTION_ID}/pages.json`,
      bindingKey: `control/${INGESTION_ID}/binding.json`,
      contentType: 'application/pdf',
      sizeBytes: SCANNED_PACKET_PART_BYTES * 2 + 17,
      declaredPageCount: 12,
      partCount: 3,
    })
    expect(plan.parts).toEqual([
      { partNumber: 1, sizeBytes: SCANNED_PACKET_PART_BYTES },
      { partNumber: 2, sizeBytes: SCANNED_PACKET_PART_BYTES },
      { partNumber: 3, sizeBytes: 17 },
    ])
    expect(JSON.stringify(plan)).not.toContain('patient')
    expect(JSON.stringify(plan)).not.toContain('filename')

    expect(
      planScannedPacketUpload({
        ingestionId: INGESTION_ID,
        uploadSessionId: UPLOAD_SESSION_ID,
        contentType: 'image/tif',
        sizeBytes: 1,
      }).sourceKey,
    ).toBe(`quarantine/${INGESTION_ID}/source.tiff`)
  })

  it('enforces exact service size/page bounds and supported media types', () => {
    expect(() =>
      planScannedPacketUpload({
        ingestionId: INGESTION_ID,
        uploadSessionId: UPLOAD_SESSION_ID,
        contentType: 'application/pdf',
        sizeBytes: SCANNED_PACKET_MAX_BYTES,
        declaredPageCount: SCANNED_PACKET_MAX_PAGES,
      }),
    ).not.toThrow()

    for (const invalid of [
      { sizeBytes: 0 },
      { sizeBytes: SCANNED_PACKET_MAX_BYTES + 1 },
      { declaredPageCount: 0 },
      { declaredPageCount: SCANNED_PACKET_MAX_PAGES + 1 },
      { contentType: 'image/png' },
      { ingestionId: 'referral-note.pdf' },
      { uploadSessionId: 'tenant-123' },
    ]) {
      expect(() =>
        planScannedPacketUpload({
          ingestionId: INGESTION_ID,
          uploadSessionId: UPLOAD_SESSION_ID,
          contentType: 'application/pdf',
          sizeBytes: 1,
          ...invalid,
        }),
      ).toThrow(ScannedPacketIngestionError)
    }
  })

  it('requires the exact consecutive completion parts, ETags, and SHA-256 checksums', () => {
    expect(compositeSha256Base64([SHA256_BASE64, SHA256_BASE64])).toMatch(
      /^[A-Za-z0-9+/]{43}=\-2$/,
    )
    expect(
      validateScannedPacketCompletionParts({
        expectedChecksums: [SHA256_BASE64, SHA256_BASE64],
        parts: [
          { partNumber: 1, etag: '"etag-1"', checksumSha256: SHA256_BASE64 },
          { partNumber: 2, etag: '"etag-2"', checksumSha256: SHA256_BASE64 },
        ],
      }),
    ).toEqual([
      { PartNumber: 1, ETag: '"etag-1"', ChecksumSHA256: SHA256_BASE64 },
      { PartNumber: 2, ETag: '"etag-2"', ChecksumSHA256: SHA256_BASE64 },
    ])

    for (const parts of [
      [{ partNumber: 2, etag: 'etag', checksumSha256: SHA256_BASE64 }],
      [
        { partNumber: 1, etag: 'etag', checksumSha256: SHA256_BASE64 },
        { partNumber: 1, etag: 'etag', checksumSha256: SHA256_BASE64 },
      ],
      [{ partNumber: 1, etag: '', checksumSha256: SHA256_BASE64 }],
      [{ partNumber: 1, etag: 'etag', checksumSha256: 'not-a-checksum' }],
    ]) {
      expect(() =>
        validateScannedPacketCompletionParts({
          expectedChecksums: [SHA256_BASE64],
          parts,
        }),
      ).toThrow(ScannedPacketIngestionError)
    }
  })

  it('accepts only PDF or classic little/big-endian TIFF magic bytes', () => {
    expect(() =>
      assertScannedPacketMagic('application/pdf', Buffer.from('%PDF-1.7')),
    ).not.toThrow()
    expect(() =>
      assertScannedPacketMagic('image/tiff', Uint8Array.from([0x49, 0x49, 0x2a, 0x00])),
    ).not.toThrow()
    expect(() =>
      assertScannedPacketMagic('image/tiff', Uint8Array.from([0x4d, 0x4d, 0x00, 0x2a])),
    ).not.toThrow()
    expect(() =>
      assertScannedPacketMagic('application/pdf', Buffer.from('patient note')),
    ).toThrow(ScannedPacketIngestionError)
  })
})

describe('scanned-packet Textract page assembly', () => {
  it('preserves every ordinal and forces review for a legitimate blank page', () => {
    const manifest = assembleScannedPacketManifest(
      manifestInput([
        response(2, [
          block('PAGE', 1, 'page-1'),
          block('LINE', 1, 'line-1', { Text: 'Synthetic referral line', Confidence: 98 }),
          block('PAGE', 2, 'page-2'),
        ]),
      ]),
    )

    expect(manifest.pages).toHaveLength(2)
    expect(manifest.pages[0]).toMatchObject({
      pageNumber: 1,
      text: 'Synthetic referral line',
      status: 'readable',
      extractionMethod: 'ocr',
      extractionConfidence: 0.98,
    })
    expect(manifest.pages[1]).toMatchObject({
      pageNumber: 2,
      text: '',
      status: 'blank_or_unreadable',
      extractionConfidence: null,
      lineBlockCount: 0,
    })
    expect(manifest).toMatchObject({
      coverageStatus: 'incomplete',
      dataQualityStatus: 'incomplete',
      humanReviewRequired: true,
      humanReviewReasons: ['blank_or_unreadable_page'],
    })
    expect(() => toLongPacketSourcePages(manifest)).toThrow(
      ScannedPacketIngestionError,
    )
  })

  it('preserves service line order and calculates conservative confidence and stable digests', () => {
    const input = manifestInput([
      response(2, [
        block('PAGE', 1, 'page-1'),
        block('LINE', 1, 'line-1', { Text: 'Line A', Confidence: 99 }),
        block('LINE', 1, 'line-2', { Text: 'Line B', Confidence: 61 }),
      ], { NextToken: 'token-1' }),
      response(2, [
        block('PAGE', 2, 'page-2'),
        block('LINE', 2, 'line-3', { Text: 'Line C', Confidence: 87 }),
      ]),
    ])

    const first = assembleScannedPacketManifest(input)
    const second = assembleScannedPacketManifest(input)

    expect(first.pages.map((page) => page.text)).toEqual(['Line A\nLine B', 'Line C'])
    expect(first.pages[0].extractionConfidence).toBe(0.61)
    expect(first).toMatchObject({
      pageCount: 2,
      coverageStatus: 'complete',
      dataQualityStatus: 'complete',
      humanReviewRequired: false,
      humanReviewReasons: [],
    })
    expect(first.packetTextSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(first.manifestSha256).toBe(second.manifestSha256)
    expect(toLongPacketSourcePages(first)).toEqual([
      {
        pageNumber: 1,
        text: 'Line A\nLine B',
        extractionMethod: 'ocr',
        extractionConfidence: 0.61,
      },
      {
        pageNumber: 2,
        text: 'Line C',
        extractionMethod: 'ocr',
        extractionConfidence: 0.87,
      },
    ])
  })

  it('accepts the documented 1,024-character Textract pagination token boundary', () => {
    expect(() =>
      assembleScannedPacketManifest(
        manifestInput([
          response(
            2,
            [
              block('PAGE', 1, 'page-1'),
              block('LINE', 1, 'line-1', { Text: 'First', Confidence: 99 }),
            ],
            { NextToken: 'x'.repeat(1_024) },
          ),
          response(2, [
            block('PAGE', 2, 'page-2'),
            block('LINE', 2, 'line-2', { Text: 'Second', Confidence: 99 }),
          ]),
        ]),
      ),
    ).not.toThrow()
  })

  it('forces review when any readable page has low OCR confidence', () => {
    const manifest = assembleScannedPacketManifest(
      manifestInput([
        response(1, [
          block('PAGE', 1, 'page-1'),
          block('LINE', 1, 'line-1', {
            Text: 'Uncertain synthetic OCR',
            Confidence: 49,
          }),
        ]),
      ]),
    )

    expect(manifest).toMatchObject({
      coverageStatus: 'complete',
      dataQualityStatus: 'incomplete',
      humanReviewRequired: true,
      humanReviewReasons: ['low_ocr_confidence'],
    })
    expect(() => toLongPacketSourcePages(manifest)).toThrow(
      ScannedPacketIngestionError,
    )
  })

  it('revalidates all page and packet digests before downstream conversion', () => {
    const manifest = assembleScannedPacketManifest(
      manifestInput([
        response(1, [
          block('PAGE', 1, 'page-1'),
          block('LINE', 1, 'line-1', {
            Text: 'Synthetic verified line',
            Confidence: 99,
          }),
        ]),
      ]),
    )
    const tampered = structuredClone(manifest)
    tampered.pages[0].text = 'Synthetic altered line'

    expect(() => toLongPacketSourcePages(tampered)).toThrow(
      ScannedPacketIngestionError,
    )
  })

  it.each([
    ['missing page ordinal', [response(2, [block('PAGE', 1, 'page-1')])], 'PAGE_COVERAGE_INVALID'],
    [
      'duplicate page ordinal',
      [response(1, [block('PAGE', 1, 'page-1'), block('PAGE', 1, 'page-2')])],
      'PAGE_COVERAGE_INVALID',
    ],
    ['out-of-range ordinal', [response(1, [block('PAGE', 2, 'page-2')])], 'PAGE_COVERAGE_INVALID'],
    [
      'inconsistent metadata',
      [response(1, [block('PAGE', 1, 'page-1')], { NextToken: 'next' }), response(2, [])],
      'PAGE_COVERAGE_INVALID',
    ],
    [
      'partial result',
      [response(1, [block('PAGE', 1, 'page-1')], { JobStatus: 'PARTIAL_SUCCESS' })],
      'TEXTRACT_RESULT_INCOMPLETE',
    ],
    [
      'warnings',
      [response(1, [block('PAGE', 1, 'page-1')], { Warnings: [{ ErrorCode: 'PAGE_UNREADABLE' }] })],
      'TEXTRACT_RESULT_INCOMPLETE',
    ],
    [
      'orphan final pagination token',
      [
        response(
          1,
          [
            block('PAGE', 1, 'page-1'),
            block('LINE', 1, 'line-1', { Text: 'Synthetic', Confidence: 99 }),
          ],
          { NextToken: 'unconsumed-token' },
        ),
      ],
      'TEXTRACT_RESPONSE_INVALID',
    ],
    ['all blank', [response(1, [block('PAGE', 1, 'page-1')])], 'ALL_PAGES_UNREADABLE'],
  ])('fails closed for %s', (_label, responses, expectedCode) => {
    try {
      assembleScannedPacketManifest(manifestInput(responses as ReturnType<typeof response>[]))
      throw new Error('expected assembly failure')
    } catch (error) {
      expect(errorCode(error)).toBe(expectedCode)
    }
  })

  it('rejects duplicate block IDs and lines without valid page/confidence bindings', () => {
    for (const blocks of [
      [
        block('PAGE', 1, 'same-id'),
        block('LINE', 1, 'same-id', { Text: 'Synthetic', Confidence: 99 }),
      ],
      [
        block('PAGE', 1, 'page-1'),
        block('LINE', 2, 'line-1', { Text: 'Synthetic', Confidence: 99 }),
      ],
      [
        block('PAGE', 1, 'page-1'),
        block('LINE', 1, 'line-1', { Text: 'Synthetic', Confidence: 101 }),
      ],
    ]) {
      expect(() =>
        assembleScannedPacketManifest(manifestInput([response(1, blocks)])),
      ).toThrow(ScannedPacketIngestionError)
    }
  })

  it('rejects a self-consistent Textract page count that disagrees with the trusted source count', () => {
    expect(() =>
      assembleScannedPacketManifest(
        manifestInput(
          [
            response(1, [
              block('PAGE', 1, 'page-1'),
              block('LINE', 1, 'line-1', {
                Text: 'Synthetic first page only',
                Confidence: 99,
              }),
            ]),
          ],
          2,
        ),
      ),
    ).toThrow(ScannedPacketIngestionError)
  })
})
