import { describe, expect, it } from 'vitest'

import {
  buildPersonaTranscript,
  listPersonaFiles,
} from './fixtures/personaTranscripts'

describe('listPersonaFiles', () => {
  it('finds all 5 simulated-patient persona files', () => {
    const files = listPersonaFiles()
    expect(files).toHaveLength(5)
    expect(files.sort()).toEqual([
      'acute-stroke.json',
      'first-seizure.json',
      'migraine-chronic.json',
      'ms-relapse.json',
      'peripheral-neuropathy.json',
    ])
  })
})

describe('buildPersonaTranscript', () => {
  const personaFiles = listPersonaFiles()

  for (const file of personaFiles) {
    describe(file, () => {
      const { transcript, chiefComplaint, expectedDDx, expectedDDxStrings } = buildPersonaTranscript(file)

      it('produces at least 8 turns', () => {
        expect(transcript.length).toBeGreaterThanOrEqual(8)
      })

      it('alternates assistant/user roles starting with assistant', () => {
        transcript.forEach((entry, i) => {
          expect(entry.role).toBe(i % 2 === 0 ? 'assistant' : 'user')
        })
      })

      it('has a non-empty chief complaint', () => {
        expect(chiefComplaint.trim().length).toBeGreaterThan(0)
      })

      it('has a non-empty expectedDDx list, each with a diagnosis and optional likelihood', () => {
        expect(expectedDDx.length).toBeGreaterThan(0)
        for (const dx of expectedDDx) {
          expect(typeof dx.diagnosis).toBe('string')
          expect(dx.diagnosis.trim().length).toBeGreaterThan(0)
          if (dx.likelihood !== undefined) {
            expect(typeof dx.likelihood).toBe('string')
            expect(dx.likelihood.trim().length).toBeGreaterThan(0)
          }
        }
      })

      it('expectedDDxStrings mirrors expectedDDx diagnosis names, in order', () => {
        expect(expectedDDxStrings).toEqual(expectedDDx.map((d) => d.diagnosis))
      })

      it('preserves likelihood from the source persona file (not silently dropped)', () => {
        // Every persona fixture in this repo annotates likelihood on every
        // entry today — this pins that so a future fixture change that
        // drops it is caught, not silently accepted (this is exactly the
        // field a prior version of this module used to strip).
        for (const dx of expectedDDx) {
          expect(dx.likelihood, `${file}: "${dx.diagnosis}" has no likelihood`).toBeDefined()
        }
      })

      it('assigns monotonically increasing timestamps and seq', () => {
        for (let i = 1; i < transcript.length; i++) {
          expect(transcript[i].timestamp).toBeGreaterThan(transcript[i - 1].timestamp)
          expect(transcript[i].seq).toBe((transcript[i - 1].seq ?? 0) + 1)
        }
      })

      it('gives every entry non-empty text', () => {
        for (const entry of transcript) {
          expect(entry.text.trim().length).toBeGreaterThan(0)
        }
      })
    })
  }

  it('accepts a persona id without the .json suffix', () => {
    const withSuffix = buildPersonaTranscript('acute-stroke.json')
    const withoutSuffix = buildPersonaTranscript('acute-stroke')
    expect(withoutSuffix).toEqual(withSuffix)
  })

  it('throws a clear error for an unknown persona file', () => {
    expect(() => buildPersonaTranscript('not-a-real-persona')).toThrow()
  })
})
