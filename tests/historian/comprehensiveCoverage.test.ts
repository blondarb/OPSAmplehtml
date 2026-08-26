import { describe, expect, it } from 'vitest'
import { validateComprehensiveCoverage } from '@/lib/historian/comprehensiveCoverage'
import { COMPREHENSIVE_HISTORY_DOMAINS } from '@/lib/historianTypes'

const allDomains = COMPREHENSIVE_HISTORY_DOMAINS.map((domain) => domain.id)

describe('Comprehensive history completion gate', () => {
  it('accepts a complete fixed-domain classification', () => {
    expect(validateComprehensiveCoverage({
      history_coverage: { covered_domains: allDomains, missing_or_uncertain: [] },
    })).toEqual({
      complete: true,
      missingDomains: [],
      notAskedDomains: [],
      conflictingDomains: [],
    })
  })

  it('accepts unknown/declined outcomes as classified physician-visible gaps', () => {
    const covered = allDomains.slice(2)
    const result = validateComprehensiveCoverage({
      history_coverage: {
        covered_domains: covered,
        missing_or_uncertain: [
          { domain: allDomains[0], reason: 'unknown' },
          { domain: allDomains[1], reason: 'declined' },
        ],
      },
    })
    expect(result.complete).toBe(true)
  })

  it('rejects unclassified, not-asked, and double-classified domains', () => {
    const result = validateComprehensiveCoverage({
      history_coverage: {
        covered_domains: [allDomains[0]],
        missing_or_uncertain: [
          { domain: allDomains[0], reason: 'conflicting' },
          { domain: allDomains[1], reason: 'not_asked' },
        ],
      },
    })
    expect(result.complete).toBe(false)
    expect(result.conflictingDomains).toEqual([allDomains[0]])
    expect(result.notAskedDomains).toEqual([allDomains[1]])
    expect(result.missingDomains).toContain(allDomains[2])
  })
})
