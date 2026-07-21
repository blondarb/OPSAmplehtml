/**
 * Deterministic pre-layer for the AI Historian thoroughness judge
 * (Historian Validation Suite Task 3). Runs BEFORE the LLM judge call and
 * its findings are always appended into the final result — never skipped,
 * regardless of what the LLM says (see thoroughnessJudge.ts). Four checks:
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

// ── 3. Turn cap ───────────────────────────────────────────────────────────────

export interface TurnCapCheckResult {
  patientTurnCount: number
  limit: number
  exceeded: boolean
}

/** Existing historian rule (historianPrompts.ts CORE_PROMPT rule 13: "Never exceed 25 turns total"), confirmed as 25 PATIENT turns per the task brief. */
export const PATIENT_TURN_CAP = 25

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

// ── Aggregator ────────────────────────────────────────────────────────────────

export interface DeterministicCheckResult {
  diagnosisLeak: DiagnosisLeakCheckResult
  phaseMarkers: PhaseMarkerCheckResult
  turnCap: TurnCapCheckResult
  structuredOutput: StructuredOutputCheckResult
  /** Flattened human-readable issue strings across all four checks — appended into the judge's final result. */
  issues: string[]
}

export function runDeterministicChecks(
  transcript: HistorianTranscriptEntry[],
  structuredOutput?: HistorianStructuredOutput | null,
  narrativeSummary?: string | null,
): DeterministicCheckResult {
  const diagnosisLeak = scanForDiagnosisLeak(transcript)
  const phaseMarkers = checkPhaseMarkers(transcript)
  const turnCap = checkTurnCap(transcript)
  const structuredOutputResult = checkStructuredOutputValidity(structuredOutput, narrativeSummary)

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
  if (turnCap.exceeded) {
    issues.push(`patient turn count ${turnCap.patientTurnCount} exceeds the ${turnCap.limit}-turn cap`)
  }
  issues.push(...structuredOutputResult.issues)

  return { diagnosisLeak, phaseMarkers, turnCap, structuredOutput: structuredOutputResult, issues }
}
