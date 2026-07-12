import type { SourceType } from './types'

export interface BoundExtractionReference {
  extraction_id: string
  source_filename?: string
}

export interface BoundExtractionTriageRequest {
  source_extraction_id: string
  source_type: SourceType
}

function hasOwn(record: object, property: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(record, property)
}

function sourceTypeForFilename(
  extraction: BoundExtractionReference,
): SourceType {
  if (!hasOwn(extraction, 'source_filename')) {
    return 'paste'
  }

  const sourceFilename: unknown = extraction.source_filename

  if (typeof sourceFilename !== 'string') {
    throw new Error('Unsupported persisted referral source type.')
  }

  const normalizedFilename = sourceFilename.trim().toLowerCase()

  if (normalizedFilename.endsWith('.pdf')) return 'pdf'
  if (normalizedFilename.endsWith('.docx')) return 'docx'
  if (normalizedFilename.endsWith('.txt')) return 'txt'

  throw new Error('Unsupported persisted referral source type.')
}

export function buildBoundExtractionTriageRequest(
  extraction: BoundExtractionReference,
): BoundExtractionTriageRequest {
  if (
    typeof extraction !== 'object' ||
    extraction === null ||
    Array.isArray(extraction) ||
    !hasOwn(extraction, 'extraction_id')
  ) {
    throw new Error('Source extraction identifier is missing.')
  }

  const extractionId: unknown = extraction.extraction_id
  const sourceExtractionId =
    typeof extractionId === 'string' ? extractionId.trim() : ''

  if (!sourceExtractionId) {
    throw new Error('Source extraction identifier is missing.')
  }

  return {
    source_extraction_id: sourceExtractionId,
    source_type: sourceTypeForFilename(extraction),
  }
}
