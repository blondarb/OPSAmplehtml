/**
 * Localizer eval harness — type definitions.
 *
 * A Vignette is a clinical scenario fed to the differential engine
 * (Historian Localizer or Reasoning/Exam Interpreter). The `gold` block
 * encodes what a correct differential MUST do — used by `score.ts`.
 *
 * Design goal: the scorer is PURE and deterministic (no Bedrock needed),
 * so the scoring logic itself is unit-testable. The runner (`run.ts`)
 * supplies real model output via a pluggable adapter.
 *
 * See docs/plans/2026-06-13-localizer-differential-hardening-spec.md
 */

/** A diagnosis matcher: any case-insensitive substring in `patterns` counts as a hit. */
export interface DxMatcher {
  /** Human-readable label for reports. */
  label: string
  /** Case-insensitive substrings; ANY match means the dx is considered present. */
  patterns: string[]
}

/** Gold standard: what a correct differential must do for this vignette. */
export interface Gold {
  /** Expected neuroanatomical localization terms (ANY match against localizationHypothesis passes). */
  localization?: string[]
  /** Each matcher MUST appear somewhere in the differential (likelihood list or cant-miss list). */
  mustIncludeDx: DxMatcher[]
  /** Each listed dx must rank within the top `n` of the combined differential ordering. */
  mustRankTopN?: { dx: DxMatcher; n: number }[]
  /**
   * Screening items that must surface in follow-up questions OR differential rationales.
   * Each entry may use `a|b` to accept alternates (e.g. "mma|methylmalonic").
   */
  mustScreen?: string[]
  /** None of these may appear in the differential — guards specificity / over-firing. */
  mustNotInclude?: DxMatcher[]
}

/** Input scenario. `transcript` is what the localizer consumes; `exam` documents the source finding set. */
export interface VignetteInput {
  sessionType?: 'new_patient' | 'follow_up'
  chiefComplaint?: string
  transcript: { role: 'assistant' | 'user'; text: string; timestamp?: number }[]
  /** Optional exam-findings string (Reasoning / Exam Interpreter style vignettes). */
  exam?: string
}

export interface Vignette {
  id: string
  /** Provenance, e.g. "Adam Cohen, 2026-04-24". */
  source?: string
  description?: string
  input: VignetteInput
  gold: Gold
}

// ── Normalized model output the scorer operates on ────────────────────────────
// Matches the current LocalizerResponse shape, plus an OPTIONAL `cantMiss`
// list for the dual-axis design (spec §3b). The scorer treats the combined
// (differential ++ cantMiss) set as "present", but ranks against `differential`.

export interface ScoredDx {
  diagnosis: string
  rationale?: string
  likelihood?: 'high' | 'medium' | 'low'
}

export interface LocalizerLike {
  differential: ScoredDx[]
  /** Dual-axis can't-miss list (spec §3b). Absent on the current single-axis engine. */
  cantMiss?: ScoredDx[]
  followUpQuestions: string[]
  localizationHypothesis: string
}

// ── Scoring results ───────────────────────────────────────────────────────────

export interface CheckResult {
  name: string
  pass: boolean
  detail: string
}

export interface VignetteScore {
  id: string
  checks: CheckResult[]
  passed: number
  total: number
  pass: boolean
}
