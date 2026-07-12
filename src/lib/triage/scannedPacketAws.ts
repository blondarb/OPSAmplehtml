import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
  type S3Client,
} from '@aws-sdk/client-s3'
import {
  StartDocumentTextDetectionCommand,
  type TextractClient,
} from '@aws-sdk/client-textract'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import {
  ScannedPacketIngestionError,
  SCANNED_PACKET_MAX_PAGES,
  assertScannedPacketMagic,
  compositeSha256Base64,
  isCompositeSha256,
  isSha256Base64,
  planScannedPacketUpload,
  scannedPacketBindingKey,
  type ScannedPacketCompletionPart,
  type ScannedPacketSourceProvenance,
  type ScannedPacketUploadPlan,
  validateScannedPacketCompletionParts,
} from './scannedPacketIngestion'

export const SCANNED_PACKET_UPLOAD_SCHEMA =
  'neurology-scanned-packet-upload-v1'
export const SCANNED_PACKET_JOB_BINDING_VERSION =
  'neurology-scanned-packet-job-binding-v1'

export type ScannedPacketAwsErrorCode =
  | 'CONFIGURATION_INVALID'
  | 'UPLOAD_SESSION_INVALID'
  | 'UPLOAD_INIT_FAILED'
  | 'UPLOAD_PRESIGN_FAILED'
  | 'UPLOAD_COMPLETE_FAILED'
  | 'OBJECT_INTEGRITY_FAILED'
  | 'SOURCE_PAGE_COUNT_FAILED'
  | 'TEXTRACT_START_FAILED'
  | 'BINDING_WRITE_FAILED'
  | 'BINDING_CONFLICT'

export class ScannedPacketAwsError extends Error {
  readonly name = 'ScannedPacketAwsError'

  constructor(readonly code: ScannedPacketAwsErrorCode) {
    super('Scanned-packet AWS operation failed.')
  }
}

export interface ScannedPacketAwsConfig {
  sourceBucket: string
  resultBucket: string
  kmsKeyArn: string
  textractTopicArn: string
  textractPublishRoleArn: string
  presignExpiresSeconds: number
}

export interface ScannedPacketUploadSession {
  plan: ScannedPacketUploadPlan
  uploadId: string
  partChecksumsSha256: string[]
  parts: Array<{
    partNumber: number
    checksumSha256: string
    uploadUrl: string
  }>
}

export interface ScannedPacketJobBinding {
  version: typeof SCANNED_PACKET_JOB_BINDING_VERSION
  ingestionId: string
  uploadSessionId: string
  declaredPageCount: number | null
  trustedPageCount: number
  source: ScannedPacketSourceProvenance
  textract: {
    api: 'StartDocumentTextDetection'
    jobId: string
  }
}

interface CommandClient {
  send(command: object): Promise<unknown>
}

type PresignFunction = (
  client: CommandClient,
  command: UploadPartCommand,
  options: { expiresIn: number },
) => Promise<string>

interface CoordinatorDependencies {
  s3: CommandClient
  textract: CommandClient
  presign?: PresignFunction
  inspectSourcePageCount: (input: {
    bucket: string
    key: string
    versionId: string
    sizeBytes: number
    contentType: 'application/pdf' | 'image/tiff'
  }) => Promise<number>
  config: ScannedPacketAwsConfig
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const BUCKET_PATTERN = /^(?!\d{1,3}(?:\.\d{1,3}){3}$)(?!.*\.\.)(?!.*\.-)(?!.*-\.)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/
const KMS_KEY_ARN_PATTERN = /^arn:[a-z0-9-]+:kms:[a-z0-9-]+:\d{12}:key\/[0-9a-f-]{36}$/i
const SNS_ARN_PATTERN = /^arn:[a-z0-9-]+:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]{1,256}$/
const IAM_ROLE_ARN_PATTERN = /^arn:[a-z0-9-]+:iam::\d{12}:role\/[A-Za-z0-9+=,.@_\/-]{1,512}$/

function awsFail(code: ScannedPacketAwsErrorCode): never {
  throw new ScannedPacketAwsError(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactObjectKeys(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  )
}

function validateConfig(config: ScannedPacketAwsConfig): ScannedPacketAwsConfig {
  if (
    !BUCKET_PATTERN.test(config.sourceBucket) ||
    !BUCKET_PATTERN.test(config.resultBucket) ||
    !KMS_KEY_ARN_PATTERN.test(config.kmsKeyArn) ||
    !SNS_ARN_PATTERN.test(config.textractTopicArn) ||
    !IAM_ROLE_ARN_PATTERN.test(config.textractPublishRoleArn) ||
    !Number.isSafeInteger(config.presignExpiresSeconds) ||
    config.presignExpiresSeconds < 60 ||
    config.presignExpiresSeconds > 900
  ) {
    awsFail('CONFIGURATION_INVALID')
  }
  return { ...config }
}

function expectedMetadata(plan: ScannedPacketUploadPlan) {
  return {
    'ingestion-id': plan.ingestionId,
    'upload-session-id': plan.uploadSessionId,
    schema: SCANNED_PACKET_UPLOAD_SCHEMA,
  }
}

function assertPlan(plan: ScannedPacketUploadPlan): ScannedPacketUploadPlan {
  let expected: ScannedPacketUploadPlan
  try {
    expected = planScannedPacketUpload({
      ingestionId: plan.ingestionId,
      uploadSessionId: plan.uploadSessionId,
      contentType: plan.contentType,
      sizeBytes: plan.sizeBytes,
      ...(plan.declaredPageCount === null
        ? {}
        : { declaredPageCount: plan.declaredPageCount }),
    })
  } catch {
    awsFail('UPLOAD_SESSION_INVALID')
  }
  if (JSON.stringify(expected) !== JSON.stringify(plan)) {
    awsFail('UPLOAD_SESSION_INVALID')
  }
  return expected
}

function assertChecksums(plan: ScannedPacketUploadPlan, values: unknown): string[] {
  if (
    !Array.isArray(values) ||
    values.length !== plan.partCount ||
    !values.every(isSha256Base64)
  ) {
    awsFail('UPLOAD_SESSION_INVALID')
  }
  return [...values]
}

function assertUploadId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 1_024 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    awsFail('UPLOAD_INIT_FAILED')
  }
  return value
}

function assertSession(session: ScannedPacketUploadSession): {
  plan: ScannedPacketUploadPlan
  uploadId: string
  checksums: string[]
} {
  if (!isRecord(session)) awsFail('UPLOAD_SESSION_INVALID')
  const plan = assertPlan(session.plan)
  const checksums = assertChecksums(plan, session.partChecksumsSha256)
  if (
    typeof session.uploadId !== 'string' ||
    session.uploadId.length < 1 ||
    session.uploadId.length > 1_024 ||
    /[\u0000-\u001f\u007f]/.test(session.uploadId) ||
    !Array.isArray(session.parts) ||
    session.parts.length !== plan.partCount ||
    session.parts.some(
      (part, index) =>
        !isRecord(part) ||
        part.partNumber !== index + 1 ||
        part.checksumSha256 !== checksums[index] ||
        typeof part.uploadUrl !== 'string' ||
        !part.uploadUrl.startsWith('https://'),
    )
  ) {
    awsFail('UPLOAD_SESSION_INVALID')
  }
  return { plan, uploadId: session.uploadId, checksums }
}

function errorName(error: unknown): string | null {
  return isRecord(error) && typeof error.name === 'string' ? error.name : null
}

async function bodyToBytes(body: unknown): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body
  if (
    isRecord(body) &&
    typeof body.transformToByteArray === 'function'
  ) {
    const value = await (
      body.transformToByteArray as () => Promise<Uint8Array>
    )()
    if (value instanceof Uint8Array) return value
  }
  awsFail('OBJECT_INTEGRITY_FAILED')
}

function exactMetadata(
  value: unknown,
  expected: Record<string, string>,
): boolean {
  if (!isRecord(value)) return false
  const actualKeys = Object.keys(value).sort()
  const expectedKeys = Object.keys(expected).sort()
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every(
      (key, index) =>
        key === expectedKeys[index] && value[key] === expected[key],
    )
  )
}

function serializeBinding(binding: ScannedPacketJobBinding): string {
  return JSON.stringify(binding)
}

export function parseScannedPacketJobBinding(
  value: unknown,
): ScannedPacketJobBinding {
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown
    } catch {
      awsFail('BINDING_CONFLICT')
    }
  }
  if (
    !isRecord(parsed) ||
    !exactObjectKeys(parsed, [
      'version',
      'ingestionId',
      'uploadSessionId',
      'declaredPageCount',
      'trustedPageCount',
      'source',
      'textract',
    ]) ||
    parsed.version !== SCANNED_PACKET_JOB_BINDING_VERSION ||
    typeof parsed.ingestionId !== 'string' ||
    !UUID_PATTERN.test(parsed.ingestionId) ||
    parsed.ingestionId !== parsed.ingestionId.toLowerCase() ||
    typeof parsed.uploadSessionId !== 'string' ||
    !UUID_PATTERN.test(parsed.uploadSessionId) ||
    parsed.uploadSessionId !== parsed.uploadSessionId.toLowerCase() ||
    (parsed.declaredPageCount !== null &&
      (!Number.isSafeInteger(parsed.declaredPageCount) ||
        (parsed.declaredPageCount as number) < 1 ||
        (parsed.declaredPageCount as number) > 3_000)) ||
    !Number.isSafeInteger(parsed.trustedPageCount) ||
    (parsed.trustedPageCount as number) < 1 ||
    (parsed.trustedPageCount as number) > SCANNED_PACKET_MAX_PAGES ||
    !isRecord(parsed.source) ||
    !isRecord(parsed.textract) ||
    !exactObjectKeys(parsed.source, [
      'bucket',
      'key',
      'versionId',
      'sizeBytes',
      'partCount',
      'checksumSha256',
      'contentType',
    ]) ||
    !exactObjectKeys(parsed.textract, ['api', 'jobId']) ||
    parsed.textract.api !== 'StartDocumentTextDetection' ||
    typeof parsed.textract.jobId !== 'string' ||
    !JOB_ID_PATTERN.test(parsed.textract.jobId)
  ) {
    awsFail('BINDING_CONFLICT')
  }
  const source = parsed.source
  if (
    typeof source.bucket !== 'string' ||
    !BUCKET_PATTERN.test(source.bucket) ||
    typeof source.key !== 'string' ||
    typeof source.versionId !== 'string' ||
    !source.versionId ||
    source.versionId.length > 1_024 ||
    !Number.isSafeInteger(source.sizeBytes) ||
    !Number.isSafeInteger(source.partCount) ||
    !isCompositeSha256(source.checksumSha256, source.partCount as number) ||
    (source.contentType !== 'application/pdf' && source.contentType !== 'image/tiff')
  ) {
    awsFail('BINDING_CONFLICT')
  }
  const plan = planScannedPacketUpload({
    ingestionId: parsed.ingestionId,
    uploadSessionId: parsed.uploadSessionId,
    contentType: source.contentType,
    sizeBytes: source.sizeBytes as number,
    ...(parsed.declaredPageCount === null
      ? {}
      : { declaredPageCount: parsed.declaredPageCount as number }),
  })
  if (source.key !== plan.sourceKey || source.partCount !== plan.partCount) {
    awsFail('BINDING_CONFLICT')
  }
  return parsed as unknown as ScannedPacketJobBinding
}

async function persistBinding(input: {
  s3: CommandClient
  config: ScannedPacketAwsConfig
  binding: ScannedPacketJobBinding
}): Promise<void> {
  const body = serializeBinding(input.binding)
  try {
    await input.s3.send(
      new PutObjectCommand({
        Bucket: input.config.resultBucket,
        Key: scannedPacketBindingKey(input.binding.ingestionId),
        Body: body,
        ContentType: 'application/json',
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: input.config.kmsKeyArn,
        BucketKeyEnabled: true,
        ChecksumAlgorithm: 'SHA256',
        IfNoneMatch: '*',
      }),
    )
  } catch (error) {
    if (
      errorName(error) !== 'PreconditionFailed' &&
      errorName(error) !== 'ConditionalRequestConflict'
    ) {
      awsFail('BINDING_WRITE_FAILED')
    }
    let existing: unknown
    try {
      existing = await input.s3.send(
        new GetObjectCommand({
          Bucket: input.config.resultBucket,
          Key: scannedPacketBindingKey(input.binding.ingestionId),
        }),
      )
    } catch {
      awsFail('BINDING_CONFLICT')
    }
    if (!isRecord(existing)) awsFail('BINDING_CONFLICT')
    const existingBytes = await bodyToBytes(existing.Body)
    const parsed = parseScannedPacketJobBinding(
      Buffer.from(existingBytes).toString('utf8'),
    )
    if (serializeBinding(parsed) !== body) awsFail('BINDING_CONFLICT')
  }
}

export function createScannedPacketAwsCoordinator(
  dependencies: CoordinatorDependencies,
) {
  const config = validateConfig(dependencies.config)
  const presign: PresignFunction =
    dependencies.presign ??
    (async (client, command, options) =>
      getSignedUrl(client as unknown as S3Client, command, options))

  return {
    async initiateUpload(input: {
      plan: ScannedPacketUploadPlan
      partChecksumsSha256: string[]
    }): Promise<ScannedPacketUploadSession> {
      const plan = assertPlan(input.plan)
      const checksums = assertChecksums(plan, input.partChecksumsSha256)
      let result: unknown
      try {
        result = await dependencies.s3.send(
          new CreateMultipartUploadCommand({
            Bucket: config.sourceBucket,
            Key: plan.sourceKey,
            ContentType: plan.contentType,
            ServerSideEncryption: 'aws:kms',
            SSEKMSKeyId: config.kmsKeyArn,
            BucketKeyEnabled: true,
            ChecksumAlgorithm: 'SHA256',
            ChecksumType: 'COMPOSITE',
            Metadata: expectedMetadata(plan),
          }),
        )
      } catch {
        awsFail('UPLOAD_INIT_FAILED')
      }
      const uploadId = assertUploadId(
        isRecord(result) ? result.UploadId : undefined,
      )
      const parts = []
      for (let index = 0; index < plan.partCount; index += 1) {
        const partNumber = index + 1
        const command = new UploadPartCommand({
          Bucket: config.sourceBucket,
          Key: plan.sourceKey,
          UploadId: uploadId,
          PartNumber: partNumber,
          ChecksumSHA256: checksums[index],
        })
        let uploadUrl: string
        try {
          uploadUrl = await presign(dependencies.s3, command, {
            expiresIn: config.presignExpiresSeconds,
          })
          const parsed = new URL(uploadUrl)
          if (parsed.protocol !== 'https:') awsFail('UPLOAD_PRESIGN_FAILED')
        } catch (error) {
          if (error instanceof ScannedPacketAwsError) throw error
          awsFail('UPLOAD_PRESIGN_FAILED')
        }
        parts.push({
          partNumber,
          checksumSha256: checksums[index],
          uploadUrl,
        })
      }
      return {
        plan,
        uploadId,
        partChecksumsSha256: checksums,
        parts,
      }
    },

    async completeAndStartTextract(input: {
      session: ScannedPacketUploadSession
      parts: ScannedPacketCompletionPart[]
    }): Promise<{ jobId: string; binding: ScannedPacketJobBinding }> {
      const { plan, uploadId, checksums } = assertSession(input.session)
      let completedParts
      try {
        completedParts = validateScannedPacketCompletionParts({
          expectedChecksums: checksums,
          parts: input.parts,
        })
      } catch (error) {
        if (error instanceof ScannedPacketIngestionError) {
          awsFail('UPLOAD_SESSION_INVALID')
        }
        throw error
      }

      let completeResult: Record<string, unknown> | null = null
      try {
        const result = await dependencies.s3.send(
          new CompleteMultipartUploadCommand({
            Bucket: config.sourceBucket,
            Key: plan.sourceKey,
            UploadId: uploadId,
            MultipartUpload: { Parts: completedParts },
            ChecksumType: 'COMPOSITE',
          }),
        )
        if (!isRecord(result)) awsFail('UPLOAD_COMPLETE_FAILED')
        completeResult = result
      } catch (error) {
        if (error instanceof ScannedPacketAwsError) throw error
        awsFail('UPLOAD_COMPLETE_FAILED')
      }

      const completedVersion =
        completeResult && typeof completeResult.VersionId === 'string'
          ? completeResult.VersionId
          : undefined
      let head: unknown
      try {
        head = await dependencies.s3.send(
          new HeadObjectCommand({
            Bucket: config.sourceBucket,
            Key: plan.sourceKey,
            ...(completedVersion ? { VersionId: completedVersion } : {}),
            ChecksumMode: 'ENABLED',
          }),
        )
      } catch {
        awsFail('OBJECT_INTEGRITY_FAILED')
      }
      if (!isRecord(head)) awsFail('OBJECT_INTEGRITY_FAILED')
      const versionId = head.VersionId
      const checksumSha256 = head.ChecksumSHA256
      const expectedCompositeChecksum = compositeSha256Base64(checksums)
      if (
        head.ContentLength !== plan.sizeBytes ||
        head.ContentType !== plan.contentType ||
        head.ServerSideEncryption !== 'aws:kms' ||
        head.SSEKMSKeyId !== config.kmsKeyArn ||
        head.BucketKeyEnabled !== true ||
        head.ChecksumType !== 'COMPOSITE' ||
        typeof versionId !== 'string' ||
        !versionId ||
        versionId.length > 1_024 ||
        (completedVersion !== undefined && versionId !== completedVersion) ||
        !isCompositeSha256(checksumSha256, plan.partCount) ||
        checksumSha256 !== expectedCompositeChecksum ||
        (completeResult !== null &&
          completeResult.ChecksumSHA256 !== undefined &&
          completeResult.ChecksumSHA256 !== checksumSha256) ||
        !exactMetadata(head.Metadata, expectedMetadata(plan))
      ) {
        awsFail('OBJECT_INTEGRITY_FAILED')
      }

      let magicBytes: Uint8Array
      try {
        const result = await dependencies.s3.send(
          new GetObjectCommand({
            Bucket: config.sourceBucket,
            Key: plan.sourceKey,
            VersionId: versionId,
            Range: 'bytes=0-7',
          }),
        )
        magicBytes = await bodyToBytes(isRecord(result) ? result.Body : undefined)
        assertScannedPacketMagic(plan.contentType, magicBytes)
      } catch (error) {
        if (
          error instanceof ScannedPacketAwsError &&
          error.code !== 'OBJECT_INTEGRITY_FAILED'
        ) {
          throw error
        }
        awsFail('OBJECT_INTEGRITY_FAILED')
      }

      let textractResult: unknown
      let trustedPageCount: number
      try {
        trustedPageCount = await dependencies.inspectSourcePageCount({
          bucket: config.sourceBucket,
          key: plan.sourceKey,
          versionId,
          sizeBytes: plan.sizeBytes,
          contentType: plan.contentType,
        })
      } catch {
        awsFail('SOURCE_PAGE_COUNT_FAILED')
      }
      if (
        !Number.isSafeInteger(trustedPageCount) ||
        trustedPageCount < 1 ||
        trustedPageCount > SCANNED_PACKET_MAX_PAGES
      ) {
        awsFail('SOURCE_PAGE_COUNT_FAILED')
      }

      try {
        textractResult = await dependencies.textract.send(
          new StartDocumentTextDetectionCommand({
            DocumentLocation: {
              S3Object: {
                Bucket: config.sourceBucket,
                Name: plan.sourceKey,
                Version: versionId,
              },
            },
            ClientRequestToken: `scan-${plan.ingestionId}`,
            JobTag: plan.ingestionId,
            KMSKeyId: config.kmsKeyArn,
            NotificationChannel: {
              SNSTopicArn: config.textractTopicArn,
              RoleArn: config.textractPublishRoleArn,
            },
            OutputConfig: {
              S3Bucket: config.resultBucket,
              S3Prefix: `textract-output/${plan.ingestionId}`,
            },
          }),
        )
      } catch {
        awsFail('TEXTRACT_START_FAILED')
      }
      const jobId =
        isRecord(textractResult) && typeof textractResult.JobId === 'string'
          ? textractResult.JobId
          : ''
      if (!JOB_ID_PATTERN.test(jobId)) awsFail('TEXTRACT_START_FAILED')

      const binding: ScannedPacketJobBinding = {
        version: SCANNED_PACKET_JOB_BINDING_VERSION,
        ingestionId: plan.ingestionId,
        uploadSessionId: plan.uploadSessionId,
        declaredPageCount: plan.declaredPageCount,
        trustedPageCount,
        source: {
          bucket: config.sourceBucket,
          key: plan.sourceKey,
          versionId,
          sizeBytes: plan.sizeBytes,
          partCount: plan.partCount,
          checksumSha256,
          contentType: plan.contentType,
        },
        textract: {
          api: 'StartDocumentTextDetection',
          jobId,
        },
      }
      await persistBinding({ s3: dependencies.s3, config, binding })
      return { jobId, binding }
    },
  }
}

export function asScannedPacketCommandClient(
  client: S3Client | TextractClient,
): CommandClient {
  return client as unknown as CommandClient
}
