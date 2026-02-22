import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import { SourceType, FILE_CONSTRAINTS } from './types'

export interface ParsedFile {
  text: string
  sourceType: SourceType
  filename: string
  originalSize: number
}

export class FileParseError extends Error {
  constructor(message: string, public code: 'INVALID_TYPE' | 'TOO_LARGE' | 'PARSE_FAILED' | 'EMPTY_CONTENT') {
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
  let text: string

  try {
    switch (sourceType) {
      case 'pdf':
        text = await parsePdf(buffer)
        break
      case 'docx':
        text = await parseDocx(buffer)
        break
      case 'txt':
        text = buffer.toString('utf-8')
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

  // Clean up extracted text
  text = text.trim()

  if (!text) {
    throw new FileParseError(
      `No text content could be extracted from ${file.name}. The file may be scanned/image-based (OCR not supported in this version).`,
      'EMPTY_CONTENT'
    )
  }

  // Truncate if exceeding max length
  if (text.length > FILE_CONSTRAINTS.MAX_TEXT_LENGTH) {
    text = text.substring(0, FILE_CONSTRAINTS.MAX_TEXT_LENGTH)
  }

  return {
    text,
    sourceType,
    filename: file.name,
    originalSize: file.size,
  }
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const pdf = new PDFParse({ data: new Uint8Array(buffer) })
  const result = await pdf.getText()
  return result.text
}

async function parseDocx(buffer: Buffer): Promise<string> {
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
