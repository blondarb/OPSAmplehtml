import { describe, expect, it } from 'vitest'

import {
  buildBoundExtractionTriageRequest,
  type BoundExtractionReference,
} from '@/lib/triage/boundExtractionRequest'

describe('buildBoundExtractionTriageRequest', () => {
  it('maps an uppercase PDF extension and returns a trimmed canonical identifier', () => {
    expect(
      buildBoundExtractionTriageRequest({
        extraction_id: '  extraction-pdf-1  ',
        source_filename: 'synthetic-referral.PDF',
      }),
    ).toStrictEqual({
      source_extraction_id: 'extraction-pdf-1',
      source_type: 'pdf',
    })
  })

  it.each([
    ['synthetic-referral.docx', 'docx'],
    ['synthetic-referral.txt', 'txt'],
  ] as const)('maps %s to %s', (sourceFilename, expectedSourceType) => {
    expect(
      buildBoundExtractionTriageRequest({
        extraction_id: 'extraction-1',
        source_filename: sourceFilename,
      }),
    ).toStrictEqual({
      source_extraction_id: 'extraction-1',
      source_type: expectedSourceType,
    })
  })

  it('maps a genuinely absent source filename to paste', () => {
    expect(
      buildBoundExtractionTriageRequest({
        extraction_id: 'extraction-1',
      }),
    ).toStrictEqual({
      source_extraction_id: 'extraction-1',
      source_type: 'paste',
    })
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['number', 42],
    ['string', 'not-a-record'],
    ['array', []],
  ] as const)('rejects a non-record extraction: %s', (_label, extraction) => {
    expect(() =>
      buildBoundExtractionTriageRequest(
        extraction as unknown as BoundExtractionReference,
      ),
    ).toThrowError(/^Source extraction identifier is missing\.$/)
  })

  it.each([
    {} as BoundExtractionReference,
    { extraction_id: '' },
    { extraction_id: '  \t\n  ' },
  ])('rejects a missing or blank extraction identifier', (extraction) => {
    expect(() => buildBoundExtractionTriageRequest(extraction)).toThrow(
      /^Source extraction identifier is missing\.$/,
    )
  })

  it.each([
    ['null', null],
    ['number', 42],
    ['object with trim', { trim: () => 'forged-extraction-id' }],
  ] as const)(
    'rejects a non-string own extraction identifier: %s',
    (_label, extractionId) => {
      expect(() =>
        buildBoundExtractionTriageRequest({
          extraction_id: extractionId,
        } as unknown as BoundExtractionReference),
      ).toThrowError(/^Source extraction identifier is missing\.$/)
    },
  )

  it('rejects an inherited extraction identifier', () => {
    const extraction = Object.create({
      extraction_id: 'inherited-extraction-id',
    }) as BoundExtractionReference

    expect(() => buildBoundExtractionTriageRequest(extraction)).toThrowError(
      /^Source extraction identifier is missing\.$/,
    )
  })

  it.each(['synthetic-referral.csv', 'synthetic-referral'])(
    'rejects an unsupported persisted filename: %s',
    (sourceFilename) => {
      expect(() =>
        buildBoundExtractionTriageRequest({
          extraction_id: 'extraction-1',
          source_filename: sourceFilename,
        }),
      ).toThrow('Unsupported persisted referral source type.')
    },
  )

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['number', 42],
    ['object with trim', { trim: () => 'synthetic-referral.pdf' }],
    ['empty string', ''],
    ['blank string', '  \t\n  '],
  ] as const)(
    'rejects a malformed own source filename: %s',
    (_label, sourceFilename) => {
      expect(() =>
        buildBoundExtractionTriageRequest({
          extraction_id: 'extraction-1',
          source_filename: sourceFilename,
        } as unknown as BoundExtractionReference),
      ).toThrowError(/^Unsupported persisted referral source type\.$/)
    },
  )

  it('ignores an inherited source filename and maps it as absent', () => {
    const extraction = Object.assign(
      Object.create({ source_filename: 'inherited-referral.pdf' }),
      { extraction_id: 'extraction-1' },
    ) as BoundExtractionReference

    expect(buildBoundExtractionTriageRequest(extraction)).toStrictEqual({
      source_extraction_id: 'extraction-1',
      source_type: 'paste',
    })
  })

  it('returns exactly the two allowed request keys', () => {
    const request = buildBoundExtractionTriageRequest({
      extraction_id: 'extraction-1',
      source_filename: 'synthetic-referral.docx',
    })

    expect(request).toStrictEqual({
      source_extraction_id: 'extraction-1',
      source_type: 'docx',
    })
    expect(Object.keys(request).sort()).toStrictEqual([
      'source_extraction_id',
      'source_type',
    ])
  })

  it('does not leak caller-supplied clinical content, metadata, or arbitrary fields', () => {
    const adversarialExtraction = {
      extraction_id: 'extraction-1',
      source_filename: 'synthetic-referral.txt',
      extracted_summary: 'synthetic summary must not cross the boundary',
      referral_text: 'synthetic referral must not cross the boundary',
      patient_age: 47,
      patient_sex: 'synthetic',
      extraction_confidence: 'high',
      note_type_detected: 'referral',
      batch_id: 'batch-1',
      fusion_group_id: 'fusion-1',
      arbitrary_caller_field: 'must not leak',
    }

    const request = buildBoundExtractionTriageRequest(adversarialExtraction)

    expect(request).toStrictEqual({
      source_extraction_id: 'extraction-1',
      source_type: 'txt',
    })

    for (const forbiddenKey of [
      'source_filename',
      'extracted_summary',
      'referral_text',
      'patient_age',
      'patient_sex',
      'extraction_confidence',
      'note_type_detected',
      'batch_id',
      'fusion_group_id',
      'arbitrary_caller_field',
    ]) {
      expect(request).not.toHaveProperty(forbiddenKey)
    }
  })
})
