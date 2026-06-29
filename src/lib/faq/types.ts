/**
 * Neuro FAQ Voice — shared types.
 *
 * POC SKELETON. Lives in its own file so specialty.ts, faq-retrieval.ts, and
 * faq-guardrails.ts can share types without an import cycle.
 */

export type SpecialtyId = 'neuro' | 'oab'

export interface FaqEntry {
  id: string
  topic: string
  question: string
  canonical_answer: string
  escalation: 'none' | 'soft' | 'route'
  keywords: string[]
  source: string
  reviewed_by: string | null
  last_reviewed: string | null
}

/** A named bank of red-flag regexes (one category, e.g. "stroke"). */
export interface RedFlagBank {
  category: string
  /** Word-boundary / phrase regexes matched against the lowercased transcript. */
  patterns: RegExp[]
  /** Self-harm banks get the 988/741741 appendix in the spoken response. */
  selfHarm?: boolean
}

export interface SpecialtyConfig {
  id: SpecialtyId
  label: string
  /** Specialty-specific red-flag banks (merged with the cross-specialty shared banks). */
  redFlagBanks: RedFlagBank[]
  /** Specialty-specific out-of-scope patterns (merged with shared). Usually empty. */
  outOfScopePatterns: RegExp[]
  /** The grounding corpus for this specialty. */
  corpus: FaqEntry[]
}
