import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { GetDocumentTextDetectionCommand } from '@aws-sdk/client-textract'
import type { SQSEvent, SQSRecord } from 'aws-lambda'
import { describe, expect, it, vi } from 'vitest'

import type { ScannedPacketJobBinding } from '@/lib/triage/scannedPacketAws'
import { assembleScannedPacketManifest } from '@/lib/triage/scannedPacketIngestion'
import {
  createScannedPacketWorkerHandler,
  createScannedPacketRuntimeDependencies,
} from '@/workers/triageScannedPacketWorker'

const INGESTION_ID = '05240000-0000-4000-8000-000000000101'
const BUCKET = 'synthetic-neurology-packets'
const KMS_KEY_ARN =
  'arn:aws:kms:us-east-2:111122223333:key/05240000-0000-4000-8000-000000000103'
const JOB_ID = 'opaqueTextractJob_1'
const CHECKSUM = `${Buffer.alloc(32, 3).toString('base64')}-1`

const binding: ScannedPacketJobBinding = {
  version: 'neurology-scanned-packet-job-binding-v1',
  ingestionId: INGESTION_ID,
  uploadSessionId: '05240000-0000-4000-8000-000000000102',
  declaredPageCount: 1,
  trustedPageCount: 1,
  source: {
    bucket: BUCKET,
    key: `quarantine/${INGESTION_ID}/source.pdf`,
    versionId: 'opaque-version-1',
    sizeBytes: 1_024,
    partCount: 1,
    checksumSha256: CHECKSUM,
    contentType: 'application/pdf',
  },
  textract: {
    api: 'StartDocumentTextDetection',
    jobId: JOB_ID,
  },
}

function event(status = 'SUCCEEDED'): SQSEvent {
  return {
    Records: [
      {
        messageId: 'message-1',
        body: JSON.stringify({
          JobId: JOB_ID,
          Status: status,
          API: 'StartDocumentTextDetection',
          JobTag: INGESTION_ID,
          Timestamp: 1_783_770_000_000,
          DocumentLocation: {
            S3Bucket: BUCKET,
            S3ObjectName: `quarantine/${INGESTION_ID}/source.pdf`,
          },
        }),
      } as SQSRecord,
    ],
  }
}

function body(value: unknown) {
  return {
    transformToByteArray: async () => Buffer.from(JSON.stringify(value), 'utf8'),
  }
}

describe('scanned-packet AWS worker runtime', () => {
  it('wires encrypted S3 binding/result persistence and paginated Textract without live calls', async () => {
    const s3Commands: unknown[] = []
    const textractCommands: unknown[] = []
    const s3 = {
      send: vi.fn(async (command: unknown) => {
        s3Commands.push(command)
        if (command instanceof GetObjectCommand) {
          expect(command.input.Key).toBe(`control/${INGESTION_ID}/binding.json`)
          return { Body: body(binding) }
        }
        if (command instanceof PutObjectCommand) return {}
        throw new Error('unexpected S3 command')
      }),
    }
    const textract = {
      send: vi.fn(async (command: unknown) => {
        textractCommands.push(command)
        return {
          JobStatus: 'SUCCEEDED',
          DocumentMetadata: { Pages: 1 },
          Blocks: [
            { BlockType: 'PAGE', Page: 1, Id: 'page-1' },
            {
              BlockType: 'LINE',
              Page: 1,
              Id: 'line-1',
              Text: 'Synthetic referral',
              Confidence: 99,
            },
          ],
        }
      }),
    }
    const handler = createScannedPacketWorkerHandler({
      s3,
      textract,
      config: {
        sourceBucket: BUCKET,
        resultBucket: BUCKET,
        kmsKeyArn: KMS_KEY_ARN,
        maxResultRequests: 100,
      },
    })

    await expect(handler(event())).resolves.toEqual({ batchItemFailures: [] })

    expect(textractCommands[0]).toBeInstanceOf(GetDocumentTextDetectionCommand)
    expect((textractCommands[0] as GetDocumentTextDetectionCommand).input).toEqual({
      JobId: JOB_ID,
      MaxResults: 1_000,
    })
    const put = s3Commands.find(
      (command) => command instanceof PutObjectCommand,
    ) as PutObjectCommand
    expect(put.input).toMatchObject({
      Bucket: BUCKET,
      Key: `validated/${INGESTION_ID}/pages.json`,
      ContentType: 'application/json',
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: KMS_KEY_ARN,
      BucketKeyEnabled: true,
      ChecksumAlgorithm: 'SHA256',
      IfNoneMatch: '*',
    })
    expect(String(put.input.Body)).toContain('Synthetic referral')
  })

  it('persists a text-free immutable review outcome for terminal Textract failure', async () => {
    const puts: PutObjectCommand[] = []
    const s3 = {
      send: vi.fn(async (command: unknown) => {
        if (command instanceof GetObjectCommand) return { Body: body(binding) }
        if (command instanceof PutObjectCommand) {
          puts.push(command)
          return {}
        }
        throw new Error('unexpected S3 command')
      }),
    }
    const textract = { send: vi.fn() }
    const handler = createScannedPacketWorkerHandler({
      s3,
      textract,
      config: {
        sourceBucket: BUCKET,
        resultBucket: BUCKET,
        kmsKeyArn: KMS_KEY_ARN,
        maxResultRequests: 100,
      },
    })

    await expect(handler(event('FAILED'))).resolves.toEqual({
      batchItemFailures: [],
    })
    expect(textract.send).not.toHaveBeenCalled()
    expect(puts[0].input.Key).toBe(`review/${INGESTION_ID}/outcome.json`)
    const value = String(puts[0].input.Body)
    expect(value).toContain('textract_failed')
    expect(value).not.toContain('Synthetic referral')
  })

  it('stores a review-required page manifest outside the triageable validated prefix', async () => {
    const puts: PutObjectCommand[] = []
    const deps = createScannedPacketRuntimeDependencies({
      s3: {
        send: vi.fn(async (command: unknown) => {
          if (command instanceof PutObjectCommand) {
            puts.push(command)
            return {}
          }
          throw new Error('unexpected command')
        }),
      },
      textract: { send: vi.fn() },
      config: {
        sourceBucket: BUCKET,
        resultBucket: BUCKET,
        kmsKeyArn: KMS_KEY_ARN,
        maxResultRequests: 100,
      },
    })
    const reviewBinding: ScannedPacketJobBinding = {
      ...binding,
      declaredPageCount: 2,
      trustedPageCount: 2,
    }
    const manifest = assembleScannedPacketManifest({
      ingestionId: INGESTION_ID,
      trustedSourcePageCount: 2,
      source: reviewBinding.source,
      textract: reviewBinding.textract,
      responses: [
        {
          JobStatus: 'SUCCEEDED',
          DocumentMetadata: { Pages: 2 },
          Blocks: [
            { BlockType: 'PAGE', Page: 1, Id: 'page-1' },
            {
              BlockType: 'LINE',
              Page: 1,
              Id: 'line-1',
              Text: 'Synthetic readable page',
              Confidence: 99,
            },
            { BlockType: 'PAGE', Page: 2, Id: 'page-2' },
          ],
        },
      ],
    })

    await expect(
      deps.persistManifest({ binding: reviewBinding, manifest }),
    ).resolves.toBe('created')
    expect(puts[0].input.Key).toBe(`review/${INGESTION_ID}/pages.json`)
    expect(puts[0].input.Key).not.toContain('validated/')
  })

  it('treats an exact conditional-write replay as a duplicate and a conflict as failure', async () => {
    const manifest = assembleScannedPacketManifest({
      ingestionId: INGESTION_ID,
      trustedSourcePageCount: 1,
      source: binding.source,
      textract: binding.textract,
      responses: [
        {
          JobStatus: 'SUCCEEDED',
          DocumentMetadata: { Pages: 1 },
          Blocks: [
            { BlockType: 'PAGE', Page: 1, Id: 'page-1' },
            {
              BlockType: 'LINE',
              Page: 1,
              Id: 'line-1',
              Text: 'Synthetic',
              Confidence: 99,
            },
          ],
        },
      ],
    })
    const serialized = JSON.stringify(manifest)
    const send = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('conditional'), { name: 'PreconditionFailed' }))
      .mockResolvedValueOnce({ Body: { transformToByteArray: async () => Buffer.from(serialized) } })
    const replayDeps = createScannedPacketRuntimeDependencies({
      s3: { send },
      textract: { send: vi.fn() },
      config: {
        sourceBucket: BUCKET,
        resultBucket: BUCKET,
        kmsKeyArn: KMS_KEY_ARN,
        maxResultRequests: 100,
      },
    })

    await expect(
      replayDeps.persistManifest({ binding, manifest }),
    ).resolves.toBe('duplicate')

    const conflictSend = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('conditional'), { name: 'PreconditionFailed' }))
      .mockResolvedValueOnce({ Body: { transformToByteArray: async () => Buffer.from('{}') } })
    const conflictDeps = createScannedPacketRuntimeDependencies({
      s3: { send: conflictSend },
      textract: { send: vi.fn() },
      config: {
        sourceBucket: BUCKET,
        resultBucket: BUCKET,
        kmsKeyArn: KMS_KEY_ARN,
        maxResultRequests: 100,
      },
    })
    await expect(
      conflictDeps.persistManifest({ binding, manifest }),
    ).rejects.toThrow('Scanned-packet result persistence conflict.')
  })

  it('fails closed on invalid runtime configuration', () => {
    expect(() =>
      createScannedPacketRuntimeDependencies({
        s3: { send: vi.fn() },
        textract: { send: vi.fn() },
        config: {
          sourceBucket: 's3://unsafe',
          resultBucket: BUCKET,
          kmsKeyArn: 'alias/aws/s3',
          maxResultRequests: 0,
        },
      }),
    ).toThrow('Scanned-packet worker configuration is invalid.')
  })
})
