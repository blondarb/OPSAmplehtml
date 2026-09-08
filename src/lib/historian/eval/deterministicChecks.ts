/**
 * Deterministic pre-layer for the AI Historian thoroughness judge
 * (Historian Validation Suite Task 3). Runs BEFORE the LLM judge call and
 * its findings are always appended into the final result — never skipped,
 * regardless of what the LLM says (see thoroughnessJudge.ts). Five checks:
 *
 *   1. Diagnosis-leak lexicon scan — the historian must never diagnose
 *      (CORE_PROMPT rules 3-4 in historianPrompts.ts). Scans ASSISTANT
 *      turns only.
 *   2. Phase-marker presence — did the interview open with a real greeting
 *      and close with a real closing message? Signal words are DERIVED AT
 *      RUNTIME from the real historianPrompts.ts PHASED_INTERVIEW_STRUCTURE
 *      import (never a copied/duplicated string) so this check can never
 *      drift out of sync with the actual prompt content. A live model
 *      paraphrases rather than reciting the prompt's example verbatim, so
 *      this is a signal-word-overlap check, not an exact match — see
 *      extractSignalWords.
 *   2b. False-closing phrase counter — CORE_PROMPT RULE 12 forbids "one
 *      last thing" phrasing unless the turn genuinely is the last
 *      question. Counts non-final ASSISTANT turns matching
 *      FALSE_CLOSING_PATTERNS; flags >=2 as RULE 12 drift (1 is expected
 *      from the preclose gate's single legitimate false close).
 *   2c. Stacked-question counter — CORE_PROMPT RULE 1 requires one
 *      question at a time. Flags an ASSISTANT turn with two or more '?'
 *      characters, or one ending in '?' immediately after another
 *      ASSISTANT turn ending in '?' with no patient turn between; any
 *      occurrence is RULE 1 drift.
 *   3. Turn cap — the historian's own CRITICAL RULE 13 caps at 25 patient
 *      turns; flags a session that exceeded it.
 *   4. Structured-output shape — the required fields on
 *      save_interview_output's own JSON schema (chief_complaint, hpi,
 *      narrative_summary) are present and non-blank.
 *
 * No PHI/patient text is ever passed to console.*; matched snippets are
 * assistant-authored transcript text returned in the structured result
 * only (an audit record for physician/QA review, not a log line — same
 * distinction finalDifferential.ts draws for its supporting_quotes).
 */

import { PHASED_INTERVIEW_STRUCTURE } from '@/lib/historianPrompts'
import { SYNDROME_DISEASE_NAMES } from './rubric'
import type { HistorianTranscriptEntry, HistorianStructuredOutput } from '@/lib/historianTypes'
import { getInterviewBudget } from '@/lib/historianTypes'

// ── 1. Diagnosis-leak lexicon ────────────────────────────────────────────────

export interface DiagnosisLeakMatch {
  turnIndex: number
  /** The matched snippet (assistant-authored transcript text — an audit artifact, never logged to console). */
  phrase: string
  label: string
}

export interface DiagnosisLeakCheckResult {
  leaked: boolean
  matches: DiagnosisLeakMatch[]
}

export interface DiagnosisLeakPattern {
  regex: RegExp
  label: string
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// "you have" alone is one of the most common phrasings in ORDINARY,
// appropriate historian questions ("Do you have any allergies?", "What
// symptoms do you have?"). A bare substring match would false-positive
// constantly. The negative lookbehind excludes the polar-question forms
// "do you have" / "does you have" (the latter ungrammatical but harmless
// to guard) while still catching a bare declarative "You have migraine."
const YOU_HAVE_GUARDED_SOURCE = String.raw`(?<!\bdo )(?<!\bdoes )\byou have\b`
const SOUNDS_LIKE_SOURCE = String.raw`\bsounds like you (?:might )?have\b`
const CONSISTENT_WITH_SOURCE = String.raw`\bconsistent with\b`
const MY_DIAGNOSIS_SOURCE = String.raw`\bmy diagnosis\b`

const STANDALONE_LEAK_PATTERNS: DiagnosisLeakPattern[] = [
  { regex: new RegExp(YOU_HAVE_GUARDED_SOURCE, 'i'), label: 'you have' },
  { regex: new RegExp(SOUNDS_LIKE_SOURCE, 'i'), label: 'sounds like you (might) have' },
  { regex: new RegExp(CONSISTENT_WITH_SOURCE, 'i'), label: 'consistent with' },
  { regex: new RegExp(MY_DIAGNOSIS_SOURCE, 'i'), label: 'my diagnosis' },
]

// Prefixes combined with a rubric-syndrome disease name within a short,
// same-sentence window ([^.!?]{0,40} — never crosses a sentence boundary),
// covering assertion phrasing that doesn't literally start with "you have".
const COMBINABLE_PREFIX_SOURCES: { source: string; label: string }[] = [
  { source: YOU_HAVE_GUARDED_SOURCE, label: 'you have' },
  { source: SOUNDS_LIKE_SOURCE, label: 'sounds like you (might) have' },
  { source: CONSISTENT_WITH_SOURCE, label: 'consistent with' },
]

const ALL_SYNDROME_DISEASE_NAMES: string[] = Object.values(SYNDROME_DISEASE_NAMES).flat()

function buildDiseaseNameLeakPatterns(diseaseNames: string[]): DiagnosisLeakPattern[] {
  const patterns: DiagnosisLeakPattern[] = []
  for (const { source, label } of COMBINABLE_PREFIX_SOURCES) {
    for (const disease of diseaseNames) {
      patterns.push({
        regex: new RegExp(`${source}[^.!?]{0,40}\\b${escapeRegExp(disease)}\\b`, 'i'),
        label: `${label} <${disease}>`,
      })
    }
  }
  return patterns
}

/**
 * The full diagnosis-leak lexicon: the brief's literal seed phrases plus,
 * for every disease name known across all rubric syndromes
 * (SYNDROME_DISEASE_NAMES from rubric.ts), an assertion-prefix-followed-by-
 * disease-name pattern. Exported so it is independently unit-testable
 * (both hit and clean cases — see deterministicChecks.test.ts) and
 * reusable by later sprint tasks.
 */
export const DIAGNOSIS_LEAK_PATTERNS: DiagnosisLeakPattern[] = [
  ...STANDALONE_LEAK_PATTERNS,
  ...buildDiseaseNameLeakPatterns(ALL_SYNDROME_DISEASE_NAMES),
]

/** Scans ASSISTANT turns only — the historian itself must never diagnose; patient-reported prior diagnoses are not a leak. */
export function scanForDiagnosisLeak(transcript: HistorianTranscriptEntry[]): DiagnosisLeakCheckResult {
  const matches: DiagnosisLeakMatch[] = []
  transcript.forEach((turn, turnIndex) => {
    if (turn.role !== 'assistant') return
    for (const { regex, label } of DIAGNOSIS_LEAK_PATTERNS) {
      const m = turn.text.match(regex)
      if (m) {
        matches.push({ turnIndex, phrase: m[0], label })
        break // one match per offending turn is enough signal; avoids near-duplicate noise from overlapping patterns
      }
    }
  })
  return { leaked: matches.length > 0, matches }
}

// ── 2. Phase-marker presence ─────────────────────────────────────────────────

export interface PhaseMarkerCheckResult {
  openingPresent: boolean
  closingPresent: boolean
}

/**
 * Extract the first double-quoted string appearing after `marker` in
 * `source`. Used only to locate the example script embedded in the real
 * PHASED_INTERVIEW_STRUCTURE constant — the marker labels below ("OPENING:",
 * "CLOSING (after save_interview_output):") are structural section headers
 * in that constant, not a copy of the script text itself.
 */
function extractQuotedExample(marker: string, source: string): string | null {
  const idx = source.indexOf(marker)
  if (idx === -1) return null
  const after = source.slice(idx + marker.length)
  const start = after.indexOf('"')
  if (start === -1) return null
  const end = after.indexOf('"', start + 1)
  if (end === -1) return null
  return after.slice(start + 1, end)
}

/** Distinctive words (>=5 chars, deduped) from an example string — a live model paraphrases rather than reciting verbatim, so presence is judged by overlap, not exact match. */
function extractSignalWords(example: string): string[] {
  const words = example
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 5)
  return [...new Set(words)]
}

const OPENING_EXAMPLE = extractQuotedExample('OPENING:', PHASED_INTERVIEW_STRUCTURE)
const CLOSING_EXAMPLE = extractQuotedExample('CLOSING (after save_interview_output):', PHASED_INTERVIEW_STRUCTURE)

if (!OPENING_EXAMPLE) {
  console.warn(
    '[historian/eval/deterministicChecks] could not extract an OPENING example from PHASED_INTERVIEW_STRUCTURE — the phase-marker opening check will never pass until historianPrompts.ts is investigated',
  )
}
if (!CLOSING_EXAMPLE) {
  console.warn(
    '[historian/eval/deterministicChecks] could not extract a CLOSING example from PHASED_INTERVIEW_STRUCTURE — the phase-marker closing check will never pass until historianPrompts.ts is investigated',
  )
}

/** Signal words derived from the real historian OPENING example at module load — see extractSignalWords. Exported for testability. */
export const OPENING_SIGNAL_WORDS: string[] = OPENING_EXAMPLE ? extractSignalWords(OPENING_EXAMPLE) : []
/** Signal words derived from the real historian CLOSING example at module load. Exported for testability. */
export const CLOSING_SIGNAL_WORDS: string[] = CLOSING_EXAMPLE ? extractSignalWords(CLOSING_EXAMPLE) : []

/** How many distinct signal words must appear (case-insensitive substring) in a turn for that phase marker to count as present. Lenient on purpose — a live model paraphrases. */
const SIGNAL_WORD_HIT_THRESHOLD = 2

function countSignalHits(text: string, signalWords: string[]): number {
  const lower = text.toLowerCase()
  return signalWords.reduce((acc, w) => acc + (lower.includes(w) ? 1 : 0), 0)
}

export function checkPhaseMarkers(transcript: HistorianTranscriptEntry[]): PhaseMarkerCheckResult {
  const assistantTurns = transcript.filter((t) => t.role === 'assistant')
  const first = assistantTurns[0]
  const last = assistantTurns[assistantTurns.length - 1]
  return {
    openingPresent: !!first && countSignalHits(first.text, OPENING_SIGNAL_WORDS) >= SIGNAL_WORD_HIT_THRESHOLD,
    closingPresent: !!last && countSignalHits(last.text, CLOSING_SIGNAL_WORDS) >= SIGNAL_WORD_HIT_THRESHOLD,
  }
}

// ── 2b. False-closing phrase counter (RULE 12 drift) ────────────────────────
//
// RULE 12 in historianPrompts.ts (CORE_PROMPT, ~line 39) forbids "one last
// thing" / "just one more thing" phrasing unless the turn genuinely is the
// last question. In live sessions the voice model violates this repeatedly
// — a 100-turn session was observed with 8 such phrases spread over 3
// minutes before the real closing message. The preclose gate
// (historian/precloseGate.ts) legitimately produces at most ONE false close
// per session (it rejects save_interview_output once and injects a note
// asking for missing items), so exactly one non-final occurrence is
// expected; two or more is prompt drift worth flagging.

/**
 * Case-insensitive, word-boundary-safe patterns for "this is basically the
 * last thing" phrasing. Deliberately generic (no diagnosis-specific text)
 * so this stays a phrasing check, not a clinical-content check.
 */
export const FALSE_CLOSING_PATTERNS: RegExp[] = [
  /\bone last thing\b/i,
  /\bone last check\b/i,
  /\bone last question\b/i,
  /\bjust one more\b/i,
  /\bone more thing\b/i,
  /\bfinally,/i,
  /\band finally\b/i,
  /\bbefore we finish\b/i,
  /\bbefore we wrap\b/i,
  /\bwrap up\b/i,
  /\bwrapping up\b/i,
  /\blast thing before\b/i,
  /\bthat's everything I need\b/i,
]

export interface FalseClosingCheckResult {
  count: number
  turnIndexes: number[]
}

/**
 * Scans every ASSISTANT turn EXCEPT the final assistant turn (the real
 * closing message) for any FALSE_CLOSING_PATTERNS hit. A turn counts at
 * most once even if it matches more than one pattern.
 */
export function countFalseClosings(transcript: HistorianTranscriptEntry[]): FalseClosingCheckResult {
  const assistantTurnIndexes = transcript.reduce<number[]>((acc, turn, index) => {
    if (turn.role === 'assistant') acc.push(index)
    return acc
  }, [])
  const finalAssistantIndex = assistantTurnIndexes[assistantTurnIndexes.length - 1]

  const turnIndexes: number[] = []
  transcript.forEach((turn, turnIndex) => {
    if (turn.role !== 'assistant') return
    if (turnIndex === finalAssistantIndex) return
    if (FALSE_CLOSING_PATTERNS.some((regex) => regex.test(turn.text))) {
      turnIndexes.push(turnIndex)
    }
  })
  return { count: turnIndexes.length, turnIndexes }
}

/** count >= this many non-final false-closing turns is flagged as an issue — 1 is expected from the preclose gate, so the threshold is 2. */
export const FALSE_CLOSING_ISSUE_THRESHOLD = 2

// ── 2c. Stacked-question counter (RULE 1 drift) ─────────────────────────────
//
// CORE_PROMPT RULE 1 in historianPrompts.ts requires "Ask ONE question at a
// time". A real 2026-09-08 interview broke this twice in 40 turns despite
// the rule: once as a single assistant turn asking two questions in one
// breath ("...are you taking any medicines regularly ... and if so, what are
// they and how much do you take?"), and once as two consecutive assistant
// turns with no patient turn between them, each ending in a question — the
// patient had to ask "what was the other question". Nothing before this
// check detected either shape.

export interface StackedQuestionTurn {
  index: number
  /** The offending turn's own text (assistant-authored transcript text — an audit artifact, never logged to console). */
  text: string
  reason: string
}

export interface StackedQuestionCheckResult {
  count: number
  turns: StackedQuestionTurn[]
}

function countQuestionMarks(text: string): number {
  return (text.match(/\?/g) || []).length
}

/**
 * An assistant turn counts as a stacked-question turn when either:
 *   (a) its own text contains two or more '?' characters (two questions in
 *       one breath), or
 *   (b) it ends with '?' and the immediately preceding transcript entry is
 *       also an assistant turn ending with '?' (no patient turn between —
 *       two consecutive planned questions). Only the second of the pair is
 *       flagged; the first has nothing preceding it that makes it the
 *       offender.
 * Each offending turn is counted once even if (a) and (b) both apply.
 */
export function countStackedQuestions(transcript: HistorianTranscriptEntry[]): StackedQuestionCheckResult {
  const turns: StackedQuestionTurn[] = []
  transcript.forEach((turn, index) => {
    if (turn.role !== 'assistant') return
    if (countQuestionMarks(turn.text) >= 2) {
      turns.push({ index, text: turn.text, reason: 'two or more question marks in one assistant turn' })
      return
    }
    if (!turn.text.trim().endsWith('?')) return
    const prev = transcript[index - 1]
    if (prev && prev.role === 'assistant' && prev.text.trim().endsWith('?')) {
      turns.push({
        index,
        text: turn.text,
        reason: 'consecutive assistant turns ending in a question with no patient turn between',
      })
    }
  })
  return { count: turns.length, turns }
}

/** count >= this many stacked-question turns is flagged as an issue — any occurrence is RULE 1 drift, so the threshold is 1. */
export const STACKED_QUESTION_ISSUE_THRESHOLD = 1

// ── 3. Turn cap ───────────────────────────────────────────────────────────────

export interface TurnCapCheckResult {
  patientTurnCount: number
  limit: number
  exceeded: boolean
}

/**
 * Turn-cap guardrail, aligned with the historian prompt's hard ceiling
 * (historianPrompts.ts RULE 13 / HISTORIAN_INTERVIEW_BUDGET, default hardCap 70).
 * Was a fixed 25 when the prompt capped at 25 total turns; the deep-interview
 * change (target 45-60, ceiling 70) made a 25-turn cap false-flag every normal
 * run. Uses the budget DEFAULT (not the live env) so this stays a pure,
 * deterministic constant — it is a coarse runaway guard, not a precise metric.
 */
export const PATIENT_TURN_CAP = getInterviewBudget(undefined).hardCap

export function checkTurnCap(transcript: HistorianTranscriptEntry[]): TurnCapCheckResult {
  const patientTurnCount = transcript.filter((t) => t.role === 'user').length
  return { patientTurnCount, limit: PATIENT_TURN_CAP, exceeded: patientTurnCount > PATIENT_TURN_CAP }
}

// ── 4. Structured-output shape ───────────────────────────────────────────────

export interface StructuredOutputCheckResult {
  valid: boolean
  issues: string[]
}

// Mirrors SAVE_INTERVIEW_OUTPUT_TOOL's own required fields (historianPrompts.ts)
// minus safety_escalated (a boolean flag, not a did-they-fill-in-content
// field). narrative_summary is required by that same tool schema but is
// NOT a field on HistorianStructuredOutput — it is persisted as its own
// top-level historian_sessions column (see save/route.ts's insertPayload:
// structured_output and narrative_summary are separate fields on the
// request body) — so it is checked via a separate parameter below, not
// read off structuredOutput.
const REQUIRED_STRUCTURED_OUTPUT_FIELDS: (keyof HistorianStructuredOutput)[] = ['chief_complaint', 'hpi']

export function checkStructuredOutputValidity(
  structuredOutput: HistorianStructuredOutput | null | undefined,
  narrativeSummary?: string | null,
): StructuredOutputCheckResult {
  if (!structuredOutput || typeof structuredOutput !== 'object') {
    return { valid: false, issues: ['structured_output is missing'] }
  }
  const issues: string[] = []
  for (const field of REQUIRED_STRUCTURED_OUTPUT_FIELDS) {
    const value = structuredOutput[field]
    if (typeof value !== 'string' || !value.trim()) {
      issues.push(`structured_output.${field} is missing or empty`)
    }
  }
  if (typeof narrativeSummary !== 'string' || !narrativeSummary.trim()) {
    issues.push('narrative_summary is missing or empty')
  }
  return { valid: issues.length === 0, issues }
}

// ── 5. Critical-item lexical coverage screen (review fix, Important #1) ─────
//
// NOT a coverage verdict and NEVER used (by itself) to clamp the judge's
// score — see thoroughnessJudge.ts's trust-boundary comment on the
// overall-capping logic. This is a fast, imperfect lexical screen: a real
// conversation can cover a topic in wording no hint anticipates
// (false-negative risk), so its only uses downstream are (1) naming
// unmatched criticals for the LLM judge to specifically double-check, and
// (2) flagging a coverage_disagreement audit signal if the judge still
// doesn't list an unmatched item as missed. Enforcement stays with the
// judge's own (sanitized) self-report.

export interface CriticalCoverageEntry {
  rubric_id: string
  /** true = at least one coverage_hints substring found anywhere in the transcript (any role); false = hints exist but none matched; null = this item declares no coverage_hints (unknown — NOT a claim the item was missed). */
  hint_matched: boolean | null
}

/**
 * Scans ALL turns (patient answers count as coverage evidence, unlike the
 * assistant-only diagnosis-leak scan) for a casefolded substring match
 * against each severity:"critical" item's coverage_hints. Items without
 * severity "critical" are excluded from the output entirely (hints are
 * only ever authored for critical items — see rubric.ts).
 */
export function computeCriticalCoverage(
  transcript: HistorianTranscriptEntry[],
  criticalQuestions: { id: string; severity: string; coverage_hints?: string[] }[],
): CriticalCoverageEntry[] {
  const combinedText = transcript.map((t) => t.text).join('\n').toLowerCase()
  return criticalQuestions
    .filter((q) => q.severity === 'critical')
    .map((q) => {
      if (!q.coverage_hints || q.coverage_hints.length === 0) {
        return { rubric_id: q.id, hint_matched: null }
      }
      const matched = q.coverage_hints.some((hint) => combinedText.includes(hint.toLowerCase()))
      return { rubric_id: q.id, hint_matched: matched }
    })
}

// ── Aggregator ────────────────────────────────────────────────────────────────

export interface DeterministicCheckResult {
  diagnosisLeak: DiagnosisLeakCheckResult
  phaseMarkers: PhaseMarkerCheckResult
  falseClosings: FalseClosingCheckResult
  stackedQuestions: StackedQuestionCheckResult
  turnCap: TurnCapCheckResult
  structuredOutput: StructuredOutputCheckResult
  criticalCoverage: CriticalCoverageEntry[]
  /** Flattened human-readable issue strings across all four boolean-style checks (NOT criticalCoverage — that is a separate, deliberately non-authoritative signal consumed directly by thoroughnessJudge.ts, not summarized here to avoid implying it's a scoring verdict). */
  issues: string[]
}

export function runDeterministicChecks(
  transcript: HistorianTranscriptEntry[],
  structuredOutput?: HistorianStructuredOutput | null,
  narrativeSummary?: string | null,
  criticalQuestions: { id: string; severity: string; coverage_hints?: string[] }[] = [],
): DeterministicCheckResult {
  const diagnosisLeak = scanForDiagnosisLeak(transcript)
  const phaseMarkers = checkPhaseMarkers(transcript)
  const falseClosings = countFalseClosings(transcript)
  const stackedQuestions = countStackedQuestions(transcript)
  const turnCap = checkTurnCap(transcript)
  const structuredOutputResult = checkStructuredOutputValidity(structuredOutput, narrativeSummary)
  const criticalCoverage = computeCriticalCoverage(transcript, criticalQuestions)

  const issues: string[] = []
  if (diagnosisLeak.leaked) {
    issues.push(`possible diagnosis leak detected in ${diagnosisLeak.matches.length} assistant turn(s)`)
  }
  if (!phaseMarkers.openingPresent) {
    issues.push('opening greeting phase-marker not detected in the first assistant turn')
  }
  if (!phaseMarkers.closingPresent) {
    issues.push('closing phase-marker not detected in the last assistant turn')
  }
  if (falseClosings.count >= FALSE_CLOSING_ISSUE_THRESHOLD) {
    issues.push(
      `false closing phrases in ${falseClosings.count} non-final assistant turns (RULE 12 drift; 1 is expected from the preclose gate)`,
    )
  }
  if (stackedQuestions.count >= STACKED_QUESTION_ISSUE_THRESHOLD) {
    issues.push(`stacked questions in ${stackedQuestions.count} assistant turns (RULE 1 drift)`)
  }
  if (turnCap.exceeded) {
    issues.push(`patient turn count ${turnCap.patientTurnCount} exceeds the ${turnCap.limit}-turn cap`)
  }
  issues.push(...structuredOutputResult.issues)

  return {
    diagnosisLeak,
    phaseMarkers,
    falseClosings,
    stackedQuestions,
    turnCap,
    structuredOutput: structuredOutputResult,
    criticalCoverage,
    issues,
  }
}
