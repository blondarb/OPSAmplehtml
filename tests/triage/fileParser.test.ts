import { beforeEach, describe, it, expect, vi } from 'vitest'
import {
  parseUploadedFile,
  FileParseError,
  MAX_PDF_PAGE_COUNT,
} from '@/lib/triage/fileParser'
import { FILE_CONSTRAINTS } from '@/lib/triage/types'

const unpdfMocks = vi.hoisted(() => ({
  extractText: vi.fn(),
}))

vi.mock('unpdf', () => ({
  extractText: unpdfMocks.extractText,
}))

// Mock mammoth (dynamic import resolves with extractRawText at top level)
const mockExtractRawText = vi.fn(async () => ({
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
  beforeEach(() => {
    unpdfMocks.extractText.mockReset()
    unpdfMocks.extractText.mockResolvedValue({
      text: ['Parsed PDF content: Patient presents with headache and dizziness.'],
      totalPages: 1,
    })
  })

  it('parses a TXT file', async () => {
    const file = createMockFile('referral.txt', 'Patient presents with chronic migraine', 'text/plain')
    const result = await parseUploadedFile(file)
    expect(result.sourceType).toBe('txt')
    expect(result.text).toBe('Patient presents with chronic migraine')
    expect(result.pages).toEqual([
      {
        pageNumber: 1,
        text: 'Patient presents with chronic migraine',
        extractionMethod: 'native_text',
        extractionConfidence: null,
      },
    ])
    expect(result.filename).toBe('referral.txt')
  })

  it('preserves PDF page count, order, and the exact page text used in the combined source', async () => {
    unpdfMocks.extractText.mockResolvedValueOnce({
      text: ['First page native text.', 'Second page native text.', 'Third page native text.'],
      totalPages: 3,
    })
    const file = createMockFile('note.pdf', 'dummy pdf bytes', 'application/pdf')
    const result = await parseUploadedFile(file)

    expect(result.sourceType).toBe('pdf')
    expect(result.pages).toEqual([
      {
        pageNumber: 1,
        text: 'First page native text.',
        extractionMethod: 'native_text',
        extractionConfidence: null,
      },
      {
        pageNumber: 2,
        text: 'Second page native text.',
        extractionMethod: 'native_text',
        extractionConfidence: null,
      },
      {
        pageNumber: 3,
        text: 'Third page native text.',
        extractionMethod: 'native_text',
        extractionConfidence: null,
      },
    ])
    expect(result.text).toBe(result.pages.map((page) => page.text).join('\n\n'))
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
    expect(result.pages).toEqual([
      {
        pageNumber: 1,
        text: 'Parsed DOCX content: Patient with seizure history.',
        extractionMethod: 'native_text',
        extractionConfidence: null,
      },
    ])
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

  it('accepts text over the former single-pass limit without truncation', async () => {
    const longText =
      'A'.repeat(FILE_CONSTRAINTS.MAX_TEXT_LENGTH + 1000) +
      ' sudden aphasia at the omitted tail'
    const file = createMockFile('long.txt', longText, 'text/plain')
    const result = await parseUploadedFile(file)

    expect(result.text).toBe(longText)
    expect(result.pages[0]?.text).toBe(longText)
  })

  it('retains a red flag on the final PDF page after more than 50,000 earlier characters', async () => {
    const finalPage = 'Addendum: sudden aphasia and facial droop now.'
    unpdfMocks.extractText.mockResolvedValueOnce({
      text: ['A'.repeat(FILE_CONSTRAINTS.MAX_TEXT_LENGTH + 1), finalPage],
      totalPages: 2,
    })
    const file = createMockFile('long-referral.pdf', 'dummy pdf bytes', 'application/pdf')
    const result = await parseUploadedFile(file)

    expect(result.pages).toHaveLength(2)
    expect(result.pages[1]).toMatchObject({ pageNumber: 2, text: finalPage })
    expect(result.text.endsWith(finalPage)).toBe(true)
  })

  it('fails closed with affected page numbers when a middle PDF page needs OCR', async () => {
    unpdfMocks.extractText.mockResolvedValueOnce({
      text: ['Native page one.', '   \n\t ', 'Native page three.'],
      totalPages: 3,
    })
    const file = createMockFile('mixed.pdf', 'dummy pdf bytes', 'application/pdf')
    const parseError = await parseUploadedFile(file).catch((error) => error)

    expect(parseError).toMatchObject({
      code: 'OCR_REQUIRED',
      pageNumbers: [2],
      partialResult: {
        text: 'Native page one.\n\nNative page three.',
        sourceType: 'pdf',
        filename: 'mixed.pdf',
        totalPageCount: 3,
        missingPageNumbers: [2],
        pages: [
          expect.objectContaining({ pageNumber: 1, text: 'Native page one.' }),
          expect.objectContaining({ pageNumber: 3, text: 'Native page three.' }),
        ],
      },
    })
    expect(parseError).toBeInstanceOf(FileParseError)
    expect(parseError.message).toMatch(/page 2/i)
  })

  it.each([
    ['one extracted character', 'x'],
    ['a page-number-only artifact', 'Page 2 of 4'],
    [
      'letterhead without referral content',
      'Mayo Clinic\n200 First Street SW\nRochester, MN 55905\nPhone: (507) 555-0100 | Fax: (507) 555-0101',
    ],
    ['a watermark without referral content', 'CONFIDENTIAL COPY'],
    ['an image placeholder without referral content', '[Scanned image 1]'],
  ])('requires OCR when a PDF page contains only %s', async (_, suspiciousText) => {
    unpdfMocks.extractText.mockResolvedValueOnce({
      text: ['Native referral context with a stable neurologic history.', suspiciousText],
      totalPages: 2,
    })
    const file = createMockFile(
      'suspicious-native-page.pdf',
      'dummy pdf bytes',
      'application/pdf',
    )

    await expect(parseUploadedFile(file)).rejects.toMatchObject({
      code: 'OCR_REQUIRED',
      pageNumbers: [2],
      partialResult: {
        text: 'Native referral context with a stable neurologic history.',
        totalPageCount: 2,
        missingPageNumbers: [2],
        pages: [
          expect.objectContaining({
            pageNumber: 1,
            text: 'Native referral context with a stable neurologic history.',
            extractionMethod: 'native_text',
          }),
        ],
      },
    })
  })

  it.each([
    'Assessment: migraine.',
    'No seizures.',
    'Neurology referral requested.',
    'Myasthenia gravis',
  ])('accepts defensible short native PDF content: %s', async (shortText) => {
    unpdfMocks.extractText.mockResolvedValueOnce({
      text: [shortText],
      totalPages: 1,
    })
    const file = createMockFile(
      'short-native-note.pdf',
      'dummy pdf bytes',
      'application/pdf',
    )

    const parsed = await parseUploadedFile(file)

    expect(parsed.text).toBe(shortText)
    expect(parsed.pages).toEqual([
      expect.objectContaining({
        pageNumber: 1,
        text: shortText,
        extractionMethod: 'native_text',
      }),
    ])
  })

  it('retains page-bound emergency evidence when another page has suspicious native text', async () => {
    const emergencyText =
      'The patient developed sudden aphasia and right facial droop 20 minutes ago.'
    unpdfMocks.extractText.mockResolvedValueOnce({
      text: ['MIDTOWN NEUROLOGY\nCONFIDENTIAL\nPage 1 of 2', emergencyText],
      totalPages: 2,
    })
    const file = createMockFile(
      'mixed-suspicious-stroke.pdf',
      'dummy pdf bytes',
      'application/pdf',
    )

    const parseError = await parseUploadedFile(file).catch((error) => error)

    expect(parseError).toMatchObject({
      code: 'OCR_REQUIRED',
      pageNumbers: [1],
      partialResult: {
        text: emergencyText,
        totalPageCount: 2,
        missingPageNumbers: [1],
        pages: [
          expect.objectContaining({
            pageNumber: 2,
            text: emergencyText,
            extractionMethod: 'native_text',
          }),
        ],
      },
    })
  })

  it('retains late native emergency text and original page numbers in a 200-page partial parse', async () => {
    const pages = Array.from(
      { length: 200 },
      (_, index) => `Stable synthetic native text on page ${index + 1}.`,
    )
    pages[100] = '   '
    pages[199] = 'The patient developed sudden aphasia and right facial droop now.'
    unpdfMocks.extractText.mockResolvedValueOnce({ text: pages, totalPages: 200 })
    const file = createMockFile(
      'large-mixed.pdf',
      'dummy pdf bytes',
      'application/pdf',
    )

    const parseError = await parseUploadedFile(file).catch((error) => error)

    expect(parseError).toMatchObject({
      code: 'OCR_REQUIRED',
      pageNumbers: [101],
      partialResult: {
        totalPageCount: 200,
        missingPageNumbers: [101],
        pages: expect.arrayContaining([
          expect.objectContaining({
            pageNumber: 200,
            text: 'The patient developed sudden aphasia and right facial droop now.',
          }),
        ]),
      },
    })
    expect(parseError.partialResult.text).toContain('sudden aphasia')
  })

  it('does not silently omit PDF pages missing from the native extraction array', async () => {
    unpdfMocks.extractText.mockResolvedValueOnce({
      text: ['Native page one.'],
      totalPages: 3,
    })
    const file = createMockFile('missing-pages.pdf', 'dummy pdf bytes', 'application/pdf')

    await expect(parseUploadedFile(file)).rejects.toMatchObject({
      code: 'OCR_REQUIRED',
      pageNumbers: [2, 3],
    })
  })

  it('rejects an oversized reported PDF page count before allocating the page manifest', async () => {
    unpdfMocks.extractText.mockResolvedValueOnce({
      text: ['Native page one.'],
      totalPages: MAX_PDF_PAGE_COUNT + 1,
    })
    const file = createMockFile(
      'oversized-page-count.pdf',
      'dummy pdf bytes',
      'application/pdf',
    )

    await expect(parseUploadedFile(file)).rejects.toMatchObject({
      code: 'TOO_LARGE',
      message: expect.stringContaining('page safety limit'),
    })
  })

  it('rejects decompressed PDF text beyond the packet limit before building normalized pages', async () => {
    unpdfMocks.extractText.mockResolvedValueOnce({
      text: ['x'.repeat(FILE_CONSTRAINTS.MAX_PACKET_TEXT_LENGTH + 1)],
      totalPages: 1,
    })
    const file = createMockFile(
      'oversized-native-text.pdf',
      'dummy pdf bytes',
      'application/pdf',
    )

    await expect(parseUploadedFile(file)).rejects.toMatchObject({
      code: 'TOO_LARGE',
      message: expect.stringContaining('packet safety limit'),
    })
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
