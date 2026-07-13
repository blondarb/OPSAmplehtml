import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { StartDocumentTextDetectionCommand } from '@aws-sdk/client-textract'
import { describe, expect, it, vi } from 'vitest'

import {
  ScannedPacketAwsError,
  createScannedPacketAwsCoordinator,
  parseScannedPacketJobBinding,
} from '@/lib/triage/scannedPacketAws'
import {
  SCANNED_PACKET_PART_BYTES,
  compositeSha256Base64,
  planScannedPacketUpload,
} from '@/lib/triage/scannedPacketIngestion'

const INGESTION_ID = '05240000-0000-4000-8000-000000000101'
const UPLOAD_SESSION_ID = '05240000-0000-4000-8000-000000000102'
const CHECKSUM_1 = Buffer.alloc(32, 1).toString('base64')
const CHECKSUM_2 = Buffer.alloc(32, 2).toString('base64')
const COMPOSITE_CHECKSUM = compositeSha256Base64([CHECKSUM_1, CHECKSUM_2])
const BUCKET = 'synthetic-neurology-packets'
const KMS_KEY_ARN =
  'arn:aws:kms:us-east-2:111122223333:key/05240000-0000-4000-8000-000000000103'
const TOPIC_ARN =
  'arn:aws:sns:us-east-2:111122223333:synthetic-textract-complete'
const ROLE_ARN =
  'arn:aws:iam::111122223333:role/synthetic-textract-publisher'

function plan() {
  return planScannedPacketUpload({
    ingestionId: INGESTION_ID,
    uploadSessionId: UPLOAD_SESSION_ID,
    contentType: 'application/pdf',
    sizeBytes: SCANNED_PACKET_PART_BYTES + 7,
    declaredPageCount: 2,
  })
}

function awsError(name: string): Error {
  const error = new Error('synthetic private AWS detail')
  error.name = name
  return error
}

function validHead(overrides: Record<string, unknown> = {}) {
  return {
    ContentLength: SCANNED_PACKET_PART_BYTES + 7,
    ContentType: 'application/pdf',
    ServerSideEncryption: 'aws:kms',
    SSEKMSKeyId: KMS_KEY_ARN,
    BucketKeyEnabled: true,
    ChecksumSHA256: COMPOSITE_CHECKSUM,
    ChecksumType: 'COMPOSITE',
    VersionId: 'opaque-source-version-1',
    Metadata: {
      'ingestion-id': INGESTION_ID,
      'upload-session-id': UPLOAD_SESSION_ID,
      schema: 'neurology-scanned-packet-upload-v1',
    },
    ...overrides,
  }
}

function coordinator(input: {
  s3Send?: ReturnType<typeof vi.fn>
  textractSend?: ReturnType<typeof vi.fn>
  presign?: ReturnType<typeof vi.fn>
  inspectSourcePageCount?: ReturnType<typeof vi.fn>
} = {}) {
  const s3 = { send: input.s3Send ?? vi.fn() }
  const textract = { send: input.textractSend ?? vi.fn() }
  const presign =
    input.presign ??
    vi.fn(async (_client, command: UploadPartCommand) =>
      `https://uploads.example.test/part-${command.input.PartNumber}`,
    )
  const inspectSourcePageCount =
    input.inspectSourcePageCount ?? vi.fn(async () => 2)
  return {
    s3,
    textract,
    presign,
    service: createScannedPacketAwsCoordinator({
      s3,
      textract,
      presign,
      inspectSourcePageCount,
      config: {
        sourceBucket: BUCKET,
        resultBucket: BUCKET,
        kmsKeyArn: KMS_KEY_ARN,
        textractTopicArn: TOPIC_ARN,
        textractPublishRoleArn: ROLE_ARN,
        presignExpiresSeconds: 600,
      },
    }),
    inspectSourcePageCount,
  }
}

describe('scanned-packet AWS upload coordinator', () => {
  it('rejects unknown or clinical fields in the opaque job binding', () => {
    const value = {
      version: 'neurology-scanned-packet-job-binding-v1',
      ingestionId: INGESTION_ID,
      uploadSessionId: UPLOAD_SESSION_ID,
      declaredPageCount: 2,
      trustedPageCount: 2,
      source: {
        bucket: BUCKET,
        key: `quarantine/${INGESTION_ID}/source.pdf`,
        versionId: 'opaque-source-version-1',
        sizeBytes: SCANNED_PACKET_PART_BYTES + 7,
        partCount: 2,
        checksumSha256: COMPOSITE_CHECKSUM,
        contentType: 'application/pdf',
      },
      textract: {
        api: 'StartDocumentTextDetection',
        jobId: 'opaqueTextractJob_1',
      },
    }
    expect(parseScannedPacketJobBinding(value)).toEqual(value)
    expect(() =>
      parseScannedPacketJobBinding({ ...value, clinicalText: 'synthetic note' }),
    ).toThrow(ScannedPacketAwsError)
    expect(() =>
      parseScannedPacketJobBinding({
        ...value,
        source: { ...value.source, originalFilename: 'referral.pdf' },
      }),
    ).toThrow(ScannedPacketAwsError)
    expect(() =>
      parseScannedPacketJobBinding({
        ...value,
        textract: { ...value.textract, patientName: 'Synthetic Patient' },
      }),
    ).toThrow(ScannedPacketAwsError)
  })

  it('creates an SSE-KMS, composite SHA-256 upload and checksum-bound part URLs', async () => {
    const { service, s3, presign } = coordinator({
      s3Send: vi.fn(async () => ({ UploadId: 'opaque-upload-id' })),
    })

    const session = await service.initiateUpload({
      plan: plan(),
      partChecksumsSha256: [CHECKSUM_1, CHECKSUM_2],
    })

    expect(session).toMatchObject({
      uploadId: 'opaque-upload-id',
      plan: { ingestionId: INGESTION_ID, partCount: 2 },
      partChecksumsSha256: [CHECKSUM_1, CHECKSUM_2],
      parts: [
        { partNumber: 1, checksumSha256: CHECKSUM_1 },
        { partNumber: 2, checksumSha256: CHECKSUM_2 },
      ],
    })
    const create = s3.send.mock.calls[0][0]
    expect(create).toBeInstanceOf(CreateMultipartUploadCommand)
    expect(create.input).toMatchObject({
      Bucket: BUCKET,
      Key: `quarantine/${INGESTION_ID}/source.pdf`,
      ContentType: 'application/pdf',
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: KMS_KEY_ARN,
      BucketKeyEnabled: true,
      ChecksumAlgorithm: 'SHA256',
      ChecksumType: 'COMPOSITE',
      Metadata: {
        'ingestion-id': INGESTION_ID,
        'upload-session-id': UPLOAD_SESSION_ID,
        schema: 'neurology-scanned-packet-upload-v1',
      },
    })
    expect(presign).toHaveBeenCalledTimes(2)
    for (const [index, call] of presign.mock.calls.entries()) {
      const command = call[1]
      expect(command).toBeInstanceOf(UploadPartCommand)
      expect(command.input).toMatchObject({
        Bucket: BUCKET,
        Key: `quarantine/${INGESTION_ID}/source.pdf`,
        UploadId: 'opaque-upload-id',
        PartNumber: index + 1,
        ChecksumSHA256: [CHECKSUM_1, CHECKSUM_2][index],
      })
      expect(call[2]).toEqual({ expiresIn: 600 })
    }
  })

  it('rejects invalid checksum plans before creating an upload', async () => {
    const { service, s3 } = coordinator()
    await expect(
      service.initiateUpload({
        plan: plan(),
        partChecksumsSha256: [CHECKSUM_1],
      }),
    ).rejects.toMatchObject({ code: 'UPLOAD_SESSION_INVALID' })
    expect(s3.send).not.toHaveBeenCalled()
  })

  it('completes exact parts, proves the versioned object, starts idempotent Textract, and writes an opaque binding', async () => {
    const commands: unknown[] = []
    const s3Send = vi.fn(async (command: unknown) => {
      commands.push(command)
      if (command instanceof CreateMultipartUploadCommand) {
        return { UploadId: 'opaque-upload-id' }
      }
      if (command instanceof CompleteMultipartUploadCommand) {
        return {
          VersionId: 'opaque-source-version-1',
          ChecksumSHA256: COMPOSITE_CHECKSUM,
          ChecksumType: 'COMPOSITE',
        }
      }
      if (command instanceof HeadObjectCommand) return validHead()
      if (command instanceof GetObjectCommand) {
        return {
          Body: {
            transformToByteArray: async () => Buffer.from('%PDF-1.7'),
          },
        }
      }
      if (command instanceof PutObjectCommand) return { ETag: 'binding-etag' }
      throw new Error('unexpected S3 command')
    })
    const textractSend = vi.fn(async () => ({ JobId: 'opaqueTextractJob_1' }))
    const { service, inspectSourcePageCount } = coordinator({
      s3Send,
      textractSend,
    })
    const session = await service.initiateUpload({
      plan: plan(),
      partChecksumsSha256: [CHECKSUM_1, CHECKSUM_2],
    })

    const result = await service.completeAndStartTextract({
      session,
      parts: [
        { partNumber: 1, etag: '"etag-1"', checksumSha256: CHECKSUM_1 },
        { partNumber: 2, etag: '"etag-2"', checksumSha256: CHECKSUM_2 },
      ],
    })

    expect(result).toMatchObject({
      jobId: 'opaqueTextractJob_1',
      binding: {
        ingestionId: INGESTION_ID,
        uploadSessionId: UPLOAD_SESSION_ID,
        declaredPageCount: 2,
        trustedPageCount: 2,
        source: {
          bucket: BUCKET,
          key: `quarantine/${INGESTION_ID}/source.pdf`,
          versionId: 'opaque-source-version-1',
          checksumSha256: COMPOSITE_CHECKSUM,
          partCount: 2,
        },
      },
    })
    expect(inspectSourcePageCount).toHaveBeenCalledWith({
      bucket: BUCKET,
      key: `quarantine/${INGESTION_ID}/source.pdf`,
      versionId: 'opaque-source-version-1',
      sizeBytes: SCANNED_PACKET_PART_BYTES + 7,
      contentType: 'application/pdf',
    })

    const complete = commands.find(
      (command) => command instanceof CompleteMultipartUploadCommand,
    ) as CompleteMultipartUploadCommand
    expect(complete.input.MultipartUpload?.Parts).toEqual([
      { PartNumber: 1, ETag: '"etag-1"', ChecksumSHA256: CHECKSUM_1 },
      { PartNumber: 2, ETag: '"etag-2"', ChecksumSHA256: CHECKSUM_2 },
    ])

    const head = commands.find(
      (command) => command instanceof HeadObjectCommand,
    ) as HeadObjectCommand
    expect(head.input).toMatchObject({
      Bucket: BUCKET,
      Key: `quarantine/${INGESTION_ID}/source.pdf`,
      VersionId: 'opaque-source-version-1',
      ChecksumMode: 'ENABLED',
    })
    const range = commands.find(
      (command) => command instanceof GetObjectCommand,
    ) as GetObjectCommand
    expect(range.input).toMatchObject({
      VersionId: 'opaque-source-version-1',
      Range: 'bytes=0-7',
    })

    const start = textractSend.mock.calls[0][0]
    expect(start).toBeInstanceOf(StartDocumentTextDetectionCommand)
    expect(start.input).toEqual({
      DocumentLocation: {
        S3Object: {
          Bucket: BUCKET,
          Name: `quarantine/${INGESTION_ID}/source.pdf`,
          Version: 'opaque-source-version-1',
        },
      },
      ClientRequestToken: `scan-${INGESTION_ID}`,
      JobTag: INGESTION_ID,
      KMSKeyId: KMS_KEY_ARN,
      NotificationChannel: {
        SNSTopicArn: TOPIC_ARN,
        RoleArn: ROLE_ARN,
      },
      OutputConfig: {
        S3Bucket: BUCKET,
        S3Prefix: `textract-output/${INGESTION_ID}`,
      },
    })

    const put = commands.find(
      (command) => command instanceof PutObjectCommand,
    ) as PutObjectCommand
    expect(put.input).toMatchObject({
      Bucket: BUCKET,
      Key: `control/${INGESTION_ID}/binding.json`,
      ContentType: 'application/json',
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: KMS_KEY_ARN,
      BucketKeyEnabled: true,
      ChecksumAlgorithm: 'SHA256',
      IfNoneMatch: '*',
    })
    const bindingBody = JSON.parse(String(put.input.Body))
    expect(bindingBody.textract).toEqual({
      api: 'StartDocumentTextDetection',
      jobId: 'opaqueTextractJob_1',
    })
    expect(JSON.stringify(bindingBody)).not.toContain('patient')
    expect(JSON.stringify(bindingBody)).not.toContain('filename')
  })

  it('rejects NoSuchUpload instead of recovering through an unpinned latest version', async () => {
    const s3Send = vi.fn(async (command: unknown) => {
      if (command instanceof CreateMultipartUploadCommand) {
        return { UploadId: 'opaque-upload-id' }
      }
      if (command instanceof CompleteMultipartUploadCommand) {
        throw awsError('NoSuchUpload')
      }
      throw new Error('unexpected command')
    })
    const textractSend = vi.fn(async () => ({ JobId: 'opaqueTextractJob_1' }))
    const { service } = coordinator({ s3Send, textractSend })
    const session = await service.initiateUpload({
      plan: plan(),
      partChecksumsSha256: [CHECKSUM_1, CHECKSUM_2],
    })

    await expect(
      service.completeAndStartTextract({
        session,
        parts: [
          { partNumber: 1, etag: 'etag-1', checksumSha256: CHECKSUM_1 },
          { partNumber: 2, etag: 'etag-2', checksumSha256: CHECKSUM_2 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'UPLOAD_COMPLETE_FAILED' })
    expect(textractSend).not.toHaveBeenCalled()
  })

  it.each([
    ['wrong size', { ContentLength: 10 }],
    ['wrong encryption', { ServerSideEncryption: 'AES256' }],
    ['wrong key', { SSEKMSKeyId: 'arn:aws:kms:us-east-2:111122223333:key/wrong' }],
    ['missing checksum', { ChecksumSHA256: undefined }],
    [
      'different valid composite checksum',
      { ChecksumSHA256: compositeSha256Base64([CHECKSUM_2, CHECKSUM_1]) },
    ],
    ['wrong session metadata', { Metadata: { 'upload-session-id': 'wrong' } }],
    ['missing version', { VersionId: undefined }],
  ])('fails before Textract when object integrity has %s', async (_label, headOverride) => {
    const s3Send = vi.fn(async (command: unknown) => {
      if (command instanceof CreateMultipartUploadCommand) return { UploadId: 'upload-id' }
      if (command instanceof CompleteMultipartUploadCommand) {
        return { VersionId: 'opaque-source-version-1', ChecksumSHA256: COMPOSITE_CHECKSUM, ChecksumType: 'COMPOSITE' }
      }
      if (command instanceof HeadObjectCommand) return validHead(headOverride)
      throw new Error('must not read or write after invalid head')
    })
    const textractSend = vi.fn()
    const { service } = coordinator({ s3Send, textractSend })
    const session = await service.initiateUpload({
      plan: plan(),
      partChecksumsSha256: [CHECKSUM_1, CHECKSUM_2],
    })

    await expect(
      service.completeAndStartTextract({
        session,
        parts: [
          { partNumber: 1, etag: 'etag-1', checksumSha256: CHECKSUM_1 },
          { partNumber: 2, etag: 'etag-2', checksumSha256: CHECKSUM_2 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'OBJECT_INTEGRITY_FAILED' })
    expect(textractSend).not.toHaveBeenCalled()
  })

  it('fails before Textract when ranged bytes do not match the declared format', async () => {
    const s3Send = vi.fn(async (command: unknown) => {
      if (command instanceof CreateMultipartUploadCommand) return { UploadId: 'upload-id' }
      if (command instanceof CompleteMultipartUploadCommand) {
        return { VersionId: 'opaque-source-version-1', ChecksumSHA256: COMPOSITE_CHECKSUM, ChecksumType: 'COMPOSITE' }
      }
      if (command instanceof HeadObjectCommand) return validHead()
      if (command instanceof GetObjectCommand) {
        return { Body: { transformToByteArray: async () => Buffer.from('not-pdf') } }
      }
      throw new Error('unexpected command')
    })
    const textractSend = vi.fn()
    const { service } = coordinator({ s3Send, textractSend })
    const session = await service.initiateUpload({
      plan: plan(),
      partChecksumsSha256: [CHECKSUM_1, CHECKSUM_2],
    })

    await expect(
      service.completeAndStartTextract({
        session,
        parts: [
          { partNumber: 1, etag: 'etag-1', checksumSha256: CHECKSUM_1 },
          { partNumber: 2, etag: 'etag-2', checksumSha256: CHECKSUM_2 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'OBJECT_INTEGRITY_FAILED' })
    expect(textractSend).not.toHaveBeenCalled()
  })

  it('fails before Textract when independent source page count cannot be proved', async () => {
    const s3Send = vi.fn(async (command: unknown) => {
      if (command instanceof CreateMultipartUploadCommand) return { UploadId: 'upload-id' }
      if (command instanceof CompleteMultipartUploadCommand) {
        return {
          VersionId: 'opaque-source-version-1',
          ChecksumSHA256: COMPOSITE_CHECKSUM,
          ChecksumType: 'COMPOSITE',
        }
      }
      if (command instanceof HeadObjectCommand) return validHead()
      if (command instanceof GetObjectCommand) {
        return { Body: { transformToByteArray: async () => Buffer.from('%PDF-1.7') } }
      }
      throw new Error('unexpected command')
    })
    const textractSend = vi.fn()
    const { service } = coordinator({
      s3Send,
      textractSend,
      inspectSourcePageCount: vi.fn(async () => 0),
    })
    const session = await service.initiateUpload({
      plan: plan(),
      partChecksumsSha256: [CHECKSUM_1, CHECKSUM_2],
    })

    await expect(
      service.completeAndStartTextract({
        session,
        parts: [
          { partNumber: 1, etag: 'etag-1', checksumSha256: CHECKSUM_1 },
          { partNumber: 2, etag: 'etag-2', checksumSha256: CHECKSUM_2 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_PAGE_COUNT_FAILED' })
    expect(textractSend).not.toHaveBeenCalled()
  })

  it('returns only stable sanitized AWS errors', async () => {
    const { service } = coordinator({
      s3Send: vi.fn(async () => {
        throw awsError('AccessDeniedException')
      }),
    })
    try {
      await service.initiateUpload({
        plan: plan(),
        partChecksumsSha256: [CHECKSUM_1, CHECKSUM_2],
      })
      throw new Error('expected failure')
    } catch (error) {
      expect(error).toBeInstanceOf(ScannedPacketAwsError)
      expect((error as ScannedPacketAwsError).code).toBe('UPLOAD_INIT_FAILED')
      expect((error as Error).message).toBe('Scanned-packet AWS operation failed.')
      expect((error as Error).message).not.toContain('private')
    }
  })
})
