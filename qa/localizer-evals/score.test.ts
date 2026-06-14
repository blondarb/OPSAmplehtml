import { describe, it, expect } from 'vitest'
import { scoreVignette, dxRank, dxPresent } from './score'
import type { LocalizerLike } from './schema'
import scdB12 from './vignettes/scd-b12-001.json'
import migraine from './vignettes/migraine-negative-control-001.json'

// A "good" engine response for the B12/SCD vignette — what hardened output should look like.
const goodB12: LocalizerLike = {
  differential: [
    { diagnosis: 'B12 deficiency (subacute combined degeneration)', rationale: 'Check B12, MMA, homocysteine; vegan diet + PPI use.', likelihood: 'high' },
    { diagnosis: 'Cervical spondylotic myelopathy', rationale: 'MRI cervical spine.', likelihood: 'medium' },
    { diagnosis: 'Early Alzheimer disease', rationale: 'Memory complaint.', likelihood: 'low' },
  ],
  followUpQuestions: ['Have you had your vitamin B12 level checked recently?'],
  localizationHypothesis: 'Dorsal column and corticospinal tract involvement (myelopathy).',
}

// A "bad" response reproducing Adam's failure: B12 buried at the bottom, no localization, no screening.
const badB12: LocalizerLike = {
  differential: [
    { diagnosis: 'Alzheimer disease', rationale: 'Memory loss.', likelihood: 'high' },
    { diagnosis: 'Peripheral neuropathy', rationale: 'Numb feet.', likelihood: 'medium' },
    { diagnosis: 'Normal aging', rationale: '', likelihood: 'medium' },
    { diagnosis: 'B12 deficiency', rationale: '', likelihood: 'low' },
  ],
  followUpQuestions: ['How long has the memory loss been going on?'],
  localizationHypothesis: 'Diffuse cortical process.',
}

describe('localizer scorer — B12/SCD seed (scd-b12-001)', () => {
  it('passes a hardened response that ranks B12 top-3 with localization + screening', () => {
    const r = scoreVignette(scdB12.id, scdB12.gold as any, goodB12)
    expect(r.pass).toBe(true)
    expect(r.passed).toBe(r.total)
  })

  it('fails the regression case: B12 ranked too low, no localization, no screening', () => {
    const r = scoreVignette(scdB12.id, scdB12.gold as any, badB12)
    expect(r.pass).toBe(false)
    const failed = r.checks.filter((c) => !c.pass).map((c) => c.name)
    // B12 is present (so include passes) but ranked #4 → rank check fails;
    // localization + both screening checks fail.
    expect(failed).toContain('rank:B12 deficiency / SCD<=3')
    expect(failed).toContain('localization')
    expect(failed).toContain('screen:b12|cobalamin')
    expect(failed).toContain('screen:mma|methylmalonic')
  })

  it('dxPresent matches via aliases; dxRank reflects likelihood ordering', () => {
    const m = { label: 'b12', patterns: ['b12', 'subacute combined', 'cobalamin'] }
    expect(dxPresent(goodB12, m)).toBe(true)
    expect(dxRank(goodB12, m)).toBe(1)
    expect(dxRank(badB12, m)).toBe(4)
  })
})

describe('localizer scorer — specificity guard (migraine negative control)', () => {
  it('passes when migraine is named and no zebra workup is over-fired', () => {
    const clean: LocalizerLike = {
      differential: [
        { diagnosis: 'Migraine with aura', rationale: 'Classic visual aura then unilateral throbbing headache.', likelihood: 'high' },
        { diagnosis: 'Tension-type headache', rationale: 'Common alternative.', likelihood: 'low' },
      ],
      followUpQuestions: ['How often do the headaches occur?'],
      localizationHypothesis: 'Cortical spreading depression.',
    }
    const r = scoreVignette(migraine.id, migraine.gold as any, clean)
    expect(r.pass).toBe(true)
  })

  it('fails (over-firing) when a paraneoplastic/vasculitis zebra is added', () => {
    const overfired: LocalizerLike = {
      differential: [
        { diagnosis: 'Migraine with aura', rationale: '', likelihood: 'high' },
        { diagnosis: 'CNS vasculitis', rationale: 'Consider angiography.', likelihood: 'low' },
      ],
      followUpQuestions: [],
      localizationHypothesis: '',
    }
    const r = scoreVignette(migraine.id, migraine.gold as any, overfired)
    expect(r.pass).toBe(false)
    expect(r.checks.find((c) => c.name === 'exclude:CNS vasculitis')?.pass).toBe(false)
  })
})
