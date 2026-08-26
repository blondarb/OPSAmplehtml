import {
  COMPREHENSIVE_HISTORY_DOMAINS,
  type ComprehensiveHistoryDomain,
} from '@/lib/historianTypes'

export interface ComprehensiveCoverageValidation {
  complete: boolean
  missingDomains: ComprehensiveHistoryDomain[]
  notAskedDomains: ComprehensiveHistoryDomain[]
  conflictingDomains: ComprehensiveHistoryDomain[]
}

const DOMAIN_IDS = new Set<string>(COMPREHENSIVE_HISTORY_DOMAINS.map((domain) => domain.id))

/**
 * Deterministic completion gate for Nova's save_interview_output tool. The
 * model must classify every fixed domain, and a domain explicitly marked
 * not_asked is still unfinished. Unknown/declined/conflicting are valid
 * patient-response outcomes; they remain visible to the physician as gaps.
 */
export function validateComprehensiveCoverage(value: unknown): ComprehensiveCoverageValidation {
  const historyCoverage =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).history_coverage
      : null
  const coverage =
    historyCoverage && typeof historyCoverage === 'object' && !Array.isArray(historyCoverage)
      ? (historyCoverage as Record<string, unknown>)
      : {}

  const covered = new Set<ComprehensiveHistoryDomain>()
  if (Array.isArray(coverage.covered_domains)) {
    for (const item of coverage.covered_domains) {
      if (typeof item === 'string' && DOMAIN_IDS.has(item)) {
        covered.add(item as ComprehensiveHistoryDomain)
      }
    }
  }

  const classifiedMissing = new Set<ComprehensiveHistoryDomain>()
  const notAsked = new Set<ComprehensiveHistoryDomain>()
  if (Array.isArray(coverage.missing_or_uncertain)) {
    for (const item of coverage.missing_or_uncertain) {
      if (!item || typeof item !== 'object') continue
      const candidate = item as Record<string, unknown>
      if (typeof candidate.domain !== 'string' || !DOMAIN_IDS.has(candidate.domain)) continue
      const domain = candidate.domain as ComprehensiveHistoryDomain
      if (
        candidate.reason === 'not_asked' ||
        candidate.reason === 'unknown' ||
        candidate.reason === 'declined' ||
        candidate.reason === 'conflicting'
      ) {
        classifiedMissing.add(domain)
        if (candidate.reason === 'not_asked') notAsked.add(domain)
      }
    }
  }

  const conflictingDomains = COMPREHENSIVE_HISTORY_DOMAINS
    .map((domain) => domain.id)
    .filter((domain) => covered.has(domain) && classifiedMissing.has(domain))
  const missingDomains = COMPREHENSIVE_HISTORY_DOMAINS
    .map((domain) => domain.id)
    .filter((domain) => !covered.has(domain) && !classifiedMissing.has(domain))

  return {
    complete:
      missingDomains.length === 0 &&
      notAsked.size === 0 &&
      conflictingDomains.length === 0,
    missingDomains,
    notAskedDomains: [...notAsked],
    conflictingDomains,
  }
}
