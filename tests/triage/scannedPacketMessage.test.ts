import { describe, expect, it } from 'vitest'

import {
  ScannedPacketCompletionMessageError,
  parseScannedPacketCompletionMessage,
} from '@/workers/triageScannedPacketMessage'

const INGESTION_ID = '05240000-0000-4000-8000-000000000101'

function payload(overrides: Record<string, unknown> = {}) {
  return {
    JobId: 'opaqueTextractJob_1',
    Status: 'SUCCEEDED',
    API: 'StartDocumentTextDetection',
    JobTag: INGESTION_ID,
    Timestamp: 1_783_770_000_000,
    DocumentLocation: {
      S3Bucket: 'synthetic-neurology-packets',
      S3ObjectName: `quarantine/${INGESTION_ID}/source.pdf`,
    },
    ...overrides,
  }
}

describe('raw Textract completion message', () => {
  it('accepts only the exact documented opaque notification contract', () => {
    expect(
      parseScannedPacketCompletionMessage(JSON.stringify(payload())),
    ).toEqual({
      jobId: 'opaqueTextractJob_1',
      status: 'SUCCEEDED',
      api: 'StartDocumentTextDetection',
      ingestionId: INGESTION_ID,
      timestamp: 1_783_770_000_000,
      documentLocation: {
        bucket: 'synthetic-neurology-packets',
        key: `quarantine/${INGESTION_ID}/source.pdf`,
      },
    })

    for (const status of ['FAILED', 'ERROR']) {
      expect(
        parseScannedPacketCompletionMessage(
          JSON.stringify(payload({ Status: status })),
        ).status,
      ).toBe(status)
    }
  })

  it.each([
    ['malformed JSON', '{not-json'],
    ['SNS wrapper', JSON.stringify({ Type: 'Notification', Message: JSON.stringify(payload()) })],
    ['unknown field', JSON.stringify(payload({ referralText: 'synthetic note text' }))],
    ['wrong API', JSON.stringify(payload({ API: 'StartDocumentAnalysis' }))],
    ['non-opaque tag', JSON.stringify(payload({ JobTag: 'patient-jane-doe' }))],
    ['unsafe key', JSON.stringify(payload({ DocumentLocation: { S3Bucket: 'synthetic-neurology-packets', S3ObjectName: 'Jane_Doe_referral.pdf' } }))],
    ['wrong key binding', JSON.stringify(payload({ DocumentLocation: { S3Bucket: 'synthetic-neurology-packets', S3ObjectName: 'quarantine/05240000-0000-4000-8000-000000000999/source.pdf' } }))],
    ['bad bucket', JSON.stringify(payload({ DocumentLocation: { S3Bucket: 's3://bucket', S3ObjectName: `quarantine/${INGESTION_ID}/source.pdf` } }))],
    ['partial status', JSON.stringify(payload({ Status: 'PARTIAL_SUCCESS' }))],
    ['fractional timestamp', JSON.stringify(payload({ Timestamp: 1.5 }))],
    ['extra nested field', JSON.stringify(payload({ DocumentLocation: { S3Bucket: 'synthetic-neurology-packets', S3ObjectName: `quarantine/${INGESTION_ID}/source.pdf`, filename: 'referral.pdf' } }))],
  ])('rejects %s with one sanitized error', (_label, body) => {
    expect(() => parseScannedPacketCompletionMessage(body)).toThrow(
      ScannedPacketCompletionMessageError,
    )
    try {
      parseScannedPacketCompletionMessage(body)
    } catch (error) {
      expect((error as Error).message).toBe(
        'Invalid scanned-packet completion message.',
      )
      expect((error as Error).message).not.toContain('synthetic')
      expect((error as Error).message).not.toContain('patient')
    }
  })

  it('rejects empty and oversized bodies before parsing', () => {
    expect(() => parseScannedPacketCompletionMessage('')).toThrow(
      ScannedPacketCompletionMessageError,
    )
    expect(() => parseScannedPacketCompletionMessage(' '.repeat(4097))).toThrow(
      ScannedPacketCompletionMessageError,
    )
  })
})
