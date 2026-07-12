import { describe, expect, it } from 'vitest'

import {
  buildExtractionUserPrompt,
  buildFusionUserPrompt,
} from '@/lib/triage/extractionPrompt'

describe('triage extraction demographic prompt context', () => {
  it('renders age 0 in the single-referral extraction prompt', () => {
    const prompt = buildExtractionUserPrompt('Synthetic referral text.', {
      patientAge: 0,
    })

    expect(prompt).toContain('Patient age: 0')
    expect(prompt).not.toContain('Patient age: not provided')
  })

  it('renders age 0 in the fusion prompt', () => {
    const prompt = buildFusionUserPrompt(
      [
        {
          extracted_summary: 'Synthetic extraction.',
          note_type_detected: 'referral',
          key_findings: {},
        },
      ],
      { patientAge: 0 },
    )

    expect(prompt).toContain('Patient age: 0')
    expect(prompt).not.toContain('Patient age: not provided')
  })
})
