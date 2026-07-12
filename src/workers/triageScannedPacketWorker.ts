import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import {
  GetDocumentTextDetectionCommand,
  TextractClient,
} from '@aws-sdk/client-textract'
import type { SQSEvent, SQSBatchResponse } from 'aws-lambda'

import {
  asScannedPacketCommandClient,
  parseScannedPacketJobBinding,
  type ScannedPacketJobBinding,
} from '@/lib/triage/scannedPacketAws'
import {
  scannedPacketBindingKey,
  scannedPacketReviewManifestKey,
  scannedPacketResultKey,
  validateScannedPacketPageManifest,
  type ScannedPacketPageManifest,
} from '@/lib/triage/scannedPacketIngestion'
import {
  processScannedPacketSqsEvent,
  type ScannedPacketReviewOutcome,
  type ScannedPacketWorkerDependencies,
} from './triageScannedPacketWorkerCore'

export interface ScannedPacketWorkerRuntimeConfig {
  sourceBucket: string
  resultBucket: string
  kmsKeyArn: string
  maxResultRequests: number
}

interface CommandClient {
  send(command: object): Promise<unknown>
}

interface RuntimeInput {
  s3: CommandClient
  textract: CommandClient
  config: ScannedPacketWorkerRuntimeConfig
}

const BUCKET_PATTERN = /^(?!\d{1,3}(?:\.\d{1,3}){3}$)(?!.*\.\.)(?!.*\.-)(?!.*-\.)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/
const KMS_KEY_ARN_PATTERN = /^arn:[a-z0-9-]+:kms:[a-z0-9-]+:\d{12}:key\/[0-9a-f-]{36}$/i
const MAX_RESULT_REQUESTS = 10_000

class ScannedPacketWorkerConfigurationError extends Error {
  readonly name = 'ScannedPacketWorkerConfigurationError'

  constructor() {
    super('Scanned-packet worker configuration is invalid.')
  }
}

class ScannedPacketResultPersistenceConflictError extends Error {
  readonly name = 'ScannedPacketResultPersistenceConflictError'

  constructor() {
    super('Scanned-packet result persistence conflict.')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateConfig(
  config: ScannedPacketWorkerRuntimeConfig,
): ScannedPacketWorkerRuntimeConfig {
  if (
    !BUCKET_PATTERN.test(config.sourceBucket) ||
    !BUCKET_PATTERN.test(config.resultBucket) ||
    !KMS_KEY_ARN_PATTERN.test(config.kmsKeyArn) ||
    !Number.isSafeInteger(config.maxResultRequests) ||
    config.maxResultRequests < 1 ||
    config.maxResultRequests > MAX_RESULT_REQUESTS
  ) {
    throw new ScannedPacketWorkerConfigurationError()
  }
  return { ...config }
}

function errorName(error: unknown): string | null {
  return isRecord(error) && typeof error.name === 'string' ? error.name : null
}

async function bodyToString(body: unknown): Promise<string> {
  if (typeof body === 'string') return body
  if (body instanceof Uint8Array) return Buffer.from(body).toString('utf8')
  if (isRecord(body) && typeof body.transformToByteArray === 'function') {
    const bytes = await (
      body.transformToByteArray as () => Promise<Uint8Array>
    )()
    if (bytes instanceof Uint8Array) return Buffer.from(bytes).toString('utf8')
  }
  throw new ScannedPacketResultPersistenceConflictError()
}

async function conditionalPutJson(input: {
  s3: CommandClient
  config: ScannedPacketWorkerRuntimeConfig
  key: string
  value: unknown
}): Promise<'created' | 'duplicate'> {
  const serialized = JSON.stringify(input.value)
  try {
    await input.s3.send(
      new PutObjectCommand({
        Bucket: input.config.resultBucket,
        Key: input.key,
        Body: serialized,
        ContentType: 'application/json',
        CacheControl: 'no-store',
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: input.config.kmsKeyArn,
        BucketKeyEnabled: true,
        ChecksumAlgorithm: 'SHA256',
        IfNoneMatch: '*',
      }),
    )
    return 'created'
  } catch (error) {
    if (
      errorName(error) !== 'PreconditionFailed' &&
      errorName(error) !== 'ConditionalRequestConflict'
    ) {
      throw error
    }
  }

  let existing: unknown
  try {
    existing = await input.s3.send(
      new GetObjectCommand({
        Bucket: input.config.resultBucket,
        Key: input.key,
      }),
    )
  } catch {
    throw new ScannedPacketResultPersistenceConflictError()
  }
  const existingBody = await bodyToString(
    isRecord(existing) ? existing.Body : undefined,
  )
  if (existingBody !== serialized) {
    throw new ScannedPacketResultPersistenceConflictError()
  }
  return 'duplicate'
}

export function createScannedPacketRuntimeDependencies(
  input: RuntimeInput,
): ScannedPacketWorkerDependencies {
  const config = validateConfig(input.config)
  return {
    maxResultRequests: config.maxResultRequests,
    loadBinding: async (ingestionId: string) => {
      let result: unknown
      try {
        result = await input.s3.send(
          new GetObjectCommand({
            Bucket: config.resultBucket,
            Key: scannedPacketBindingKey(ingestionId),
          }),
        )
      } catch (error) {
        if (
          errorName(error) === 'NoSuchKey' ||
          errorName(error) === 'NotFound'
        ) {
          return null
        }
        throw error
      }
      const binding = parseScannedPacketJobBinding(
        await bodyToString(isRecord(result) ? result.Body : undefined),
      )
      if (binding.source.bucket !== config.sourceBucket) {
        throw new ScannedPacketResultPersistenceConflictError()
      }
      return binding
    },
    getResultPage: async ({ jobId, nextToken }) =>
      input.textract.send(
        new GetDocumentTextDetectionCommand({
          JobId: jobId,
          MaxResults: 1_000,
          ...(nextToken ? { NextToken: nextToken } : {}),
        }),
      ),
    persistManifest: async (value: {
      binding: ScannedPacketJobBinding
      manifest: ScannedPacketPageManifest
    }) => {
      const manifest = validateScannedPacketPageManifest(value.manifest)
      if (
        value.binding.ingestionId !== manifest.ingestionId ||
        value.binding.source.versionId !== manifest.source.versionId ||
        value.binding.textract.jobId !== manifest.textract.jobId ||
        value.binding.trustedPageCount !== manifest.pageCount
      ) {
        throw new ScannedPacketResultPersistenceConflictError()
      }
      return conditionalPutJson({
        s3: input.s3,
        config,
        key: manifest.humanReviewRequired
          ? scannedPacketReviewManifestKey(value.binding.ingestionId)
          : scannedPacketResultKey(value.binding.ingestionId),
        value: manifest,
      })
    },
    persistReviewOutcome: async (value: {
      binding: ScannedPacketJobBinding
      outcome: ScannedPacketReviewOutcome
    }) => {
      if (
        value.binding.ingestionId !== value.outcome.ingestionId ||
        value.binding.source.versionId !== value.outcome.sourceVersionId ||
        value.binding.textract.jobId !== value.outcome.textract.jobId
      ) {
        throw new ScannedPacketResultPersistenceConflictError()
      }
      return conditionalPutJson({
        s3: input.s3,
        config,
        key: `review/${value.binding.ingestionId}/outcome.json`,
        value: value.outcome,
      })
    },
  }
}

export function createScannedPacketWorkerHandler(input: RuntimeInput) {
  const dependencies = createScannedPacketRuntimeDependencies(input)
  return (event: SQSEvent): Promise<SQSBatchResponse> =>
    processScannedPacketSqsEvent(event, dependencies)
}

function configFromEnvironment(): ScannedPacketWorkerRuntimeConfig {
  return {
    sourceBucket: process.env.TRIAGE_SCANNED_PACKET_SOURCE_BUCKET ?? '',
    resultBucket: process.env.TRIAGE_SCANNED_PACKET_RESULT_BUCKET ?? '',
    kmsKeyArn: process.env.TRIAGE_SCANNED_PACKET_KMS_KEY_ARN ?? '',
    maxResultRequests: Number(
      process.env.TRIAGE_SCANNED_PACKET_MAX_RESULT_REQUESTS ?? '10000',
    ),
  }
}

let runtimeHandler:
  | ((event: SQSEvent) => Promise<SQSBatchResponse>)
  | undefined

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  if (!runtimeHandler) {
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION
    const s3 = new S3Client({ region })
    const textract = new TextractClient({ region })
    runtimeHandler = createScannedPacketWorkerHandler({
      s3: asScannedPacketCommandClient(s3),
      textract: asScannedPacketCommandClient(textract),
      config: configFromEnvironment(),
    })
  }
  return runtimeHandler(event)
}
