/**
 * Shared constants for the AI Historian post-session evaluator pipeline
 * (Historian Validation Suite, Task 2+).
 *
 * Single source of truth so:
 *   - The investigational banner text is never inlined by a UI component —
 *     DifferentialCard (and any future evaluator-output surface) must import
 *     INVESTIGATIONAL_BANNER rather than hardcode the string.
 *   - Every evaluator prompt version is registered once, here, instead of
 *     scattered as string literals across finalDifferential.ts and later
 *     sprint tasks (thoroughness judge, fidelity screen, independent scorer).
 */

/**
 * Banner shown on every AI-generated differential surface (DifferentialCard).
 * The historian interview itself never diagnoses (prompt-hardened, by
 * design) — this differential comes from a separate, post-session review
 * pass and is for retrospective QA/audit review only, never for real-time
 * clinical decision-making.
 */
export const INVESTIGATIONAL_BANNER =
  'Investigational — AI-generated differential for retrospective QA and audit review only. ' +
  'Not a clinical diagnosis and not intended to guide patient care. The historian interview ' +
  'itself never diagnoses; this differential is produced by a separate review pass after the ' +
  'session ends and requires physician verification against the full chart.'

export interface PromptVersionInfo {
  /** Stable identifier used verbatim as provenance.prompt_version. */
  id: string
  /** Human-readable description of what this prompt version does. */
  description: string
  /** ISO date (YYYY-MM-DD) this version was introduced. */
  introducedAt: string
}

/**
 * Registry of every evaluator prompt version ever shipped.
 *
 * Append-only: once an id has been used in a persisted
 * FinalDifferential.provenance.prompt_version, its entry here must never be
 * edited or removed — later tasks (independent scorer, batch harness, QI
 * report) key off these stable ids to compare runs across prompt versions.
 */
export const PROMPT_VERSIONS: Record<string, PromptVersionInfo> = {
  'final-ddx-v1': {
    id: 'final-ddx-v1',
    description:
      'Final full-transcript differential diagnosis pass: shared symptom extraction + neuro_plans-grounded evidence + one schema-forced Sonnet tool call, max 6 diagnoses, verbatim-quote-cited.',
    introducedAt: '2026-07-20',
  },
}
