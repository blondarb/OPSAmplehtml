import type { SQSEvent, SQSBatchResponse, SQSRecord } from 'aws-lambda'

import {
  parseScannedPacketJobBinding,
  type ScannedPacketJobBinding,
} from '@/lib/triage/scannedPacketAws'
import {
  ScannedPacketIngestionError,
  assembleScannedPacketManifest,
  type ScannedPacketPageManifest,
} from '@/lib/triage/scannedPacketIngestion'
import {
  parseScannedPacketCompletionMessage,
  type ScannedPacketCompletionMessage,
} from './triageScannedPacketMessage'

export const SCANNED_PACKET_REVIEW_OUTCOME_VERSION =
  'neurology-scanned-packet-review-outcome-v1'

export type ScannedPacketReviewReasonCode =
  | 'textract_failed'
  | 'textract_error'
  | 'textract_result_incomplete'
  | 'textract_response_invalid'
  | 'textract_pagination_invalid'
  | 'page_coverage_invalid'
  | 'all_pages_unreadable'
  | 'declared_page_count_mismatch'

export interface ScannedPacketReviewOutcome {
  version: typeof SCANNED_PACKET_REVIEW_OUTCOME_VERSION
  ingestionId: string
  disposition: 'human_review_required'
  reasonCode: ScannedPacketReviewReasonCode
  sourceVersionId: string
  textract: {
    api: 'StartDocumentTextDetection'
    jobId: string
  }
}

export interface ScannedPacketWorkerDependencies {
  loadBinding: (ingestionId: string) => Promise<ScannedPacketJobBinding | null>
  getResultPage: (input: {
    jobId: string
    nextToken: string | undefined
  }) => Promise<unknown>
  persistManifest: (input: {
    binding: ScannedPacketJobBinding
    manifest: ScannedPacketPageManifest
  }) => Promise<'created' | 'duplicate'>
  persistReviewOutcome: (input: {
    binding: ScannedPacketJobBinding
    outcome: ScannedPacketReviewOutcome
  }) => Promise<'created' | 'duplicate'>
  maxResultRequests?: number
}

const DEFAULT_MAX_RESULT_REQUESTS = 10_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactBinding(
  message: ScannedPacketCompletionMessage,
  binding: ScannedPacketJobBinding,
): boolean {
  return (
    binding.ingestionId === message.ingestionId &&
    binding.textract.api === message.api &&
    binding.textract.jobId === message.jobId &&
    binding.source.bucket === message.documentLocation.bucket &&
    binding.source.key === message.documentLocation.key
  )
}

function reviewOutcome(
  binding: ScannedPacketJobBinding,
  reasonCode: ScannedPacketReviewReasonCode,
): ScannedPacketReviewOutcome {
  return {
    version: SCANNED_PACKET_REVIEW_OUTCOME_VERSION,
    ingestionId: binding.ingestionId,
    disposition: 'human_review_required',
    reasonCode,
    sourceVersionId: binding.source.versionId,
    textract: {
      api: 'StartDocumentTextDetection',
      jobId: binding.textract.jobId,
    },
  }
}

async function persistReview(
  dependencies: ScannedPacketWorkerDependencies,
  binding: ScannedPacketJobBinding,
  reasonCode: ScannedPacketReviewReasonCode,
): Promise<boolean> {
  try {
    await dependencies.persistReviewOutcome({
      binding,
      outcome: reviewOutcome(binding, reasonCode),
    })
    return true
  } catch {
    return false
  }
}

function terminalResponseReason(
  response: unknown,
): ScannedPacketReviewReasonCode | null {
  if (!isRecord(response)) return 'textract_response_invalid'
  if (response.JobStatus !== 'SUCCEEDED') {
    return 'textract_result_incomplete'
  }
  if (
    response.Warnings !== undefined &&
    (!Array.isArray(response.Warnings) || response.Warnings.length > 0)
  ) {
    return 'textract_result_incomplete'
  }
  return null
}

function nextToken(response: unknown):
  | { kind: 'done' }
  | { kind: 'next'; token: string }
  | { kind: 'invalid' } {
  if (!isRecord(response)) return { kind: 'invalid' }
  if (response.NextToken === undefined) return { kind: 'done' }
  if (
    typeof response.NextToken !== 'string' ||
    !response.NextToken.trim() ||
    response.NextToken.length > 1_024
  ) {
    return { kind: 'invalid' }
  }
  return { kind: 'next', token: response.NextToken }
}

function reasonForAssemblyError(
  error: ScannedPacketIngestionError,
): ScannedPacketReviewReasonCode {
  switch (error.code) {
    case 'TEXTRACT_RESULT_INCOMPLETE':
      return 'textract_result_incomplete'
    case 'PAGE_COVERAGE_INVALID':
      return 'page_coverage_invalid'
    case 'ALL_PAGES_UNREADABLE':
      return 'all_pages_unreadable'
    default:
      return 'textract_response_invalid'
  }
}

async function processRecord(
  record: SQSRecord,
  dependencies: ScannedPacketWorkerDependencies,
): Promise<boolean> {
  let message: ScannedPacketCompletionMessage
  try {
    message = parseScannedPacketCompletionMessage(record.body)
  } catch {
    return false
  }

  let binding: ScannedPacketJobBinding
  try {
    const loaded = await dependencies.loadBinding(message.ingestionId)
    if (!loaded) return false
    binding = parseScannedPacketJobBinding(loaded)
  } catch {
    return false
  }
  if (!exactBinding(message, binding)) return false

  if (message.status !== 'SUCCEEDED') {
    return persistReview(
      dependencies,
      binding,
      message.status === 'FAILED' ? 'textract_failed' : 'textract_error',
    )
  }

  const maxResultRequests =
    dependencies.maxResultRequests ?? DEFAULT_MAX_RESULT_REQUESTS
  if (
    !Number.isSafeInteger(maxResultRequests) ||
    maxResultRequests < 1 ||
    maxResultRequests > DEFAULT_MAX_RESULT_REQUESTS
  ) {
    return false
  }

  const responses: unknown[] = []
  const seenTokens = new Set<string>()
  let token: string | undefined
  for (let requestCount = 0; ; requestCount += 1) {
    if (requestCount >= maxResultRequests) {
      return persistReview(
        dependencies,
        binding,
        'textract_pagination_invalid',
      )
    }
    let response: unknown
    try {
      response = await dependencies.getResultPage({
        jobId: binding.textract.jobId,
        nextToken: token,
      })
    } catch {
      return false
    }
    const responseReason = terminalResponseReason(response)
    if (responseReason) {
      return persistReview(dependencies, binding, responseReason)
    }
    responses.push(response)
    const pagination = nextToken(response)
    if (pagination.kind === 'invalid') {
      return persistReview(
        dependencies,
        binding,
        'textract_pagination_invalid',
      )
    }
    if (pagination.kind === 'done') break
    if (seenTokens.has(pagination.token)) {
      return persistReview(
        dependencies,
        binding,
        'textract_pagination_invalid',
      )
    }
    seenTokens.add(pagination.token)
    token = pagination.token
  }

  let manifest: ScannedPacketPageManifest
  try {
    manifest = assembleScannedPacketManifest({
      ingestionId: binding.ingestionId,
      trustedSourcePageCount: binding.trustedPageCount,
      source: binding.source,
      textract: binding.textract,
      responses,
    })
  } catch (error) {
    if (!(error instanceof ScannedPacketIngestionError)) return false
    return persistReview(
      dependencies,
      binding,
      reasonForAssemblyError(error),
    )
  }

  if (
    binding.declaredPageCount !== null &&
    binding.declaredPageCount !== manifest.pageCount
  ) {
    return persistReview(
      dependencies,
      binding,
      'declared_page_count_mismatch',
    )
  }
  try {
    await dependencies.persistManifest({ binding, manifest })
    return true
  } catch {
    return false
  }
}

export async function processScannedPacketSqsEvent(
  event: SQSEvent,
  dependencies: ScannedPacketWorkerDependencies,
): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = []
  for (const record of event.Records) {
    if (!(await processRecord(record, dependencies))) {
      batchItemFailures.push({ itemIdentifier: record.messageId })
    }
  }
  return { batchItemFailures }
}
