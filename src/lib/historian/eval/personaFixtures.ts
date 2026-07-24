/**
 * Converts tests/simulated-patients/personas/*.json fixtures into
 * HistorianTranscriptEntry[] transcripts for the historian eval pipeline —
 * both the vitest live-gate suites (finalDifferential.gate.test.ts,
 * thoroughnessJudge.gate.test.ts, independentDdx.gate.test.ts, etc.) and
 * the Task 5 batch harness (src/lib/historian/eval/cli.ts).
 *
 * MOVED HERE (Historian Validation Suite Task 5) from
 * tests/historian-eval/fixtures/personaTranscripts.ts, which is now a
 * re-export shim — see that file's comment. The move was necessary because
 * cli.ts lives under src/ and is invoked by scripts/historian-eval.ts via
 * tsx outside any test runner; src/ code should not reach into tests/ for a
 * dependency (fragile relative path, wrong dependency direction), and the
 * `@/*` tsconfig path alias only maps to ./src/*, so it cannot resolve a
 * path under tests/ at all. Moving the real implementation here and leaving
 * a shim at the old path keeps every existing `from './fixtures/
 * personaTranscripts'` import in tests/historian-eval/*.test.ts working
 * unchanged.
 *
 * The persona JSON files themselves stay under tests/simulated-patients/
 * personas/ (fixture DATA, not code) — read at runtime via fs, exactly as
 * before. This module is never imported by an Amplify SSR route (only by
 * test files and the standalone CLI script), so the rds-ca-bundle.ts /
 * rubric.ts loose-file-bundling gotcha documented elsewhere in this repo
 * does not apply here.
 */
import * as fs from 'fs'
import * as path from 'path'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

const PERSONAS_DIR = path.join(__dirname, '..', '..', '..', '..', 'tests', 'simulated-patients', 'personas')

/** Synthetic pacing: seconds between one turn-pair and the next. */
const SECONDS_PER_TURN_PAIR = 20
/** Synthetic pacing: seconds between the assistant's question and the patient's reply. */
const ASSISTANT_TO_USER_GAP_SECONDS = 8

interface PersonaHistoryResponseJSON {
  question_pattern: string
  response: string
}

interface PersonaExpectedDDxJSON {
  diagnosis: string
  likelihood?: string
}

interface PersonaDemographicsJSON {
  age?: number
  sex?: string
  name?: string
  date_of_birth?: string
  email?: string
  phone?: string
}

interface PersonaJSON {
  id?: string
  name?: string
  intakeData?: { chief_complaint?: string }
  historyResponses?: PersonaHistoryResponseJSON[]
  expectedDDx?: PersonaExpectedDDxJSON[]
  narrativeSummary?: string
  // Fields below this line are read only by loadPersonaProfile() (Historian
  // Validation Suite Task 6) — buildPersonaTranscript() never touches them.
  demographics?: PersonaDemographicsJSON
  /**
   * Free-form physician-authored ground-truth clinical facts (onset,
   * location, duration, character, severity, associated_symptoms,
   * current_medications, allergies, past_medical_history, family_history,
   * social_history, review_of_systems, ...). Every persona fixture file
   * uses plain string values for every key, so this stays a flat
   * Record<string, string> rather than a typed HistorianStructuredOutput —
   * it is a DIFFERENT, similarly-shaped object missing fields like `hpi`
   * (see cli.ts's docstring for the same caution about this fixture
   * field).
   */
  structuredHistory?: Record<string, string>
}

/** One ground-truth differential entry from a persona's `expectedDDx`. */
export interface PersonaExpectedDx {
  diagnosis: string
  /** e.g. "high" | "medium" | "low" — as authored in the persona JSON, lowercased. Absent if the source entry didn't specify one. */
  likelihood?: string
}

export interface PersonaTranscriptFixture {
  transcript: HistorianTranscriptEntry[]
  chiefComplaint: string
  /** Ground truth, likelihood preserved — some personas have multiple tied "high" entries; callers must not assume [0] is the only correct answer. */
  expectedDDx: PersonaExpectedDx[]
  /**
   * Convenience: just the diagnosis strings, in original order — for
   * callers that only need names.
   *
   * Caution for any caller building a matcher over this list directly
   * (bypassing `expectedDDx`'s `likelihood` field and a filter like
   * finalDifferential.gate.test.ts's `highLikelihoodOrAll()`): it
   * includes every likelihood tier, including single-word "low" entries
   * (e.g. "TIA", "CIDP"). Match these with tests/historian-eval/ddxMatch.ts's
   * `tokenSetMatch`, not a plain substring/subset check — a single-token
   * entry needs `tokenSetMatch`'s specificity floor (exact-match-only for
   * single-token sides) or it will spuriously match any candidate that
   * merely contains that word. This whole matching layer is interim —
   * Task 4's ICD-10-category + adjudicated matching supersedes it.
   */
  expectedDDxStrings: string[]
  /**
   * Historian Validation Suite Task 5: the persona's pre-authored
   * `narrativeSummary` field (a physician-style write-up derived from the
   * persona's `structuredHistory`), when the fixture file has one.
   * Undefined otherwise — never an empty string. The batch harness passes
   * this as `reports.narrative_summary` to the thoroughness judge so its
   * fidelity screen can run in fixtures mode (see cli.ts's docstring for
   * the full extension-point note: this is NOT the real save-time
   * narrative_summary a live interview would produce, and full
   * patient/physician-report fidelity checking against the actual app
   * routes is explicitly out of scope for this harness).
   */
  narrativeSummary?: string
}

/** List every persona fixture file (basenames, e.g. "acute-stroke.json"). */
export function listPersonaFiles(): string[] {
  return fs.readdirSync(PERSONAS_DIR).filter((f) => f.endsWith('.json')).sort()
}

function resolvePersonaPath(personaFile: string): string {
  const fileName = personaFile.endsWith('.json') ? personaFile : `${personaFile}.json`
  return path.join(PERSONAS_DIR, fileName)
}

/**
 * Read + parse one persona fixture file. Shared by buildPersonaTranscript()
 * and loadPersonaProfile() (Historian Validation Suite Task 6) so the
 * file-path resolution + read/parse logic lives in exactly one place.
 */
function readPersonaJson(personaFile: string): PersonaJSON {
  const fullPath = resolvePersonaPath(personaFile)
  let raw: string
  try {
    raw = fs.readFileSync(fullPath, 'utf-8')
  } catch (err) {
    throw new Error(
      `[personaFixtures] Could not read persona fixture "${personaFile}" (resolved to ${fullPath}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
  return JSON.parse(raw) as PersonaJSON
}

/**
 * Build a synthetic HistorianTranscriptEntry[] transcript (plus chief
 * complaint + expected DDx) from a persona fixture file.
 *
 * `personaFile` may be a bare id ("acute-stroke") or filename
 * ("acute-stroke.json"). Each `historyResponses` Q&A pair becomes two
 * alternating entries — assistant question, then user response — with
 * synthetic monotonic offsets/seq (these personas were authored for
 * request/response test helpers, not real timed voice sessions, so there is
 * no real timing to preserve).
 */
export function buildPersonaTranscript(personaFile: string): PersonaTranscriptFixture {
  const persona = readPersonaJson(personaFile)
  const historyResponses = persona.historyResponses ?? []

  const transcript: HistorianTranscriptEntry[] = []
  historyResponses.forEach((qa, i) => {
    const baseOffset = i * SECONDS_PER_TURN_PAIR
    transcript.push({
      role: 'assistant',
      text: qa.question_pattern,
      timestamp: baseOffset,
      seq: transcript.length + 1,
    })
    transcript.push({
      role: 'user',
      text: qa.response,
      timestamp: baseOffset + ASSISTANT_TO_USER_GAP_SECONDS,
      seq: transcript.length + 1,
    })
  })

  const chiefComplaint = persona.intakeData?.chief_complaint?.trim() ?? ''
  const expectedDDx: PersonaExpectedDx[] = (persona.expectedDDx ?? [])
    .filter((d) => typeof d?.diagnosis === 'string' && d.diagnosis.trim().length > 0)
    .map((d) => ({
      diagnosis: d.diagnosis.trim(),
      ...(typeof d.likelihood === 'string' && d.likelihood.trim()
        ? { likelihood: d.likelihood.trim().toLowerCase() }
        : {}),
    }))
  const expectedDDxStrings = expectedDDx.map((d) => d.diagnosis)
  const narrativeSummary =
    typeof persona.narrativeSummary === 'string' && persona.narrativeSummary.trim()
      ? persona.narrativeSummary.trim()
      : undefined

  return {
    transcript,
    chiefComplaint,
    expectedDDx,
    expectedDDxStrings,
    ...(narrativeSummary ? { narrativeSummary } : {}),
  }
}

// ── Persona profile (Historian Validation Suite Task 6) ──────────────────────
//
// The synthetic patient-conversation driver (src/lib/historian/synthetic/)
// needs MORE of the persona fixture than buildPersonaTranscript() extracts —
// specifically demographics and structuredHistory, so the Bedrock patient
// agent can answer ANY question the live historian asks (not just the
// pre-scripted historyResponses Q&A pairs) while staying consistent with the
// case's ground-truth facts. loadPersonaProfile() is that second, additive
// view onto the same underlying JSON files, reusing readPersonaJson() so the
// file-path/read/parse logic is never duplicated.

export interface PersonaProfileDemographics {
  age?: number
  sex?: string
  name?: string
  dateOfBirth?: string
}

export interface PersonaProfileHistoryResponse {
  questionPattern: string
  response: string
}

export interface PersonaProfile {
  /** Persona fixture id, e.g. "acute-stroke". */
  id: string
  demographics: PersonaProfileDemographics
  /** Pre-scripted example Q&A pairs — reference phrasing, not a verbatim script (the live historian may ask things in a different order or different words). */
  historyResponses: PersonaProfileHistoryResponse[]
  /** Physician-authored ground-truth clinical facts (onset, location, PMH, FH, social history, ...) the patient agent must stay consistent with for ANY question asked. */
  structuredHistory: Record<string, string>
  /** From intakeData.chief_complaint — used to prime the historian's referral-reason context, not the patient agent's own knowledge. */
  chiefComplaint: string
}

export function loadPersonaProfile(personaFile: string): PersonaProfile {
  const persona = readPersonaJson(personaFile)
  const id = (personaFile.endsWith('.json') ? personaFile.slice(0, -'.json'.length) : personaFile)
  const demo = persona.demographics ?? {}
  return {
    id: persona.id?.trim() || id,
    demographics: {
      ...(typeof demo.age === 'number' ? { age: demo.age } : {}),
      ...(demo.sex ? { sex: demo.sex } : {}),
      ...(demo.name ? { name: demo.name } : {}),
      ...(demo.date_of_birth ? { dateOfBirth: demo.date_of_birth } : {}),
    },
    historyResponses: (persona.historyResponses ?? []).map((qa) => ({
      questionPattern: qa.question_pattern,
      response: qa.response,
    })),
    structuredHistory: persona.structuredHistory ?? {},
    chiefComplaint: persona.intakeData?.chief_complaint?.trim() ?? '',
  }
}
