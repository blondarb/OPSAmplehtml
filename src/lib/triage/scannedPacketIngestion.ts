import { createHash } from 'node:crypto'

import {
  MIN_SCANNABLE_OCR_CONFIDENCE,
  type LongPacketSourcePage,
} from './longPacketPlanner'

export const SCANNED_PACKET_SOURCE_MANIFEST_VERSION =
  'neurology-scanned-packet-page-manifest-v1'
export const SCANNED_PACKET_MAX_BYTES = 500_000_000
export const SCANNED_PACKET_MAX_PAGES = 3_000
export const SCANNED_PACKET_PART_BYTES = 8 * 1024 * 1024
export const SCANNED_PACKET_MAX_PARTS = 10_000

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256_BASE64_PATTERN = /^[A-Za-z0-9+/]{43}=$/
const TEXTRACT_JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const S3_BUCKET_PATTERN = /^(?!\d{1,3}(?:\.\d{1,3}){3}$)(?!.*\.\.)(?!.*\.-)(?!.*-\.)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/

export type ScannedPacketContentType = 'application/pdf' | 'image/tiff'
export type ScannedPacketPageStatus = 'readable' | 'blank_or_unreadable'
export type ScannedPacketHumanReviewReason =
  | 'blank_or_unreadable_page'
  | 'low_ocr_confidence'

export type ScannedPacketIngestionErrorCode =
  | 'UPLOAD_REQUEST_INVALID'
  | 'UPLOAD_PARTS_INVALID'
  | 'DOCUMENT_FORMAT_INVALID'
  | 'TEXTRACT_RESPONSE_INVALID'
  | 'TEXTRACT_RESULT_INCOMPLETE'
  | 'PAGE_COVERAGE_INVALID'
  | 'ALL_PAGES_UNREADABLE'
  | 'MANIFEST_INTEGRITY_INVALID'
  | 'MANIFEST_NOT_TRIAGEABLE'

export class ScannedPacketIngestionError extends Error {
  readonly name = 'ScannedPacketIngestionError'

  constructor(readonly code: ScannedPacketIngestionErrorCode) {
    super('Scanned-packet ingestion validation failed.')
  }
}

export interface ScannedPacketUploadPartPlan {
  partNumber: number
  sizeBytes: number
}

export interface ScannedPacketUploadPlan {
  ingestionId: string
  uploadSessionId: string
  sourceKey: string
  resultKey: string
  bindingKey: string
  contentType: ScannedPacketContentType
  sizeBytes: number
  declaredPageCount: number | null
  partCount: number
  parts: ScannedPacketUploadPartPlan[]
}

export interface ScannedPacketCompletionPart {
  partNumber: number
  etag: string
  checksumSha256: string
}

export interface ValidatedScannedPacketCompletionPart {
  PartNumber: number
  ETag: string
  ChecksumSHA256: string
}

export interface ScannedPacketSourceProvenance {
  bucket: string
  key: string
  versionId: string
  sizeBytes: number
  partCount: number
  checksumSha256: string
  contentType: ScannedPacketContentType
}

export interface ScannedPacketTextractProvenance {
  jobId: string
  api: 'StartDocumentTextDetection'
}

export interface ScannedPacketManifestPage {
  pageNumber: number
  text: string
  extractionMethod: 'ocr'
  extractionConfidence: number | null
  status: ScannedPacketPageStatus
  lineBlockCount: number
  textSha256: string
}

export interface ScannedPacketPageManifest {
  version: typeof SCANNED_PACKET_SOURCE_MANIFEST_VERSION
  ingestionId: string
  source: ScannedPacketSourceProvenance
  textract: ScannedPacketTextractProvenance
  pageCount: number
  pages: ScannedPacketManifestPage[]
  coverageStatus: 'complete' | 'incomplete'
  dataQualityStatus: 'complete' | 'incomplete'
  humanReviewRequired: boolean
  humanReviewReasons: ScannedPacketHumanReviewReason[]
  packetTextSha256: string
  manifestSha256: string
}

interface TextractResponseRecord {
  JobStatus?: unknown
  DocumentMetadata?: unknown
  Blocks?: unknown
  NextToken?: unknown
  Warnings?: unknown
}

function fail(code: ScannedPacketIngestionErrorCode): never {
  throw new ScannedPacketIngestionError(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizedUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    fail('UPLOAD_REQUEST_INVALID')
  }
  return value.toLowerCase()
}

function normalizeContentType(value: unknown): ScannedPacketContentType {
  if (value === 'application/pdf') return value
  if (value === 'image/tiff' || value === 'image/tif') return 'image/tiff'
  fail('UPLOAD_REQUEST_INVALID')
}

function isValidBucket(value: unknown): value is string {
  return typeof value === 'string' && S3_BUCKET_PATTERN.test(value)
}

export function isSha256Base64(value: unknown): value is string {
  if (typeof value !== 'string' || !SHA256_BASE64_PATTERN.test(value)) {
    return false
  }
  try {
    const decoded = Buffer.from(value, 'base64')
    return decoded.length === 32 && decoded.toString('base64') === value
  } catch {
    return false
  }
}

export function isCompositeSha256(
  value: unknown,
  expectedPartCount?: number,
): value is string {
  if (typeof value !== 'string') return false
  const match = /^([A-Za-z0-9+/]{43}=)-(\d{1,5})$/.exec(value)
  if (!match || !isSha256Base64(match[1])) return false
  const partCount = Number(match[2])
  return (
    Number.isSafeInteger(partCount) &&
    partCount >= 1 &&
    partCount <= SCANNED_PACKET_MAX_PARTS &&
    (expectedPartCount === undefined || partCount === expectedPartCount)
  )
}

export function compositeSha256Base64(partChecksums: unknown): string {
  if (
    !Array.isArray(partChecksums) ||
    partChecksums.length < 1 ||
    partChecksums.length > SCANNED_PACKET_MAX_PARTS ||
    !partChecksums.every(isSha256Base64)
  ) {
    fail('UPLOAD_PARTS_INVALID')
  }
  const binaryChecksums = partChecksums.map((checksum) =>
    Buffer.from(checksum as string, 'base64'),
  )
  const composite = createHash('sha256')
    .update(Buffer.concat(binaryChecksums))
    .digest('base64')
  return `${composite}-${partChecksums.length}`
}

export function scannedPacketSourceKey(
  ingestionId: string,
  contentType: ScannedPacketContentType,
): string {
  const id = normalizedUuid(ingestionId)
  return `quarantine/${id}/source.${contentType === 'application/pdf' ? 'pdf' : 'tiff'}`
}

export function scannedPacketResultKey(ingestionId: string): string {
  return `validated/${normalizedUuid(ingestionId)}/pages.json`
}

export function scannedPacketReviewManifestKey(ingestionId: string): string {
  return `review/${normalizedUuid(ingestionId)}/pages.json`
}

export function scannedPacketBindingKey(ingestionId: string): string {
  return `control/${normalizedUuid(ingestionId)}/binding.json`
}

export function planScannedPacketUpload(input: {
  ingestionId: string
  uploadSessionId: string
  contentType: string
  sizeBytes: number
  declaredPageCount?: number
}): ScannedPacketUploadPlan {
  const ingestionId = normalizedUuid(input.ingestionId)
  const uploadSessionId = normalizedUuid(input.uploadSessionId)
  const contentType = normalizeContentType(input.contentType)
  if (
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes < 1 ||
    input.sizeBytes > SCANNED_PACKET_MAX_BYTES
  ) {
    fail('UPLOAD_REQUEST_INVALID')
  }
  if (
    input.declaredPageCount !== undefined &&
    (!Number.isSafeInteger(input.declaredPageCount) ||
      input.declaredPageCount < 1 ||
      input.declaredPageCount > SCANNED_PACKET_MAX_PAGES)
  ) {
    fail('UPLOAD_REQUEST_INVALID')
  }

  const partCount = Math.ceil(input.sizeBytes / SCANNED_PACKET_PART_BYTES)
  if (partCount < 1 || partCount > SCANNED_PACKET_MAX_PARTS) {
    fail('UPLOAD_REQUEST_INVALID')
  }
  const parts = Array.from({ length: partCount }, (_, index) => {
    const partNumber = index + 1
    const consumed = index * SCANNED_PACKET_PART_BYTES
    return {
      partNumber,
      sizeBytes: Math.min(
        SCANNED_PACKET_PART_BYTES,
        input.sizeBytes - consumed,
      ),
    }
  })

  return {
    ingestionId,
    uploadSessionId,
    sourceKey: scannedPacketSourceKey(ingestionId, contentType),
    resultKey: scannedPacketResultKey(ingestionId),
    bindingKey: scannedPacketBindingKey(ingestionId),
    contentType,
    sizeBytes: input.sizeBytes,
    declaredPageCount: input.declaredPageCount ?? null,
    partCount,
    parts,
  }
}

export function validateScannedPacketCompletionParts(input: {
  expectedChecksums: string[]
  parts: unknown
}): ValidatedScannedPacketCompletionPart[] {
  if (
    !Array.isArray(input.expectedChecksums) ||
    input.expectedChecksums.length < 1 ||
    input.expectedChecksums.length > SCANNED_PACKET_MAX_PARTS ||
    !input.expectedChecksums.every(isSha256Base64) ||
    !Array.isArray(input.parts) ||
    input.parts.length !== input.expectedChecksums.length
  ) {
    fail('UPLOAD_PARTS_INVALID')
  }

  return input.parts.map((part, index) => {
    if (!isRecord(part)) fail('UPLOAD_PARTS_INVALID')
    const keys = Object.keys(part).sort()
    const expectedKeys = ['checksumSha256', 'etag', 'partNumber']
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key, keyIndex) => key !== expectedKeys[keyIndex]) ||
      part.partNumber !== index + 1 ||
      typeof part.etag !== 'string' ||
      part.etag.length < 1 ||
      part.etag.length > 128 ||
      /[\u0000-\u001f\u007f]/.test(part.etag) ||
      !isSha256Base64(part.checksumSha256) ||
      part.checksumSha256 !== input.expectedChecksums[index]
    ) {
      fail('UPLOAD_PARTS_INVALID')
    }
    return {
      PartNumber: index + 1,
      ETag: part.etag,
      ChecksumSHA256: part.checksumSha256,
    }
  })
}

export function assertScannedPacketMagic(
  contentType: ScannedPacketContentType | 'image/tif',
  bytes: Uint8Array,
): void {
  const normalized = normalizeContentType(contentType)
  if (!(bytes instanceof Uint8Array)) fail('DOCUMENT_FORMAT_INVALID')
  if (normalized === 'application/pdf') {
    const pdf = [0x25, 0x50, 0x44, 0x46, 0x2d]
    if (bytes.length < pdf.length || pdf.some((byte, index) => bytes[index] !== byte)) {
      fail('DOCUMENT_FORMAT_INVALID')
    }
    return
  }
  const littleEndian =
    bytes.length >= 4 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x2a &&
    bytes[3] === 0x00
  const bigEndian =
    bytes.length >= 4 &&
    bytes[0] === 0x4d &&
    bytes[1] === 0x4d &&
    bytes[2] === 0x00 &&
    bytes[3] === 0x2a
  if (!littleEndian && !bigEndian) fail('DOCUMENT_FORMAT_INVALID')
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function canonicalJson(value: unknown): string {
  const canonicalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonicalize)
    if (isRecord(item)) {
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, canonicalize(item[key])]),
      )
    }
    return item
  }
  return JSON.stringify(canonicalize(value))
}

function validateSourceProvenance(
  ingestionId: string,
  source: unknown,
): ScannedPacketSourceProvenance {
  if (!isRecord(source)) fail('TEXTRACT_RESPONSE_INVALID')
  let contentType: ScannedPacketContentType
  try {
    contentType = normalizeContentType(source.contentType)
  } catch {
    fail('TEXTRACT_RESPONSE_INVALID')
  }
  if (
    !isValidBucket(source.bucket) ||
    source.key !== scannedPacketSourceKey(ingestionId, contentType) ||
    typeof source.versionId !== 'string' ||
    !source.versionId ||
    source.versionId.length > 1_024 ||
    !Number.isSafeInteger(source.sizeBytes) ||
    (source.sizeBytes as number) < 1 ||
    (source.sizeBytes as number) > SCANNED_PACKET_MAX_BYTES ||
    !Number.isSafeInteger(source.partCount) ||
    (source.partCount as number) < 1 ||
    (source.partCount as number) > SCANNED_PACKET_MAX_PARTS ||
    !isCompositeSha256(source.checksumSha256, source.partCount as number)
  ) {
    fail('TEXTRACT_RESPONSE_INVALID')
  }
  return {
    bucket: source.bucket,
    key: source.key as string,
    versionId: source.versionId,
    sizeBytes: source.sizeBytes as number,
    partCount: source.partCount as number,
    checksumSha256: source.checksumSha256,
    contentType,
  }
}

function validateTextractProvenance(
  textract: unknown,
): ScannedPacketTextractProvenance {
  if (
    !isRecord(textract) ||
    typeof textract.jobId !== 'string' ||
    !TEXTRACT_JOB_ID_PATTERN.test(textract.jobId) ||
    textract.api !== 'StartDocumentTextDetection'
  ) {
    fail('TEXTRACT_RESPONSE_INVALID')
  }
  return {
    jobId: textract.jobId,
    api: 'StartDocumentTextDetection',
  }
}

export function assembleScannedPacketManifest(input: {
  ingestionId: string
  trustedSourcePageCount: number
  source: unknown
  textract: unknown
  responses: unknown
}): ScannedPacketPageManifest {
  let ingestionId: string
  try {
    ingestionId = normalizedUuid(input.ingestionId)
  } catch {
    fail('TEXTRACT_RESPONSE_INVALID')
  }
  const source = validateSourceProvenance(ingestionId, input.source)
  const textract = validateTextractProvenance(input.textract)
  if (
    !Number.isSafeInteger(input.trustedSourcePageCount) ||
    input.trustedSourcePageCount < 1 ||
    input.trustedSourcePageCount > SCANNED_PACKET_MAX_PAGES
  ) {
    fail('PAGE_COVERAGE_INVALID')
  }
  if (!Array.isArray(input.responses) || input.responses.length < 1) {
    fail('TEXTRACT_RESPONSE_INVALID')
  }

  let pageCount: number | null = null
  const pageOrdinals = new Set<number>()
  const blockIds = new Set<string>()
  const paginationTokens = new Set<string>()
  const linesByPage = new Map<number, Array<{ text: string; confidence: number }>>()

  for (const [responseIndex, rawResponse] of input.responses.entries()) {
    if (!isRecord(rawResponse)) fail('TEXTRACT_RESPONSE_INVALID')
    const response = rawResponse as TextractResponseRecord
    if (response.JobStatus !== 'SUCCEEDED') {
      fail('TEXTRACT_RESULT_INCOMPLETE')
    }
    if (
      response.Warnings !== undefined &&
      (!Array.isArray(response.Warnings) || response.Warnings.length > 0)
    ) {
      fail('TEXTRACT_RESULT_INCOMPLETE')
    }
    if (
      !isRecord(response.DocumentMetadata) ||
      !Number.isSafeInteger(response.DocumentMetadata.Pages) ||
      (response.DocumentMetadata.Pages as number) < 1 ||
      (response.DocumentMetadata.Pages as number) > SCANNED_PACKET_MAX_PAGES
    ) {
      fail('TEXTRACT_RESPONSE_INVALID')
    }
    const responsePageCount = response.DocumentMetadata.Pages as number
    if (responsePageCount !== input.trustedSourcePageCount) {
      fail('PAGE_COVERAGE_INVALID')
    }
    if (pageCount === null) pageCount = responsePageCount
    if (pageCount !== responsePageCount) fail('TEXTRACT_RESPONSE_INVALID')
    if (!Array.isArray(response.Blocks)) fail('TEXTRACT_RESPONSE_INVALID')
    if (
      response.NextToken !== undefined &&
      (typeof response.NextToken !== 'string' ||
        !response.NextToken.trim() ||
        response.NextToken.length > 1_024)
    ) {
      fail('TEXTRACT_RESPONSE_INVALID')
    }
    const isLastResponse = responseIndex === input.responses.length - 1
    if (
      (isLastResponse && response.NextToken !== undefined) ||
      (!isLastResponse && response.NextToken === undefined) ||
      (typeof response.NextToken === 'string' &&
        paginationTokens.has(response.NextToken))
    ) {
      fail('TEXTRACT_RESPONSE_INVALID')
    }
    if (typeof response.NextToken === 'string') {
      paginationTokens.add(response.NextToken)
    }

    for (const rawBlock of response.Blocks) {
      if (!isRecord(rawBlock)) fail('TEXTRACT_RESPONSE_INVALID')
      if (rawBlock.BlockType !== 'PAGE' && rawBlock.BlockType !== 'LINE') {
        continue
      }
      if (
        typeof rawBlock.Id !== 'string' ||
        !rawBlock.Id ||
        rawBlock.Id.length > 255 ||
        blockIds.has(rawBlock.Id) ||
        !Number.isSafeInteger(rawBlock.Page) ||
        (rawBlock.Page as number) < 1 ||
        (rawBlock.Page as number) > responsePageCount
      ) {
        fail(
          rawBlock.BlockType === 'PAGE'
            ? 'PAGE_COVERAGE_INVALID'
            : 'TEXTRACT_RESPONSE_INVALID',
        )
      }
      blockIds.add(rawBlock.Id)
      const pageNumber = rawBlock.Page as number
      if (rawBlock.BlockType === 'PAGE') {
        if (pageOrdinals.has(pageNumber)) fail('PAGE_COVERAGE_INVALID')
        pageOrdinals.add(pageNumber)
        continue
      }
      if (
        typeof rawBlock.Text !== 'string' ||
        typeof rawBlock.Confidence !== 'number' ||
        !Number.isFinite(rawBlock.Confidence) ||
        rawBlock.Confidence < 0 ||
        rawBlock.Confidence > 100
      ) {
        fail('TEXTRACT_RESPONSE_INVALID')
      }
      const text = rawBlock.Text.trim()
      if (!text) continue
      const lines = linesByPage.get(pageNumber) ?? []
      lines.push({ text, confidence: rawBlock.Confidence })
      linesByPage.set(pageNumber, lines)
    }
  }

  if (pageCount === null || pageOrdinals.size !== pageCount) {
    fail('PAGE_COVERAGE_INVALID')
  }
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    if (!pageOrdinals.has(pageNumber)) fail('PAGE_COVERAGE_INVALID')
  }

  const pages: ScannedPacketManifestPage[] = []
  let readablePages = 0
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const lines = linesByPage.get(pageNumber) ?? []
    const text = lines.map((line) => line.text).join('\n')
    const readable = lines.length > 0
    if (readable) readablePages += 1
    const minimumConfidence = readable
      ? Math.min(...lines.map((line) => line.confidence))
      : null
    pages.push({
      pageNumber,
      text,
      extractionMethod: 'ocr',
      extractionConfidence:
        minimumConfidence === null
          ? null
          : Math.round(minimumConfidence * 100) / 10_000,
      status: readable ? 'readable' : 'blank_or_unreadable',
      lineBlockCount: lines.length,
      textSha256: sha256Hex(text),
    })
  }

  if (readablePages === 0) fail('ALL_PAGES_UNREADABLE')
  const hasBlankPage = readablePages !== pageCount
  const hasLowConfidencePage = pages.some(
    (page) =>
      page.status === 'readable' &&
      page.extractionConfidence !== null &&
      page.extractionConfidence < MIN_SCANNABLE_OCR_CONFIDENCE,
  )
  const humanReviewReasons: ScannedPacketHumanReviewReason[] = []
  if (hasBlankPage) humanReviewReasons.push('blank_or_unreadable_page')
  if (hasLowConfidencePage) humanReviewReasons.push('low_ocr_confidence')
  const packetTextSha256 = sha256Hex(pages.map((page) => page.text).join('\n\n'))
  const withoutDigest: Omit<ScannedPacketPageManifest, 'manifestSha256'> = {
    version: SCANNED_PACKET_SOURCE_MANIFEST_VERSION,
    ingestionId,
    source,
    textract,
    pageCount,
    pages,
    coverageStatus: hasBlankPage ? ('incomplete' as const) : ('complete' as const),
    dataQualityStatus: hasBlankPage || hasLowConfidencePage
      ? ('incomplete' as const)
      : ('complete' as const),
    humanReviewRequired: humanReviewReasons.length > 0,
    humanReviewReasons,
    packetTextSha256,
  }
  return {
    ...withoutDigest,
    manifestSha256: sha256Hex(canonicalJson(withoutDigest)),
  }
}

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  )
}

export function validateScannedPacketPageManifest(
  value: unknown,
): ScannedPacketPageManifest {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'version',
      'ingestionId',
      'source',
      'textract',
      'pageCount',
      'pages',
      'coverageStatus',
      'dataQualityStatus',
      'humanReviewRequired',
      'humanReviewReasons',
      'packetTextSha256',
      'manifestSha256',
    ]) ||
    value.version !== SCANNED_PACKET_SOURCE_MANIFEST_VERSION ||
    typeof value.ingestionId !== 'string' ||
    !UUID_PATTERN.test(value.ingestionId) ||
    value.ingestionId !== value.ingestionId.toLowerCase() ||
    !Number.isSafeInteger(value.pageCount) ||
    (value.pageCount as number) < 1 ||
    (value.pageCount as number) > SCANNED_PACKET_MAX_PAGES ||
    !Array.isArray(value.pages) ||
    value.pages.length !== value.pageCount ||
    typeof value.packetTextSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.packetTextSha256) ||
    typeof value.manifestSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.manifestSha256)
  ) {
    fail('MANIFEST_INTEGRITY_INVALID')
  }

  if (
    !isRecord(value.source) ||
    !exactKeys(value.source, [
      'bucket',
      'key',
      'versionId',
      'sizeBytes',
      'partCount',
      'checksumSha256',
      'contentType',
    ]) ||
    !isRecord(value.textract) ||
    !exactKeys(value.textract, ['api', 'jobId'])
  ) {
    fail('MANIFEST_INTEGRITY_INVALID')
  }
  try {
    validateSourceProvenance(value.ingestionId as string, value.source)
    validateTextractProvenance(value.textract)
  } catch {
    fail('MANIFEST_INTEGRITY_INVALID')
  }

  const pages = value.pages as unknown[]
  let readablePages = 0
  let hasLowConfidencePage = false
  for (const [index, page] of pages.entries()) {
    if (
      !isRecord(page) ||
      !exactKeys(page, [
        'pageNumber',
        'text',
        'extractionMethod',
        'extractionConfidence',
        'status',
        'lineBlockCount',
        'textSha256',
      ]) ||
      page.pageNumber !== index + 1 ||
      typeof page.text !== 'string' ||
      page.extractionMethod !== 'ocr' ||
      !Number.isSafeInteger(page.lineBlockCount) ||
      (page.lineBlockCount as number) < 0 ||
      typeof page.textSha256 !== 'string' ||
      page.textSha256 !== sha256Hex(page.text)
    ) {
      fail('MANIFEST_INTEGRITY_INVALID')
    }
    if (page.status === 'readable') {
      if (
        !page.text.trim() ||
        (page.lineBlockCount as number) < 1 ||
        typeof page.extractionConfidence !== 'number' ||
        !Number.isFinite(page.extractionConfidence) ||
        page.extractionConfidence < 0 ||
        page.extractionConfidence > 1
      ) {
        fail('MANIFEST_INTEGRITY_INVALID')
      }
      readablePages += 1
      if (page.extractionConfidence < MIN_SCANNABLE_OCR_CONFIDENCE) {
        hasLowConfidencePage = true
      }
    } else if (page.status === 'blank_or_unreadable') {
      if (
        page.text !== '' ||
        page.lineBlockCount !== 0 ||
        page.extractionConfidence !== null
      ) {
        fail('MANIFEST_INTEGRITY_INVALID')
      }
    } else {
      fail('MANIFEST_INTEGRITY_INVALID')
    }
  }
  if (readablePages === 0) fail('MANIFEST_INTEGRITY_INVALID')

  const hasBlankPage = readablePages !== value.pageCount
  const expectedReasons: ScannedPacketHumanReviewReason[] = []
  if (hasBlankPage) expectedReasons.push('blank_or_unreadable_page')
  if (hasLowConfidencePage) expectedReasons.push('low_ocr_confidence')
  if (
    value.coverageStatus !== (hasBlankPage ? 'incomplete' : 'complete') ||
    value.dataQualityStatus !==
      (hasBlankPage || hasLowConfidencePage ? 'incomplete' : 'complete') ||
    value.humanReviewRequired !== (expectedReasons.length > 0) ||
    !Array.isArray(value.humanReviewReasons) ||
    JSON.stringify(value.humanReviewReasons) !== JSON.stringify(expectedReasons) ||
    value.packetTextSha256 !==
      sha256Hex(
        pages
          .map((page) => (page as Record<string, unknown>).text as string)
          .join('\n\n'),
      )
  ) {
    fail('MANIFEST_INTEGRITY_INVALID')
  }

  const withoutDigest: Record<string, unknown> = { ...value }
  delete withoutDigest.manifestSha256
  if (value.manifestSha256 !== sha256Hex(canonicalJson(withoutDigest))) {
    fail('MANIFEST_INTEGRITY_INVALID')
  }
  return value as unknown as ScannedPacketPageManifest
}

export function toLongPacketSourcePages(
  manifest: ScannedPacketPageManifest,
): LongPacketSourcePage[] {
  const validated = validateScannedPacketPageManifest(manifest)
  if (
    validated.humanReviewRequired ||
    validated.coverageStatus !== 'complete' ||
    validated.dataQualityStatus !== 'complete' ||
    validated.pages.some(
      (page, index) =>
        page.pageNumber !== index + 1 ||
        page.status !== 'readable' ||
        !page.text,
    )
  ) {
    fail('MANIFEST_NOT_TRIAGEABLE')
  }
  return validated.pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: page.text,
    extractionMethod: 'ocr',
    extractionConfidence: page.extractionConfidence,
  }))
}
