import { describe, expect, it } from 'vitest'

import {
  loadRubric,
  detectSyndrome,
  validateRubric,
  listAllRubricFiles,
  assertUniqueRubricVersions,
  KNOWN_SYNDROMES,
  type RubricFile,
} from '@/lib/historian/eval/rubric'
import { buildPersonaTranscript, listPersonaFiles } from './fixtures/personaTranscripts'

function validRubric(overrides: Partial<RubricFile> = {}): unknown {
  return {
    _note: '[training knowledge — Steve to vet]',
    version: 'test-v1',
    syndrome: null,
    vetted_by: null,
    vetted_date: null,
    critical_questions: [
      { id: 'onset', question: 'When did it start?', severity: 'critical' },
    ],
    expected_dimensions: ['oldcarts'],
    ...overrides,
  }
}

describe('validateRubric', () => {
  it('accepts a well-formed rubric', () => {
    const result = validateRubric(validRubric(), 'test')
    expect(result.version).toBe('test-v1')
    expect(result.critical_questions).toHaveLength(1)
  })

  it('rejects a non-object', () => {
    expect(() => validateRubric('nope', 'test')).toThrow(/must be an object/)
  })

  it('rejects a missing/wrong _note disclaimer', () => {
    expect(() => validateRubric(validRubric({ _note: 'oops' } as never), 'test')).toThrow(/_note/)
  })

  it('rejects a version string not matching <slug>-vN', () => {
    expect(() => validateRubric(validRubric({ version: 'v1' } as never), 'test')).toThrow(/version/)
  })

  it('rejects an unknown syndrome value', () => {
    expect(() => validateRubric(validRubric({ syndrome: 'not-a-real-syndrome' } as never), 'test')).toThrow(
      /syndrome/,
    )
  })

  it('accepts every declared KNOWN_SYNDROMES value', () => {
    for (const syndrome of KNOWN_SYNDROMES) {
      expect(() => validateRubric(validRubric({ syndrome } as never), 'test')).not.toThrow()
    }
  })

  it('rejects vetted_date not in YYYY-MM-DD form', () => {
    expect(() => validateRubric(validRubric({ vetted_date: '07/20/2026' } as never), 'test')).toThrow(
      /vetted_date/,
    )
  })

  it('accepts a real ISO vetted_date alongside a vetted_by', () => {
    const result = validateRubric(
      validRubric({ vetted_by: 'Steve Arbogast, DO', vetted_date: '2026-08-01' } as never),
      'test',
    )
    expect(result.vetted_by).toBe('Steve Arbogast, DO')
  })

  it('rejects an empty critical_questions array', () => {
    expect(() => validateRubric(validRubric({ critical_questions: [] }), 'test')).toThrow(
      /critical_questions/,
    )
  })

  it('rejects a critical_questions entry with an invalid severity', () => {
    expect(() =>
      validateRubric(
        validRubric({
          critical_questions: [{ id: 'x', question: 'q', severity: 'urgent' }] as never,
        }),
        'test',
      ),
    ).toThrow(/severity/)
  })

  it('rejects duplicate critical_questions ids within one file', () => {
    expect(() =>
      validateRubric(
        validRubric({
          critical_questions: [
            { id: 'onset', question: 'q1', severity: 'critical' },
            { id: 'onset', question: 'q2', severity: 'important' },
          ],
        }),
        'test',
      ),
    ).toThrow(/duplicate/)
  })

  it('rejects an unknown expected_dimensions value', () => {
    expect(() =>
      validateRubric(validRubric({ expected_dimensions: ['not_a_dimension'] } as never), 'test'),
    ).toThrow(/expected_dimensions/)
  })

  it('rejects an empty expected_dimensions array', () => {
    expect(() => validateRubric(validRubric({ expected_dimensions: [] }), 'test')).toThrow(
      /expected_dimensions/,
    )
  })

  // ── additionalProperties: false (review fix, minor b) ──────────────────
  it('rejects an unrecognized top-level property', () => {
    expect(() =>
      validateRubric({ ...(validRubric() as Record<string, unknown>), extra_field: 'nope' }, 'test'),
    ).toThrow(/unrecognized property/)
  })

  it('rejects an unrecognized critical_questions item property', () => {
    expect(() =>
      validateRubric(
        validRubric({
          critical_questions: [
            { id: 'onset', question: 'q1', severity: 'critical', made_up_field: 'nope' },
          ] as never,
        }),
        'test',
      ),
    ).toThrow(/unrecognized property/)
  })

  // ── coverage_hints (review fix, Important #1a) ──────────────────────────
  describe('coverage_hints', () => {
    it('is optional — a critical_questions entry with no coverage_hints still validates', () => {
      const result = validateRubric(validRubric(), 'test')
      expect(result.critical_questions[0].coverage_hints).toBeUndefined()
    })

    it('accepts a 2-5 item array of non-empty strings', () => {
      const result = validateRubric(
        validRubric({
          critical_questions: [
            { id: 'onset', question: 'q1', severity: 'critical', coverage_hints: ['last known well', 'when did this start'] },
          ],
        }),
        'test',
      )
      expect(result.critical_questions[0].coverage_hints).toEqual(['last known well', 'when did this start'])
    })

    it('rejects a 1-item array (below the 2-5 bound)', () => {
      expect(() =>
        validateRubric(
          validRubric({
            critical_questions: [{ id: 'onset', question: 'q1', severity: 'critical', coverage_hints: ['only one'] }],
          }),
          'test',
        ),
      ).toThrow(/coverage_hints/)
    })

    it('rejects a 6-item array (above the 2-5 bound)', () => {
      expect(() =>
        validateRubric(
          validRubric({
            critical_questions: [
              {
                id: 'onset',
                question: 'q1',
                severity: 'critical',
                coverage_hints: ['a', 'b', 'c', 'd', 'e', 'f'],
              },
            ],
          }),
          'test',
        ),
      ).toThrow(/coverage_hints/)
    })

    it('rejects a non-string entry', () => {
      expect(() =>
        validateRubric(
          validRubric({
            critical_questions: [
              { id: 'onset', question: 'q1', severity: 'critical', coverage_hints: ['ok', 123] },
            ] as never,
          }),
          'test',
        ),
      ).toThrow(/coverage_hints/)
    })

    it('rejects an empty-string entry', () => {
      expect(() =>
        validateRubric(
          validRubric({
            critical_questions: [
              { id: 'onset', question: 'q1', severity: 'critical', coverage_hints: ['ok', ''] },
            ],
          }),
          'test',
        ),
      ).toThrow(/coverage_hints/)
    })
  })
})

describe('assertUniqueRubricVersions', () => {
  it('does not throw when every version is unique', () => {
    expect(() =>
      assertUniqueRubricVersions([
        { label: 'a.json', version: 'a-v1' },
        { label: 'b.json', version: 'b-v1' },
      ]),
    ).not.toThrow()
  })

  it('throws, naming both files, when two entries share a version', () => {
    expect(() =>
      assertUniqueRubricVersions([
        { label: 'a.json', version: 'shared-v1' },
        { label: 'b.json', version: 'shared-v1' },
      ]),
    ).toThrow(/a\.json/)
  })
})

describe('the real rubric files on disk', () => {
  const all = listAllRubricFiles()

  it('lists the base rubric plus one entry per KNOWN_SYNDROMES', () => {
    expect(all.length).toBe(1 + KNOWN_SYNDROMES.length)
  })

  it('every real rubric file validates cleanly (already validated at module load — this just re-asserts shape)', () => {
    for (const { label, rubric } of all) {
      expect(rubric.critical_questions.length, `${label} should have at least one critical_questions entry`).toBeGreaterThan(0)
      expect(rubric.expected_dimensions.length, `${label} should have at least one expected_dimensions entry`).toBeGreaterThan(0)
    }
  })

  it('every syndrome file has coverage_hints (2-5 entries) on every severity:"critical" item, and never on important/minor items', () => {
    const syndromeFiles = all.filter((f) => f.label !== 'base-neuro-hpi.json')
    expect(syndromeFiles.length).toBeGreaterThan(0)
    for (const { label, rubric } of syndromeFiles) {
      for (const q of rubric.critical_questions) {
        if (q.severity === 'critical') {
          expect(q.coverage_hints, `${label} critical item "${q.id}" should declare coverage_hints`).toBeDefined()
          expect(q.coverage_hints!.length, `${label} "${q.id}".coverage_hints length`).toBeGreaterThanOrEqual(2)
          expect(q.coverage_hints!.length, `${label} "${q.id}".coverage_hints length`).toBeLessThanOrEqual(5)
        } else {
          expect(q.coverage_hints, `${label} non-critical item "${q.id}" should NOT declare coverage_hints`).toBeUndefined()
        }
      }
    }
  })

  it('the base rubric never declares coverage_hints (scope: syndrome files only)', () => {
    const base = all.find((f) => f.label === 'base-neuro-hpi.json')!
    for (const q of base.rubric.critical_questions) {
      expect(q.coverage_hints).toBeUndefined()
    }
  })

  it('every real rubric file is marked vetted_by: null (developer baseline, not yet clinician-vetted)', () => {
    for (const { label, rubric } of all) {
      expect(rubric.vetted_by, `${label}.vetted_by`).toBeNull()
      expect(rubric.vetted_date, `${label}.vetted_date`).toBeNull()
    }
  })

  it('every real rubric file has a unique version string', () => {
    const versions = all.map((f) => f.rubric.version)
    expect(new Set(versions).size).toBe(versions.length)
  })

  it('the base rubric has syndrome: null', () => {
    const base = all.find((f) => f.label === 'base-neuro-hpi.json')
    expect(base?.rubric.syndrome).toBeNull()
  })

  it('each syndrome rubric file declares the matching syndrome id', () => {
    for (const syndromeId of KNOWN_SYNDROMES) {
      const entry = all.find((f) => f.rubric.syndrome === syndromeId)
      expect(entry, `no rubric file declares syndrome "${syndromeId}"`).toBeTruthy()
    }
  })
})

describe('detectSyndrome', () => {
  it('returns null for an empty/undefined chief complaint', () => {
    expect(detectSyndrome('')).toBeNull()
    expect(detectSyndrome(undefined)).toBeNull()
  })

  it('returns null for a chief complaint with no syndrome-keyword hits', () => {
    expect(detectSyndrome('Patient here for a routine annual checkup.')).toBeNull()
  })

  // Realness requirement: match against the ACTUAL persona chief-complaint
  // strings from fixtures/personaTranscripts.ts (which read the real
  // tests/simulated-patients/personas/*.json files), not hand-typed
  // approximations that could pass even if the real matcher is broken.
  const EXPECTED_SYNDROME_BY_PERSONA_FILE: Record<string, string> = {
    'acute-stroke.json': 'acute-stroke',
    'first-seizure.json': 'first-seizure',
    'migraine-chronic.json': 'migraine-chronic',
    'ms-relapse.json': 'ms-relapse',
    'peripheral-neuropathy.json': 'peripheral-neuropathy',
  }

  for (const file of listPersonaFiles()) {
    it(`detects "${EXPECTED_SYNDROME_BY_PERSONA_FILE[file]}" from the real ${file} chief complaint`, () => {
      const { chiefComplaint } = buildPersonaTranscript(file)
      expect(chiefComplaint.length, `${file} fixture has no chief complaint`).toBeGreaterThan(0)
      expect(detectSyndrome(chiefComplaint)).toBe(EXPECTED_SYNDROME_BY_PERSONA_FILE[file])
    })
  }
})

describe('loadRubric', () => {
  it('with no syndrome and no chief complaint, returns base-only', () => {
    const loaded = loadRubric()
    expect(loaded.syndromeId).toBeNull()
    expect(loaded.syndrome).toBeNull()
    expect(loaded.rubricVersion).toBe(loaded.base.version)
  })

  it('falls back to base-only for an unrecognized explicit syndrome id', () => {
    const loaded = loadRubric({ syndrome: 'not-a-real-syndrome' })
    expect(loaded.syndromeId).toBeNull()
    expect(loaded.syndrome).toBeNull()
  })

  it('an explicit known syndrome id loads that syndrome rubric', () => {
    const loaded = loadRubric({ syndrome: 'acute-stroke' })
    expect(loaded.syndromeId).toBe('acute-stroke')
    expect(loaded.syndrome?.syndrome).toBe('acute-stroke')
    expect(loaded.rubricVersion).toBe(`${loaded.base.version}+${loaded.syndrome!.version}`)
  })

  it('an explicit syndrome id takes priority over chiefComplaint-based detection', () => {
    const loaded = loadRubric({
      syndrome: 'acute-stroke',
      chiefComplaint: 'chronic daily migraine headaches',
    })
    expect(loaded.syndromeId).toBe('acute-stroke')
  })

  it('falls back to chiefComplaint-based detection when no explicit syndrome given', () => {
    const { chiefComplaint } = buildPersonaTranscript('peripheral-neuropathy.json')
    const loaded = loadRubric({ chiefComplaint })
    expect(loaded.syndromeId).toBe('peripheral-neuropathy')
  })

  it('combines base + syndrome critical_questions, tagging each with its source', () => {
    const loaded = loadRubric({ syndrome: 'first-seizure' })
    const sources = new Set(loaded.criticalQuestions.map((q) => q.source))
    expect(sources.has('base')).toBe(true)
    expect(sources.has('syndrome')).toBe(true)
    expect(loaded.criticalQuestions.length).toBe(
      loaded.base.critical_questions.length + loaded.syndrome!.critical_questions.length,
    )
  })

  it('base-only load has no "syndrome"-sourced critical questions', () => {
    const loaded = loadRubric()
    expect(loaded.criticalQuestions.every((q) => q.source === 'base')).toBe(true)
  })

  it('unvetted is true whenever any contributing rubric has vetted_by null (current state of every real file)', () => {
    const loaded = loadRubric({ syndrome: 'migraine-chronic' })
    expect(loaded.unvetted).toBe(true)
  })
})
