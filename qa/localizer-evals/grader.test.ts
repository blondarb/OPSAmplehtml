import { describe, it, expect } from 'vitest'
import {
  buildQualityPrompt,
  buildPairwisePrompt,
  parseQualityVerdict,
  parsePairwiseVerdict,
  gradePairwise,
  gradePairwiseDebiased,
  type JudgeFn,
} from './grader'
import type { LocalizerLike, Vignette } from './schema'
import scdB12 from './vignettes/scd-b12-001.json'

const vignette = scdB12 as unknown as Vignette

const good: LocalizerLike = {
  differential: [
    { diagnosis: 'B12 deficiency (subacute combined degeneration)', rationale: 'GOOD-MARKER: vegan + PPI; check B12/MMA.', likelihood: 'high' },
    { diagnosis: 'Cervical myelopathy', rationale: 'MRI c-spine.', likelihood: 'medium' },
  ],
  followUpQuestions: ['Have you had your B12 checked?'],
  localizationHypothesis: 'Dorsal columns + corticospinal tracts.',
}

const poor: LocalizerLike = {
  differential: [{ diagnosis: 'Alzheimer disease', rationale: 'memory loss', likelihood: 'high' }],
  followUpQuestions: [],
  localizationHypothesis: 'Diffuse cortical.',
}

describe('grader prompt builders (pure)', () => {
  it('quality prompt embeds the scenario, the output, and the rubric/JSON contract', () => {
    const { system, user } = buildQualityPrompt(vignette, good)
    expect(system).toContain('independent')
    expect(system).toContain('cant_miss_completeness')
    expect(system).toContain('"overall"')
    expect(user).toContain('Exam findings')
    expect(user).toContain('B12 deficiency')
    expect(user).toContain('Dorsal columns')
  })

  it('pairwise prompt includes both options and the no-length-bias instruction', () => {
    const { system, user } = buildPairwisePrompt(vignette, good, poor)
    expect(system).toContain('Do not favor an answer for being longer')
    expect(user).toContain('=== OPTION A ===')
    expect(user).toContain('=== OPTION B ===')
    expect(user).toContain('Alzheimer disease')
  })
})

describe('grader parsers (pure, fence-tolerant)', () => {
  it('parses fenced quality JSON', () => {
    const raw = '```json\n{"overall":4,"criteria":{"diagnostic_accuracy":4,"cant_miss_completeness":5,"ranking_appropriateness":4,"localization_quality":4,"safety":4},"missed_diagnoses":[],"rationale":"solid"}\n```'
    const v = parseQualityVerdict(raw)
    expect(v.overall).toBe(4)
    expect(v.criteria.cant_miss_completeness).toBe(5)
  })

  it('rejects an invalid pairwise winner', () => {
    expect(() => parsePairwiseVerdict('{"winner":"maybe"}')).toThrow()
  })
})

// A content-aware judge: picks whichever OPTION block contains GOOD-MARKER.
const consistentJudge: JudgeFn = async (_system, user) => {
  const [, rest] = user.split('=== OPTION A ===')
  const [optA, optB] = rest.split('=== OPTION B ===')
  const winner = optA.includes('GOOD-MARKER') ? 'A' : optB.includes('GOOD-MARKER') ? 'B' : 'tie'
  return JSON.stringify({ winner, rationale: 'picked the can\'t-miss-complete option', criteria_winners: {} })
}

// A position-biased judge: always picks whatever is in slot A.
const positionBiasedJudge: JudgeFn = async () =>
  JSON.stringify({ winner: 'A', rationale: 'always A', criteria_winners: {} })

describe('pairwise grading + position debiasing', () => {
  it('a content-aware judge prefers the better differential', async () => {
    const v = await gradePairwise(vignette, good, poor, consistentJudge)
    expect(v.winner).toBe('A') // good is in slot A
    const v2 = await gradePairwise(vignette, poor, good, consistentJudge)
    expect(v2.winner).toBe('B') // good moved to slot B
  })

  it('debiasing keeps a consistent verdict', async () => {
    const v = await gradePairwiseDebiased(vignette, good, poor, consistentJudge)
    expect(v.winner).toBe('A')
  })

  it('debiasing collapses a position-biased judge to a tie', async () => {
    const v = await gradePairwiseDebiased(vignette, good, poor, positionBiasedJudge)
    expect(v.winner).toBe('tie')
    expect(v.rationale).toContain('Position-dependent')
  })
})
