import { describe, expect, it } from 'vitest'

import {
  scanForDiagnosisLeak,
  checkPhaseMarkers,
  checkTurnCap,
  checkStructuredOutputValidity,
  computeCriticalCoverage,
  runDeterministicChecks,
  DIAGNOSIS_LEAK_PATTERNS,
  OPENING_SIGNAL_WORDS,
  CLOSING_SIGNAL_WORDS,
  PATIENT_TURN_CAP,
} from '@/lib/historian/eval/deterministicChecks'
import { PHASED_INTERVIEW_STRUCTURE } from '@/lib/historianPrompts'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

function entry(overrides: Partial<HistorianTranscriptEntry> = {}): HistorianTranscriptEntry {
  return { role: 'assistant', text: 'Hello.', timestamp: 0, seq: 1, ...overrides }
}

// ── The real opening/closing example text, extracted the same way the
//    module under test does (marker → first quoted string), so these tests
//    exercise the check against REAL historianPrompts.ts content rather
//    than a hand-typed approximation that could pass even if the real
//    extraction/matching logic were broken. ────────────────────────────────
function extractQuoted(marker: string): string {
  const idx = PHASED_INTERVIEW_STRUCTURE.indexOf(marker)
  if (idx === -1) throw new Error(`test setup: marker "${marker}" not found in PHASED_INTERVIEW_STRUCTURE`)
  const after = PHASED_INTERVIEW_STRUCTURE.slice(idx + marker.length)
  const start = after.indexOf('"')
  const end = after.indexOf('"', start + 1)
  return after.slice(start + 1, end)
}

const REAL_OPENING_EXAMPLE = extractQuoted('OPENING:')
const REAL_CLOSING_EXAMPLE = extractQuoted('CLOSING (after save_interview_output):')

describe('diagnosis-leak lexicon (DIAGNOSIS_LEAK_PATTERNS)', () => {
  it('is a non-empty exported lexicon', () => {
    expect(DIAGNOSIS_LEAK_PATTERNS.length).toBeGreaterThan(0)
  })

  describe('scanForDiagnosisLeak — hit cases', () => {
    const hitCases: { name: string; text: string }[] = [
      { name: 'bare "you have <diagnosis>"', text: "You have migraine, that's what's causing this." },
      { name: '"sounds like you might have"', text: 'That sounds like you might have a migraine.' },
      { name: '"sounds like you have"', text: 'Sounds like you have epilepsy based on what you described.' },
      { name: '"consistent with"', text: 'Your symptoms are consistent with a stroke.' },
      { name: '"my diagnosis"', text: 'My diagnosis is that this is multiple sclerosis.' },
      { name: 'disease name after "consistent with"', text: 'This is consistent with peripheral neuropathy.' },
    ]

    for (const { name, text } of hitCases) {
      it(`flags: ${name}`, () => {
        const transcript = [entry({ role: 'assistant', text })]
        const result = scanForDiagnosisLeak(transcript)
        expect(result.leaked).toBe(true)
        expect(result.matches).toHaveLength(1)
        expect(result.matches[0].turnIndex).toBe(0)
      })
    }
  })

  describe('scanForDiagnosisLeak — clean cases (must NOT flag)', () => {
    const cleanCases: { name: string; text: string }[] = [
      { name: 'ordinary "do you have" screening question', text: 'Do you have any allergies to medications?' },
      { name: 'ordinary "does the patient have" phrasing', text: 'Does anyone in your family have migraines?' },
      { name: 'ordinary "what symptoms do you have" question', text: 'What other symptoms do you have right now?' },
      { name: 'a plain OLDCARTS follow-up with no assertion language', text: 'On a scale of 0 to 10, how severe is the pain at its worst?' },
      { name: 'the real historian closing example (no diagnostic assertion)', text: REAL_CLOSING_EXAMPLE },
    ]

    for (const { name, text } of cleanCases) {
      it(`does not flag: ${name}`, () => {
        const transcript = [entry({ role: 'assistant', text })]
        const result = scanForDiagnosisLeak(transcript)
        expect(result.leaked).toBe(false)
        expect(result.matches).toHaveLength(0)
      })
    }
  })

  it('scans ONLY assistant turns, never patient (user) turns', () => {
    const transcript = [
      entry({ role: 'user', text: 'The doctor told me I have a stroke last year.', seq: 1 }),
    ]
    const result = scanForDiagnosisLeak(transcript)
    expect(result.leaked).toBe(false)
  })

  it('reports one match per offending turn and the correct turn index', () => {
    const transcript = [
      entry({ role: 'assistant', text: 'How long have your symptoms lasted?' }),
      entry({ role: 'user', text: 'About three days.' }),
      entry({ role: 'assistant', text: 'My diagnosis is migraine.' }),
    ]
    const result = scanForDiagnosisLeak(transcript)
    expect(result.leaked).toBe(true)
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].turnIndex).toBe(2)
  })
})

describe('checkPhaseMarkers (derived from the real PHASED_INTERVIEW_STRUCTURE import)', () => {
  it('derives a non-empty opening and closing signal-word set from the real constant', () => {
    expect(OPENING_SIGNAL_WORDS.length).toBeGreaterThan(0)
    expect(CLOSING_SIGNAL_WORDS.length).toBeGreaterThan(0)
  })

  it('detects the opening marker when the first assistant turn IS the real opening example verbatim', () => {
    const transcript = [entry({ role: 'assistant', text: REAL_OPENING_EXAMPLE })]
    expect(checkPhaseMarkers(transcript).openingPresent).toBe(true)
  })

  it('detects the closing marker when the last assistant turn IS the real closing example verbatim', () => {
    const transcript = [
      entry({ role: 'assistant', text: REAL_OPENING_EXAMPLE }),
      entry({ role: 'user', text: 'Headaches for a week.' }),
      entry({ role: 'assistant', text: REAL_CLOSING_EXAMPLE }),
    ]
    expect(checkPhaseMarkers(transcript).closingPresent).toBe(true)
  })

  it('tolerates a paraphrased opening (live model rarely recites verbatim) as long as it shares real signal words', () => {
    const transcript = [
      entry({
        role: 'assistant',
        text: "Welcome! I'm Henry, and I'll gather some information for your neurologist before your visit today.",
      }),
    ]
    expect(checkPhaseMarkers(transcript).openingPresent).toBe(true)
  })

  it('tolerates a paraphrased closing as long as it shares real signal words', () => {
    const transcript = [
      entry({ role: 'assistant', text: 'Hi, welcome.' }),
      entry({
        role: 'assistant',
        text: "Thank you — I've recorded everything and your neurologist will have the full picture before your visit.",
      }),
    ]
    expect(checkPhaseMarkers(transcript).closingPresent).toBe(true)
  })

  it('flags a missing opening when the first assistant turn shares no real opening signal words', () => {
    const transcript = [entry({ role: 'assistant', text: 'What brings you in?' })]
    expect(checkPhaseMarkers(transcript).openingPresent).toBe(false)
  })

  it('flags a missing closing when the last assistant turn shares no real closing signal words', () => {
    const transcript = [
      entry({ role: 'assistant', text: REAL_OPENING_EXAMPLE }),
      entry({ role: 'assistant', text: 'Okay, bye.' }),
    ]
    expect(checkPhaseMarkers(transcript).closingPresent).toBe(false)
  })

  it('flags both missing when the transcript has no assistant turns at all', () => {
    const result = checkPhaseMarkers([entry({ role: 'user', text: 'hello?' })])
    expect(result.openingPresent).toBe(false)
    expect(result.closingPresent).toBe(false)
  })
})

describe('checkTurnCap', () => {
  it('reports the patient (user-role) turn count, not total entries', () => {
    const transcript = [
      entry({ role: 'assistant' }),
      entry({ role: 'user' }),
      entry({ role: 'assistant' }),
      entry({ role: 'user' }),
    ]
    const result = checkTurnCap(transcript)
    expect(result.patientTurnCount).toBe(2)
    expect(result.limit).toBe(PATIENT_TURN_CAP)
    expect(result.exceeded).toBe(false)
  })

  it('does not flag exactly at the cap', () => {
    const transcript = Array.from({ length: PATIENT_TURN_CAP }, () => entry({ role: 'user' }))
    expect(checkTurnCap(transcript).exceeded).toBe(false)
  })

  it('flags one over the cap', () => {
    const transcript = Array.from({ length: PATIENT_TURN_CAP + 1 }, () => entry({ role: 'user' }))
    expect(checkTurnCap(transcript).exceeded).toBe(true)
  })
})

describe('checkStructuredOutputValidity', () => {
  // narrative_summary is NOT a field on HistorianStructuredOutput — it is
  // persisted as its own separate historian_sessions column (see
  // save/route.ts: structured_output and narrative_summary are distinct
  // request-body fields) — so it is checked via the second parameter.
  it('is invalid when structured_output is null/undefined', () => {
    expect(checkStructuredOutputValidity(null, 'a summary').valid).toBe(false)
    expect(checkStructuredOutputValidity(undefined, 'a summary').valid).toBe(false)
  })

  it('is invalid when a required structured_output field is missing or blank', () => {
    const result = checkStructuredOutputValidity({ chief_complaint: 'headache', hpi: '' }, 'a summary')
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.includes('hpi'))).toBe(true)
  })

  it('is invalid when narrative_summary is missing or blank, even if structured_output is complete', () => {
    const result = checkStructuredOutputValidity(
      { chief_complaint: 'headache', hpi: 'Three days of throbbing headache.' },
      '',
    )
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.includes('narrative_summary'))).toBe(true)
  })

  it('is valid when chief_complaint, hpi, and narrative_summary are all non-empty', () => {
    const result = checkStructuredOutputValidity(
      { chief_complaint: 'headache', hpi: 'Three days of throbbing headache.' },
      'Patient reports headache.',
    )
    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })
})

describe('runDeterministicChecks (aggregator)', () => {
  it('combines all four checks and flattens human-readable issues', () => {
    const transcript = [entry({ role: 'assistant', text: 'My diagnosis is migraine.' })]
    const result = runDeterministicChecks(transcript, null)
    expect(result.diagnosisLeak.leaked).toBe(true)
    expect(result.phaseMarkers.openingPresent).toBe(false)
    expect(result.structuredOutput.valid).toBe(false)
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('produces no issues for a clean, well-formed session', () => {
    const transcript = [
      entry({ role: 'assistant', text: REAL_OPENING_EXAMPLE }),
      entry({ role: 'user', text: 'I have had headaches for a week.' }),
      entry({ role: 'assistant', text: REAL_CLOSING_EXAMPLE }),
    ]
    const structuredOutput = {
      chief_complaint: 'headache',
      hpi: 'One week of headaches.',
    }
    const result = runDeterministicChecks(transcript, structuredOutput, 'Patient reports a week of headaches.')
    expect(result.issues).toHaveLength(0)
  })

  it('defaults criticalCoverage to an empty array when no critical questions are passed', () => {
    const result = runDeterministicChecks([entry()])
    expect(result.criticalCoverage).toEqual([])
  })

  it('threads a 4th criticalQuestions param through to criticalCoverage', () => {
    const transcript = [entry({ role: 'user', text: 'I take warfarin for my heart.' })]
    const result = runDeterministicChecks(transcript, null, null, [
      { id: 'anticoagulant-use', severity: 'critical', coverage_hints: ['warfarin', 'eliquis'] },
    ])
    expect(result.criticalCoverage).toEqual([{ rubric_id: 'anticoagulant-use', hint_matched: true }])
  })
})

describe('computeCriticalCoverage (review fix, Important #1b)', () => {
  it('reports hint_matched: true when a PATIENT (user-role) turn contains a hint — coverage scans ALL turns, not just assistant', () => {
    const transcript = [entry({ role: 'user', text: 'I was on warfarin before this happened.' })]
    const result = computeCriticalCoverage(transcript, [
      { id: 'anticoagulant-use', severity: 'critical', coverage_hints: ['blood thinner', 'warfarin'] },
    ])
    expect(result).toEqual([{ rubric_id: 'anticoagulant-use', hint_matched: true }])
  })

  it('reports hint_matched: true when an ASSISTANT turn contains a hint', () => {
    const transcript = [entry({ role: 'assistant', text: 'Are you taking a blood thinner?' })]
    const result = computeCriticalCoverage(transcript, [
      { id: 'anticoagulant-use', severity: 'critical', coverage_hints: ['blood thinner', 'warfarin'] },
    ])
    expect(result).toEqual([{ rubric_id: 'anticoagulant-use', hint_matched: true }])
  })

  it('reports hint_matched: false when coverage_hints are defined but none appear anywhere in the transcript', () => {
    const transcript = [entry({ role: 'user', text: 'My arm has been weak since yesterday.' })]
    const result = computeCriticalCoverage(transcript, [
      { id: 'anticoagulant-use', severity: 'critical', coverage_hints: ['blood thinner', 'warfarin'] },
    ])
    expect(result).toEqual([{ rubric_id: 'anticoagulant-use', hint_matched: false }])
  })

  it('reports hint_matched: null (unknown, never false) when the item has no coverage_hints defined', () => {
    const transcript = [entry({ role: 'user', text: 'anything' })]
    const result = computeCriticalCoverage(transcript, [{ id: 'no-hints-item', severity: 'critical' }])
    expect(result).toEqual([{ rubric_id: 'no-hints-item', hint_matched: null }])
  })

  it('excludes important/minor severity items from the output entirely', () => {
    const transcript = [entry({ role: 'user', text: 'anything' })]
    const result = computeCriticalCoverage(transcript, [
      { id: 'critical-item', severity: 'critical', coverage_hints: ['x', 'y'] },
      { id: 'important-item', severity: 'important', coverage_hints: ['x', 'y'] },
      { id: 'minor-item', severity: 'minor' },
    ])
    expect(result.map((r) => r.rubric_id)).toEqual(['critical-item'])
  })

  it('matches case-insensitively', () => {
    const transcript = [entry({ role: 'user', text: 'I take WARFARIN daily.' })]
    const result = computeCriticalCoverage(transcript, [
      { id: 'anticoagulant-use', severity: 'critical', coverage_hints: ['warfarin'] },
    ])
    expect(result[0].hint_matched).toBe(true)
  })

  it('returns an empty array for an empty criticalQuestions input', () => {
    expect(computeCriticalCoverage([entry()], [])).toEqual([])
  })
})
