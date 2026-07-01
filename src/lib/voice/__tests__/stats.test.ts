import { describe, it, expect } from 'vitest'
import { icc21, blandAltman, withinSubjectCv, iccLabel } from '../stats'

describe('icc21', () => {
  it('returns ~1 for perfectly agreeing columns', () => {
    const { icc } = icc21([[1, 1], [2, 2], [3, 3]])
    expect(icc).not.toBeNull()
    expect(icc as number).toBeCloseTo(1, 5)
  })

  it('is low for uncorrelated columns', () => {
    const { icc } = icc21([[1, 9], [2, 1], [3, 5], [4, 2]])
    expect(icc as number).toBeLessThan(0.5)
  })

  it('returns null when there are too few subjects or raters', () => {
    expect(icc21([[1, 2]]).icc).toBeNull()
    expect(icc21([[1], [2]]).icc).toBeNull()
  })

  it('drops rows with non-finite values', () => {
    const res = icc21([[1, 1], [2, 2], [Number.NaN, 3]])
    expect(res.n).toBe(2)
    expect(res.icc).toBeCloseTo(1, 5)
  })
})

describe('blandAltman', () => {
  it('reports zero bias for identical series', () => {
    const ba = blandAltman([1, 2, 3], [1, 2, 3])!
    expect(ba.bias).toBeCloseTo(0, 6)
    expect(ba.sdDiff).toBeCloseTo(0, 6)
  })

  it('reports a constant offset as bias', () => {
    const ba = blandAltman([2, 3, 4], [1, 2, 3])!
    expect(ba.bias).toBeCloseTo(1, 6)
  })

  it('returns null with fewer than two valid pairs', () => {
    expect(blandAltman([1], [1])).toBeNull()
  })
})

describe('withinSubjectCv', () => {
  it('is 0 when repeats are identical', () => {
    expect(withinSubjectCv([[10, 10], [20, 20]])).toBeCloseTo(0, 6)
  })

  it('rises with repeat spread', () => {
    const cv = withinSubjectCv([[8, 12], [18, 22]])!
    expect(cv).toBeGreaterThan(0)
  })
})

describe('iccLabel', () => {
  it('bins per the Koo & Li convention', () => {
    expect(iccLabel(0.3)).toBe('poor')
    expect(iccLabel(0.6)).toBe('moderate')
    expect(iccLabel(0.8)).toBe('good')
    expect(iccLabel(0.95)).toBe('excellent')
    expect(iccLabel(null)).toBe('n/a')
  })
})
