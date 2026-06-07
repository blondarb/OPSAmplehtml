import { describe, it, expect, afterEach } from 'vitest'
import {
  getStaticClinicalTerms,
  buildWhisperBiasPrompt,
  buildDeepgramKeyterms,
  isAsrBiasingEnabled,
} from '@/lib/asr/clinical-lexicon'

describe('getStaticClinicalTerms', () => {
  it('includes formulary drug names (brand + generic) and neurology terms', () => {
    const terms = getStaticClinicalTerms()
    expect(terms).toContain('Keppra') // brand
    expect(terms).toContain('levetiracetam') // generic
    expect(terms).toContain('nystagmus') // neuro term
    expect(terms).toContain('MoCA') // scale
  })

  it('de-dupes case-insensitively (meds appear in multiple categories)', () => {
    const terms = getStaticClinicalTerms()
    const lower = terms.map((t) => t.toLowerCase())
    const unique = new Set(lower)
    expect(unique.size).toBe(lower.length)
  })

  it('orders the universal neuro terms ahead of the background formulary', () => {
    const terms = getStaticClinicalTerms()
    expect(terms.indexOf('nystagmus')).toBeLessThan(terms.indexOf('levetiracetam'))
  })
})

describe('buildWhisperBiasPrompt', () => {
  it('produces a framed, comma-joined prompt', () => {
    const prompt = buildWhisperBiasPrompt()
    expect(prompt).toMatch(/^Neurology visit\./)
    expect(prompt).toContain(',')
    expect(prompt.endsWith('.')).toBe(true)
  })

  it('stays within the ~224 token Whisper prompt budget', () => {
    const prompt = buildWhisperBiasPrompt()
    // ~4 chars/token heuristic; assert comfortably under the hard cap.
    expect(Math.ceil(prompt.length / 4)).toBeLessThanOrEqual(224)
  })

  it('prioritizes session-specific extra terms so they survive truncation', () => {
    const prompt = buildWhisperBiasPrompt(['Zzyzx Quibble', 'Dr. Vexlathorp'])
    expect(prompt).toContain('Zzyzx Quibble')
    expect(prompt).toContain('Dr. Vexlathorp')
  })

  it('does not duplicate an extra term that is already in the static lexicon', () => {
    const prompt = buildWhisperBiasPrompt(['Keppra'])
    const occurrences = prompt.split('Keppra').length - 1
    expect(occurrences).toBe(1)
  })

  it('ignores empty / whitespace extra terms', () => {
    const prompt = buildWhisperBiasPrompt(['', '   '])
    expect(prompt).toMatch(/^Neurology visit\./)
  })
})

describe('buildDeepgramKeyterms', () => {
  it('returns session terms first, then the static lexicon, capped', () => {
    const keyterms = buildDeepgramKeyterms(['Jane Patient'], 10)
    expect(keyterms[0]).toBe('Jane Patient')
    expect(keyterms.length).toBe(10)
  })

  it('de-dupes across extra + static terms', () => {
    const keyterms = buildDeepgramKeyterms(['Keppra'], 50)
    const occurrences = keyterms.filter((t) => t === 'Keppra').length
    expect(occurrences).toBe(1)
  })
})

describe('isAsrBiasingEnabled', () => {
  const original = process.env.ASR_VOCAB_BIASING
  afterEach(() => {
    if (original === undefined) delete process.env.ASR_VOCAB_BIASING
    else process.env.ASR_VOCAB_BIASING = original
  })

  it('defaults to enabled when unset', () => {
    delete process.env.ASR_VOCAB_BIASING
    expect(isAsrBiasingEnabled()).toBe(true)
  })

  it('disables on false/0/off (case-insensitive)', () => {
    for (const v of ['false', '0', 'off', 'OFF', 'False']) {
      process.env.ASR_VOCAB_BIASING = v
      expect(isAsrBiasingEnabled()).toBe(false)
    }
  })

  it('stays enabled for any other value', () => {
    process.env.ASR_VOCAB_BIASING = 'true'
    expect(isAsrBiasingEnabled()).toBe(true)
  })
})
