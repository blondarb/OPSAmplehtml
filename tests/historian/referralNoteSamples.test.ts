import { describe, expect, it } from 'vitest'

import { REFERRAL_NOTE_SAMPLES } from '@/lib/historian/referralNoteSamples'

describe('referral note samples', () => {
  it('ships at least two samples', () => {
    expect(REFERRAL_NOTE_SAMPLES.length).toBeGreaterThanOrEqual(2)
  })

  it('every sample is explicitly synthetic', () => {
    for (const sample of REFERRAL_NOTE_SAMPLES) {
      expect(sample.text.toUpperCase()).toContain('SYNTHETIC')
      expect(sample.id).toBeTruthy()
      expect(sample.label).toBeTruthy()
    }
  })

  it('contains no digit sequence that could read as an MRN or SSN', () => {
    for (const sample of REFERRAL_NOTE_SAMPLES) {
      expect(sample.text).not.toMatch(/\b\d{6,}\b/)
      expect(sample.text).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/)
    }
  })

  it('uses no personal names — ages are written out, not attached to a person', () => {
    for (const sample of REFERRAL_NOTE_SAMPLES) {
      expect(sample.text).not.toMatch(/\b(Mr|Mrs|Ms|Dr)\.\s+[A-Z][a-z]+/)
    }
  })

  it('has ids unique enough to key a list', () => {
    const ids = REFERRAL_NOTE_SAMPLES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
