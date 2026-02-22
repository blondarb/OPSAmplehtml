import { describe, it, expect, vi } from 'vitest'
import { parseUploadedFile, FileParseError } from '@/lib/triage/fileParser'
import { FILE_CONSTRAINTS } from '@/lib/triage/types'

// Mock pdf-parse (v2.x class-based API)
vi.mock('pdf-parse', () => {
  class MockPDFParse {
    async getText() {
      return {
        text: 'Parsed PDF content: Patient presents with headache and dizziness.',
        pages: [],
        total: 1,
      }
    }
  }
  return { PDFParse: MockPDFParse }
})

// Mock mammoth (dynamic import resolves with extractRawText at top level)
const mockExtractRawText = vi.fn(async ({ buffer }: { buffer: Buffer }) => ({
  value: 'Parsed DOCX content: Patient with seizure history.',
  messages: [],
}))
vi.mock('mammoth', () => ({
  default: { extractRawText: mockExtractRawText },
  extractRawText: mockExtractRawText,
}))

function createMockFile(name: string, content: string, type: string, size?: number): File {
  const blob = new Blob([content], { type })
  const file = new File([blob], name, { type })
  if (size !== undefined) {
    Object.defineProperty(file, 'size', { value: size })
  }
  return file
}

describe('parseUploadedFile', () => {
  it('parses a TXT file', async () => {
    const file = createMockFile('referral.txt', 'Patient presents with chronic migraine', 'text/plain')
    const result = await parseUploadedFile(file)
    expect(result.sourceType).toBe('txt')
    expect(result.text).toBe('Patient presents with chronic migraine')
    expect(result.filename).toBe('referral.txt')
  })

  it('parses a PDF file using pdf-parse mock', async () => {
    const file = createMockFile('note.pdf', 'dummy pdf bytes', 'application/pdf')
    const result = await parseUploadedFile(file)
    expect(result.sourceType).toBe('pdf')
    expect(result.text).toContain('Parsed PDF content')
  })

  it('parses a DOCX file using mammoth mock', async () => {
    const file = createMockFile(
      'note.docx',
      'dummy docx bytes',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    const result = await parseUploadedFile(file)
    expect(result.sourceType).toBe('docx')
    expect(result.text).toContain('Parsed DOCX content')
  })

  it('rejects unsupported file types', async () => {
    const file = createMockFile('image.png', 'fake png', 'image/png')
    await expect(parseUploadedFile(file)).rejects.toThrow(FileParseError)
    await expect(parseUploadedFile(file)).rejects.toMatchObject({ code: 'INVALID_TYPE' })
  })

  it('rejects files exceeding size limit', async () => {
    const file = createMockFile('huge.txt', 'x', 'text/plain', FILE_CONSTRAINTS.MAX_FILE_SIZE_BYTES + 1)
    await expect(parseUploadedFile(file)).rejects.toThrow(FileParseError)
    await expect(parseUploadedFile(file)).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })

  it('rejects empty files', async () => {
    const file = createMockFile('empty.txt', '', 'text/plain')
    await expect(parseUploadedFile(file)).rejects.toThrow(FileParseError)
    await expect(parseUploadedFile(file)).rejects.toMatchObject({ code: 'EMPTY_CONTENT' })
  })

  it('truncates text exceeding max length', async () => {
    const longText = 'A'.repeat(FILE_CONSTRAINTS.MAX_TEXT_LENGTH + 1000)
    const file = createMockFile('long.txt', longText, 'text/plain')
    const result = await parseUploadedFile(file)
    expect(result.text.length).toBe(FILE_CONSTRAINTS.MAX_TEXT_LENGTH)
  })

  it('trims whitespace from extracted text', async () => {
    const file = createMockFile('spaced.txt', '  \n  Patient note here  \n  ', 'text/plain')
    const result = await parseUploadedFile(file)
    expect(result.text).toBe('Patient note here')
  })

  it('determines source type from extension not MIME type', async () => {
    // File with wrong MIME but correct extension
    const file = createMockFile('note.txt', 'content', 'application/octet-stream')
    const result = await parseUploadedFile(file)
    expect(result.sourceType).toBe('txt')
  })
})
