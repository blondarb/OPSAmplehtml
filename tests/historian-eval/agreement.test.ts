import { describe, expect, it, vi } from 'vitest'

import { normalizeIcd10, computeAgreement, scoreAgainstGroundTruth } from '@/lib/historian/eval/agreement'
import type { DifferentialItem } from '@/lib/historian/eval/finalDifferential'

function item(overrides: Partial<DifferentialItem> = {}): DifferentialItem {
  return {
    diagnosis: 'Some diagnosis',
    icd10: null,
    likelihood: 'Moderate',
    likelihood_pct: 50,
    rationale: 'r',
    supporting_quotes: [],
    contradicting_quotes: [],
    ...overrides,
  }
}

// ── normalizeIcd10 ────────────────────────────────────────────────────────

describe('normalizeIcd10', () => {
  it('reduces a full code with a decimal subdivision to its 3-character category', () => {
    expect(normalizeIcd10('G43.909')).toBe('G43')
  })

  it('reduces a different subdivision of the same category to the same category', () => {
    expect(normalizeIcd10('G43.1')).toBe('G43')
  })

  it('leaves an already-bare category code unchanged (aside from casing)', () => {
    expect(normalizeIcd10('I63')).toBe('I63')
  })

  it('uppercases a lowercase code', () => {
    expect(normalizeIcd10('g43.909')).toBe('G43')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeIcd10('  G43.909  ')).toBe('G43')
  })

  it('returns null for null input, never throws', () => {
    expect(normalizeIcd10(null)).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(normalizeIcd10('')).toBeNull()
  })

  it('returns null for a whitespace-only string', () => {
    expect(normalizeIcd10('   ')).toBeNull()
  })

  it('returns null for a malformed / non-ICD10-shaped string, never throws', () => {
    expect(normalizeIcd10('not-a-code')).toBeNull()
    expect(normalizeIcd10('12345')).toBeNull()
    expect(normalizeIcd10('G')).toBeNull()
    expect(normalizeIcd10('GG43')).toBeNull()
  })
})

// ── computeAgreement ─────────────────────────────────────────────────────

describe('computeAgreement', () => {
  it('matches an exact ICD10 code pair via icd10 (exact-code match implies category match)', async () => {
    const a = [item({ diagnosis: 'Migraine without aura', icd10: 'G43.909' })]
    const b = [item({ diagnosis: 'Migraine, unspecified', icd10: 'G43.909' })]

    const result = await computeAgreement(a, b)

    expect(result.top1Match).toBe(true)
    expect(result.matchedPairs).toEqual([
      { a: 'Migraine without aura', b: 'Migraine, unspecified', via: 'icd10' },
    ])
  })

  it('matches two different subdivisions of the same ICD10 category via icd10', async () => {
    const a = [item({ diagnosis: 'Migraine with aura', icd10: 'G43.1' })]
    const b = [item({ diagnosis: 'Chronic migraine', icd10: 'G43.909' })]

    const result = await computeAgreement(a, b)

    expect(result.top1Match).toBe(true)
    expect(result.matchedPairs).toHaveLength(1)
    expect(result.matchedPairs[0].via).toBe('icd10')
  })

  it('does NOT match two different valid ICD10 categories, and never calls the adjudicator for that pair', async () => {
    const adjudicate = vi.fn(async (pairs: [string, string][]) => pairs.map(() => true))
    const a = [item({ diagnosis: 'Migraine without aura', icd10: 'G43.909' })]
    const b = [item({ diagnosis: 'Acute ischemic stroke', icd10: 'I63.9' })]

    const result = await computeAgreement(a, b, adjudicate)

    expect(result.top1Match).toBe(false)
    expect(result.matchedPairs).toEqual([])
    expect(adjudicate).not.toHaveBeenCalled()
  })

  it('routes a no-ICD synonym pair to the injected adjudicator and marks it matched via adjudicated', async () => {
    const adjudicate = vi.fn(async (pairs: [string, string][]) => pairs.map(() => true))
    const a = [item({ diagnosis: 'TIA', icd10: null })]
    const b = [item({ diagnosis: 'Transient ischemic attack', icd10: null })]

    const result = await computeAgreement(a, b, adjudicate)

    expect(adjudicate).toHaveBeenCalledTimes(1)
    expect(adjudicate).toHaveBeenCalledWith([['TIA', 'Transient ischemic attack']])
    expect(result.top1Match).toBe(true)
    expect(result.matchedPairs).toEqual([
      { a: 'TIA', b: 'Transient ischemic attack', via: 'adjudicated' },
    ])
  })

  it('routes a pair to the adjudicator when only one side lacks a valid ICD10 code', async () => {
    const adjudicate = vi.fn(async (pairs: [string, string][]) => pairs.map(() => true))
    const a = [item({ diagnosis: 'Migraine without aura', icd10: 'G43.909' })]
    const b = [item({ diagnosis: 'Common migraine', icd10: null })]

    const result = await computeAgreement(a, b, adjudicate)

    expect(adjudicate).toHaveBeenCalledTimes(1)
    expect(result.matchedPairs[0]).toMatchObject({ via: 'adjudicated' })
  })

  it('treats a malformed ICD10 code the same as a missing one (routes to adjudication)', async () => {
    const adjudicate = vi.fn(async (pairs: [string, string][]) => pairs.map(() => true))
    const a = [item({ diagnosis: 'Migraine without aura', icd10: 'not-a-code' })]
    const b = [item({ diagnosis: 'Common migraine', icd10: null })]

    const result = await computeAgreement(a, b, adjudicate)

    expect(adjudicate).toHaveBeenCalledTimes(1)
    expect(result.matchedPairs[0]).toMatchObject({ via: 'adjudicated' })
  })

  it('treats a pair the adjudicator rejects as a non-match, surfaced in disagreements', async () => {
    const adjudicate = vi.fn(async (pairs: [string, string][]) => pairs.map(() => false))
    const a = [item({ diagnosis: 'TIA', icd10: null })]
    const b = [item({ diagnosis: 'Bell palsy', icd10: null })]

    const result = await computeAgreement(a, b, adjudicate)

    expect(result.top1Match).toBe(false)
    expect(result.matchedPairs).toEqual([])
    expect(result.disagreements.join(' ')).toContain('TIA')
    expect(result.disagreements.join(' ')).toContain('Bell palsy')
  })

  it('treats an adjudication-eligible pair as a non-match when no adjudicator is injected, and never throws', async () => {
    const a = [item({ diagnosis: 'TIA', icd10: null })]
    const b = [item({ diagnosis: 'Transient ischemic attack', icd10: null })]

    const result = await computeAgreement(a, b)

    expect(result.top1Match).toBe(false)
    expect(result.matchedPairs).toEqual([])
  })

  it('batches every pair needing adjudication into exactly one adjudicator call', async () => {
    const adjudicate = vi.fn(async (pairs: [string, string][]) => pairs.map(() => false))
    const a = [
      item({ diagnosis: 'A1', icd10: null }),
      item({ diagnosis: 'A2', icd10: null }),
      item({ diagnosis: 'A3', icd10: null }),
    ]
    const b = [
      item({ diagnosis: 'B1', icd10: null }),
      item({ diagnosis: 'B2', icd10: null }),
      item({ diagnosis: 'B3', icd10: null }),
    ]

    await computeAgreement(a, b, adjudicate)

    expect(adjudicate).toHaveBeenCalledTimes(1)
    const pairsArg = adjudicate.mock.calls[0][0] as [string, string][]
    expect(pairsArg.length).toBe(9) // full 3x3 top-3 grid, all eligible (no ICD on either side)
  })

  it('only considers the top-3 of each side (a 4th-ranked item is ignored)', async () => {
    const adjudicate = vi.fn(async (pairs: [string, string][]) => pairs.map(() => true))
    const a = [
      item({ diagnosis: 'A1', icd10: null }),
      item({ diagnosis: 'A2', icd10: null }),
      item({ diagnosis: 'A3', icd10: null }),
      item({ diagnosis: 'A4-ignored', icd10: null }),
    ]
    const b = [item({ diagnosis: 'B1', icd10: null })]

    await computeAgreement(a, b, adjudicate)

    const pairsArg = adjudicate.mock.calls[0][0] as [string, string][]
    expect(pairsArg.flat()).not.toContain('A4-ignored')
  })

  // ── top1Match is strictly rank-1-vs-rank-1, independent of overlap elsewhere ──

  it('top1Match is false when the #1 items do not match each other, even if #1 matches something else in the other top-3', async () => {
    // a[0] ("Stroke") matches b[1] ("Acute stroke") via ICD, but b[0] ("Migraine")
    // does not match anything in a's top-3. top1Match must reflect a[0] vs b[0]
    // specifically, not "a[0] matched something in b's top-3".
    const a = [item({ diagnosis: 'Stroke', icd10: 'I63.9' })]
    const b = [
      item({ diagnosis: 'Migraine', icd10: 'G43.909' }),
      item({ diagnosis: 'Acute stroke', icd10: 'I63.9' }),
    ]

    const result = await computeAgreement(a, b)

    expect(result.top1Match).toBe(false)
    // The overlap is still recorded even though it isn't rank-1-vs-rank-1.
    expect(result.matchedPairs).toEqual([{ a: 'Stroke', b: 'Acute stroke', via: 'icd10' }])
  })

  it('top1Match is true only when both #1 items match each other', async () => {
    const a = [item({ diagnosis: 'Stroke', icd10: 'I63.9' })]
    const b = [item({ diagnosis: 'Acute stroke', icd10: 'I63.9' })]

    const result = await computeAgreement(a, b)
    expect(result.top1Match).toBe(true)
  })

  // ── Optimal (not greedy) matching — review fix, 2026-07-21 ─────────────

  it('finds the true maximum matching when one candidate matches two options but another matches only one of them (greedy under-counts this)', async () => {
    // truth: X matches BOTH P and Q; Y matches ONLY P (Y-Q is false).
    // A greedy row-major assignment processes X first, takes the first
    // available column (P), and consumes it — leaving Y with no available
    // column even though Y's only possible match was P. That under-counts
    // at 1. The true maximum matching is 2 (X-Q, Y-P).
    const adjudicate = vi.fn(async (pairs: [string, string][]) =>
      pairs.map(([a, b]) => !(a === 'Y' && b === 'Q')),
    )
    const a = [item({ diagnosis: 'X', icd10: null }), item({ diagnosis: 'Y', icd10: null })]
    const b = [item({ diagnosis: 'P', icd10: null }), item({ diagnosis: 'Q', icd10: null })]

    const result = await computeAgreement(a, b, adjudicate)

    expect(result.top3Overlap).toBe(2)
    expect(result.matchedPairs).toHaveLength(2)
    expect(result.disagreements).toEqual([])

    // A valid matching: every A/B item used exactly once.
    const usedA = new Set(result.matchedPairs.map((p) => p.a))
    const usedB = new Set(result.matchedPairs.map((p) => p.b))
    expect(usedA).toEqual(new Set(['X', 'Y']))
    expect(usedB).toEqual(new Set(['P', 'Q']))

    // Y can only be matched with P (Y-Q is false) — its pair must be P,
    // which forces X's pair to be Q.
    const yPair = result.matchedPairs.find((p) => p.a === 'Y')
    expect(yPair?.b).toBe('P')
  })

  // ── Jaccard / overlap math ────────────────────────────────────────────

  it('computes jaccardTop3 and top3Overlap for a partial-overlap 3-vs-3 case', async () => {
    // a: [X, Y, Z], b: [X, Y, W] -> 2 matches (X,Y), union = 3+3-2 = 4 -> jaccard 0.5
    const a = [
      item({ diagnosis: 'X', icd10: 'G43.909' }),
      item({ diagnosis: 'Y', icd10: 'I63.9' }),
      item({ diagnosis: 'Z', icd10: 'R51.9' }),
    ]
    const b = [
      item({ diagnosis: 'Xb', icd10: 'G43.909' }),
      item({ diagnosis: 'Yb', icd10: 'I63.9' }),
      item({ diagnosis: 'W', icd10: 'F41.9' }),
    ]

    const result = await computeAgreement(a, b)

    expect(result.top3Overlap).toBe(2)
    expect(result.jaccardTop3).toBeCloseTo(0.5, 5)
  })

  it('computes jaccardTop3 as 1 for identical top-3 sets (by ICD10 category)', async () => {
    const a = [
      item({ diagnosis: 'X', icd10: 'G43.909' }),
      item({ diagnosis: 'Y', icd10: 'I63.9' }),
      item({ diagnosis: 'Z', icd10: 'R51.9' }),
    ]
    const b = [
      item({ diagnosis: 'Xb', icd10: 'G43.1' }),
      item({ diagnosis: 'Yb', icd10: 'I63.0' }),
      item({ diagnosis: 'Zb', icd10: 'R51.0' }),
    ]

    const result = await computeAgreement(a, b)

    expect(result.top3Overlap).toBe(3)
    expect(result.jaccardTop3).toBeCloseTo(1, 5)
  })

  it('computes jaccardTop3 as 0 for a fully disjoint pair of top-3 sets', async () => {
    const a = [item({ diagnosis: 'X', icd10: 'G43.909' })]
    const b = [item({ diagnosis: 'Y', icd10: 'I63.9' })]

    const result = await computeAgreement(a, b)

    expect(result.top3Overlap).toBe(0)
    expect(result.jaccardTop3).toBe(0)
  })

  // ── Empty lists ───────────────────────────────────────────────────────

  it('handles both lists empty without throwing or dividing by zero', async () => {
    const result = await computeAgreement([], [])

    expect(result.top1Match).toBe(false)
    expect(result.top3Overlap).toBe(0)
    expect(result.jaccardTop3).toBe(0)
    expect(result.matchedPairs).toEqual([])
    expect(result.disagreements).toEqual([])
  })

  it('handles one empty and one non-empty list — every item on the non-empty side is a disagreement', async () => {
    const a = [item({ diagnosis: 'X', icd10: 'G43.909' }), item({ diagnosis: 'Y', icd10: 'I63.9' })]

    const result = await computeAgreement(a, [])

    expect(result.top1Match).toBe(false)
    expect(result.top3Overlap).toBe(0)
    expect(result.jaccardTop3).toBe(0)
    expect(result.matchedPairs).toEqual([])
    expect(result.disagreements).toHaveLength(2)
    expect(result.disagreements.join(' ')).toContain('X')
    expect(result.disagreements.join(' ')).toContain('Y')
  })

  it('never logs diagnosis/quote text to the console', async () => {
    const secret = 'SENTINEL_DIAGNOSIS_TEXT_NEVER_LOGGED'
    const adjudicate = vi.fn(async (pairs: [string, string][]) => pairs.map(() => false))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await computeAgreement([item({ diagnosis: secret, icd10: null })], [item({ diagnosis: 'other', icd10: null })], adjudicate)

    const allLogs = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
      .join(' ')
    expect(allLogs).not.toContain(secret)

    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })
})

// ── scoreAgainstGroundTruth ──────────────────────────────────────────────

describe('scoreAgainstGroundTruth', () => {
  it('hits top1 and top3 on an exact case-insensitive string match at rank 0, without calling the adjudicator', async () => {
    const adjudicate = vi.fn(async (pairs: [string, string][]) => pairs.map(() => true))
    const ddx = [item({ diagnosis: 'migraine without aura' })]

    const result = await scoreAgainstGroundTruth(ddx, ['Migraine without aura'], adjudicate)

    expect(result).toEqual({ top1Hit: true, top3Hit: true })
    expect(adjudicate).not.toHaveBeenCalled()
  })

  it('hits via the adjudicator on a synonym pair the exact-string check misses', async () => {
    const adjudicate = vi.fn(async (pairs: [string, string][]) => pairs.map(() => true))
    const ddx = [item({ diagnosis: 'Transient ischemic attack' })]

    const result = await scoreAgainstGroundTruth(ddx, ['TIA'], adjudicate)

    expect(adjudicate).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ top1Hit: true, top3Hit: true })
  })

  it('is top3Hit true but top1Hit false when the match is ranked #2 or #3', async () => {
    const adjudicate = vi.fn(async () => [false, true, false])
    const ddx = [
      item({ diagnosis: 'Tension headache' }),
      item({ diagnosis: 'Migraine without aura' }),
      item({ diagnosis: 'Cluster headache' }),
    ]

    const result = await scoreAgainstGroundTruth(ddx, ['Migraine'], adjudicate)

    expect(result.top1Hit).toBe(false)
    expect(result.top3Hit).toBe(true)
  })

  it('is both false when nothing matches', async () => {
    const adjudicate = vi.fn(async (pairs: [string, string][]) => pairs.map(() => false))
    const ddx = [item({ diagnosis: 'Tension headache' })]

    const result = await scoreAgainstGroundTruth(ddx, ['Acute ischemic stroke'], adjudicate)

    expect(result).toEqual({ top1Hit: false, top3Hit: false })
  })

  it('is both false, and makes no adjudicator call, for an empty ddx list', async () => {
    const adjudicate = vi.fn(async (pairs: [string, string][]) => pairs.map(() => true))

    const result = await scoreAgainstGroundTruth([], ['Migraine'], adjudicate)

    expect(result).toEqual({ top1Hit: false, top3Hit: false })
    expect(adjudicate).not.toHaveBeenCalled()
  })

  it('is both false, and makes no adjudicator call, for an empty expected list', async () => {
    const adjudicate = vi.fn(async (pairs: [string, string][]) => pairs.map(() => true))
    const ddx = [item({ diagnosis: 'Migraine' })]

    const result = await scoreAgainstGroundTruth(ddx, [], adjudicate)

    expect(result).toEqual({ top1Hit: false, top3Hit: false })
    expect(adjudicate).not.toHaveBeenCalled()
  })

  it('treats a needed-adjudication pair as a non-match when no adjudicator is injected, and never throws', async () => {
    const ddx = [item({ diagnosis: 'Transient ischemic attack' })]

    const result = await scoreAgainstGroundTruth(ddx, ['TIA'])

    expect(result).toEqual({ top1Hit: false, top3Hit: false })
  })

  it('batches every pair needing adjudication into exactly one call across a multi-item ddx and multi-entry expected list', async () => {
    const adjudicate = vi.fn(async (pairs: [string, string][]) => pairs.map(() => false))
    const ddx = [
      item({ diagnosis: 'A1' }),
      item({ diagnosis: 'A2' }),
      item({ diagnosis: 'A3' }),
    ]
    const expected = ['E1', 'E2']

    await scoreAgainstGroundTruth(ddx, expected, adjudicate)

    expect(adjudicate).toHaveBeenCalledTimes(1)
    const pairsArg = adjudicate.mock.calls[0][0] as [string, string][]
    expect(pairsArg.length).toBe(6) // 3 ddx (top-3) x 2 expected
  })

  it('only compares the top-3 of ddx (a 4th-ranked item is never sent to the adjudicator)', async () => {
    const adjudicate = vi.fn(async (pairs: [string, string][]) => pairs.map(() => false))
    const ddx = [
      item({ diagnosis: 'A1' }),
      item({ diagnosis: 'A2' }),
      item({ diagnosis: 'A3' }),
      item({ diagnosis: 'A4-ignored' }),
    ]

    await scoreAgainstGroundTruth(ddx, ['E1'], adjudicate)

    const pairsArg = adjudicate.mock.calls[0][0] as [string, string][]
    expect(pairsArg.flat()).not.toContain('A4-ignored')
  })
})
