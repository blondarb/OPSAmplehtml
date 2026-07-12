import { SourceType, FILE_CONSTRAINTS } from './types'

export const MAX_PDF_PAGE_COUNT = 3_000

// Native PDF extraction occasionally returns only a page footer, watermark, or
// letterhead for an otherwise scanned page. Keep this detector bounded: long
// pages are not classified from an unbounded vocabulary/regex scan, while the
// sparse pages that need this safeguard are fully represented by this window.
const NATIVE_PDF_SUSPICIOUS_PAGE_SCAN_LIMIT = 2_048
const NATIVE_PDF_SHORT_PAGE_LIMIT = 512

const PDF_ARTIFACT_TOKENS = new Set([
  'attachment',
  'attached',
  'blank',
  'confidential',
  'copy',
  'document',
  'draft',
  'figure',
  'image',
  'intentionally',
  'page',
  'photo',
  'photograph',
  'scan',
  'scanned',
  'scanner',
  'void',
  'watermark',
])

const PDF_PAGINATION_TOKENS = new Set(['of', 'p', 'page', 'pg'])

const PDF_CLINICAL_CONTENT_PATTERN =
  /\b(?:acute|assessment|aphasia|ataxia|cognitive|confusion|continue|diagnos(?:is|es|ed|tic)|dizz(?:y|iness)|eeg|emergency|exam|follow[ -]?up|gait|headache|history|impression|medication|memory|migraine|mri|neurologic|normal|numb(?:ness)?|onset|pain|parkinson(?:ism|s)?|plan|referral|reports?|request(?:ed)?|seizures?|speech|stable|stroke|sudden|symptoms?|tia|tremor|urgent|vertigo|vision|weakness)\b/i

const PDF_ORGANIZATION_PATTERN =
  /\b(?:associates|center|centre|clinic|department|health|healthcare|hospital|institute|medical|neurology|neuroscience|practice)\b/i

const PDF_CONTACT_OR_ADDRESS_PATTERN =
  /(?:\b(?:fax|phone|tel|telephone|www)\b|https?:\/\/|\b\d{5}(?:-\d{4})?\b|\b\d{3}[-.)\s]+\d{3}[-.\s]+\d{4}\b|\b(?:avenue|ave|boulevard|blvd|drive|dr|highway|hwy|lane|ln|road|rd|street|st|suite)\b)/i

const PDF_DEMOGRAPHIC_HEADER_PATTERN =
  /\b(?:date of birth|dob|medical record|mrn|patient id)\b/i

export interface ParsedFilePage {
  pageNumber: number
  text: string
  extractionMethod: 'native_text' | 'ocr'
  extractionConfidence: number | null
}

export interface ParsedFile {
  text: string
  pages: ParsedFilePage[]
  sourceType: SourceType
  filename: string
  originalSize: number
}

export interface PartialParsedFile extends ParsedFile {
  totalPageCount: number
  missingPageNumbers: number[]
}

export class FileParseError extends Error {
  constructor(
    message: string,
    public code:
      | 'INVALID_TYPE'
      | 'TOO_LARGE'
      | 'PARSE_FAILED'
      | 'EMPTY_CONTENT'
      | 'OCR_REQUIRED',
    public readonly pageNumbers?: number[],
    public readonly partialResult?: PartialParsedFile,
  ) {
    super(message)
    this.name = 'FileParseError'
  }
}

/**
 * Parse an uploaded file (PDF, DOCX, or TXT) and extract text content.
 * Validates file type and size before parsing.
 */
export async function parseUploadedFile(file: File): Promise<ParsedFile> {
  // Validate file size
  if (file.size > FILE_CONSTRAINTS.MAX_FILE_SIZE_BYTES) {
    throw new FileParseError(
      `File exceeds maximum size of ${FILE_CONSTRAINTS.MAX_FILE_SIZE_DISPLAY}`,
      'TOO_LARGE'
    )
  }

  // Determine source type from extension (more reliable than MIME for .docx)
  const ext = getFileExtension(file.name)
  const sourceType = extensionToSourceType(ext)

  if (!sourceType) {
    throw new FileParseError(
      `Unsupported file type: ${ext || 'unknown'}. Accepted: ${FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(', ')}`,
      'INVALID_TYPE'
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  let pages: ParsedFilePage[]

  try {
    switch (sourceType) {
      case 'pdf':
        pages = await parsePdf(buffer)
        break
      case 'docx':
        pages = [nativeTextPage(1, await parseDocx(buffer))]
        break
      case 'txt':
        pages = [nativeTextPage(1, buffer.toString('utf-8'))]
        break
      default:
        throw new FileParseError(`Unsupported source type: ${sourceType}`, 'INVALID_TYPE')
    }
  } catch (err) {
    if (err instanceof FileParseError) throw err
    throw new FileParseError(
      `Failed to parse ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      'PARSE_FAILED'
    )
  }

  const normalizedPages = pages.map((page) => ({
    ...page,
    text: page.text.trim(),
  }))
  const unreliablePageNumbers = normalizedPages
    .filter(
      (page) =>
        !page.text ||
        (sourceType === 'pdf' && isSuspiciousNativePdfPageText(page.text)),
    )
    .map((page) => page.pageNumber)

  if (sourceType === 'pdf' && unreliablePageNumbers.length > 0) {
    const pageLabel = unreliablePageNumbers.length === 1 ? 'page' : 'pages'
    const unreliablePageNumberSet = new Set(unreliablePageNumbers)
    const availablePages = normalizedPages.filter(
      (page) => page.text && !unreliablePageNumberSet.has(page.pageNumber),
    )
    const partialText = availablePages.map((page) => page.text).join('\n\n')
    throw new FileParseError(
      `Reliable native text could not be extracted from PDF ${pageLabel} ${unreliablePageNumbers.join(', ')} in ${file.name}. OCR is required before this referral can be screened safely.`,
      'OCR_REQUIRED',
      unreliablePageNumbers,
      partialText
        ? {
            text: partialText,
            pages: availablePages,
            sourceType,
            filename: file.name,
            originalSize: file.size,
            totalPageCount: normalizedPages.length,
            missingPageNumbers: unreliablePageNumbers,
          }
        : undefined,
    )
  }

  pages = normalizedPages
  const text = pages.map((page) => page.text).join('\n\n')

  if (!text) {
    throw new FileParseError(
      `No text content could be extracted from ${file.name}. The file may be scanned/image-based (OCR not supported in this version).`,
      'EMPTY_CONTENT'
    )
  }

  return {
    text,
    pages,
    sourceType,
    filename: file.name,
    originalSize: file.size,
  }
}

/**
 * Returns true only for bounded, high-confidence native-PDF extraction
 * artifacts. This is deliberately not a general clinical-text classifier:
 * uncertain pages are sent to OCR/manual review, while concise clinical
 * statements such as "Assessment: migraine." remain usable native text.
 */
function isSuspiciousNativePdfPageText(text: string): boolean {
  // The caller supplies its already-trimmed page text. All content inspection
  // below is capped by NATIVE_PDF_SUSPICIOUS_PAGE_SCAN_LIMIT.
  if (!text) return true

  const sample = text.slice(0, NATIVE_PDF_SUSPICIOUS_PAGE_SCAN_LIMIT)
  const tokens = sample.toLowerCase().match(/[a-z0-9]+/g) ?? []
  const alphaNumericCount = sample.replace(/[^a-z0-9]/gi, '').length

  if (alphaNumericCount <= 1 || tokens.length === 0) return true

  const isOrdinal = (token: string) => /^\d+$/.test(token) || /^[ivxlcdm]+$/.test(token)
  const paginationOnly =
    tokens.some((token) => PDF_PAGINATION_TOKENS.has(token)) &&
    tokens.every(
      (token) => PDF_PAGINATION_TOKENS.has(token) || isOrdinal(token),
    )
  if (paginationOnly) return true

  const artifactOnly = tokens.every(
    (token) => PDF_ARTIFACT_TOKENS.has(token) || isOrdinal(token),
  )
  if (artifactOnly) return true

  const hasClinicalContent = PDF_CLINICAL_CONTENT_PATTERN.test(sample)
  if (hasClinicalContent) return false

  if (text.length > NATIVE_PDF_SHORT_PAGE_LIMIT) return false

  const hasOrganizationMarker = PDF_ORGANIZATION_PATTERN.test(sample)
  const hasContactOrAddressMarker = PDF_CONTACT_OR_ADDRESS_PATTERN.test(sample)
  const hasDemographicHeaderMarker = PDF_DEMOGRAPHIC_HEADER_PATTERN.test(sample)
  const hasArtifactMarker = tokens.some((token) => PDF_ARTIFACT_TOKENS.has(token))

  if (
    hasOrganizationMarker &&
    (hasContactOrAddressMarker || hasDemographicHeaderMarker || hasArtifactMarker)
  ) {
    return true
  }

  // A short organization/logo line is not enough evidence that the page body
  // was extracted. A concise clinical statement wins above this rule.
  if (hasOrganizationMarker && tokens.length <= 6) return true

  return false
}

function nativeTextPage(pageNumber: number, text: string): ParsedFilePage {
  return {
    pageNumber,
    text,
    extractionMethod: 'native_text',
    extractionConfidence: null,
  }
}

async function parsePdf(buffer: Buffer): Promise<ParsedFilePage[]> {
  // Use unpdf instead of pdf-parse — it's designed for serverless environments
  // and doesn't require browser APIs (DOMMatrix, web workers, etc.)
  const { extractText } = await import('unpdf')
  const extraction = await extractText(new Uint8Array(buffer))
  const extractedPages = Array.isArray(extraction.text) ? extraction.text : []
  const reportedPageCount =
    Number.isSafeInteger(extraction.totalPages) && extraction.totalPages > 0
      ? extraction.totalPages
      : 0
  if (
    reportedPageCount > MAX_PDF_PAGE_COUNT ||
    extractedPages.length > MAX_PDF_PAGE_COUNT
  ) {
    throw new FileParseError(
      `PDF exceeds the verified ${MAX_PDF_PAGE_COUNT}-page safety limit. Human review is required.`,
      'TOO_LARGE',
    )
  }
  let extractedTextCharacters = 0
  for (const page of extractedPages) {
    if (typeof page !== 'string') continue
    extractedTextCharacters += page.length
    if (extractedTextCharacters > FILE_CONSTRAINTS.MAX_PACKET_TEXT_LENGTH) {
      throw new FileParseError(
        'Extracted PDF text exceeds the verified packet safety limit. Human review is required.',
        'TOO_LARGE',
      )
    }
  }
  const pageCount = Math.max(reportedPageCount, extractedPages.length)

  if (pageCount === 0) {
    throw new FileParseError(
      'No PDF pages could be read. OCR is required before this referral can be screened safely.',
      'OCR_REQUIRED',
      [],
    )
  }

  return Array.from({ length: pageCount }, (_, index) =>
    nativeTextPage(
      index + 1,
      typeof extractedPages[index] === 'string' ? extractedPages[index] : '',
    ),
  )
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot === -1) return ''
  return filename.substring(dot).toLowerCase()
}

function extensionToSourceType(ext: string): SourceType | null {
  switch (ext) {
    case '.pdf': return 'pdf'
    case '.docx': return 'docx'
    case '.txt': return 'txt'
    default: return null
  }
}
