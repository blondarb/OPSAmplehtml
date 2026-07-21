/**
 * Converts tests/simulated-patients/personas/*.json fixtures into
 * HistorianTranscriptEntry[] transcripts for the final-differential
 * evaluator pipeline (finalDifferential.gate.test.ts) and its deterministic
 * unit tests.
 *
 * The persona files were built for the (HTTP, live-server) simulated-patient
 * E2E runner (tests/simulated-patients/runner.test.ts) and store their Q&A
 * as `historyResponses: {question_pattern, response}[]` rather than a
 * HistorianTranscriptEntry[] transcript — this module is the one place that
 * bridges the two shapes so the evaluator can be exercised without a live
 * dev server / live voice interview.
 */
import * as fs from 'fs'
import * as path from 'path'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

const PERSONAS_DIR = path.join(__dirname, '..', '..', 'simulated-patients', 'personas')

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

interface PersonaJSON {
  id?: string
  intakeData?: { chief_complaint?: string }
  historyResponses?: PersonaHistoryResponseJSON[]
  expectedDDx?: PersonaExpectedDDxJSON[]
}

export interface PersonaTranscriptFixture {
  transcript: HistorianTranscriptEntry[]
  chiefComplaint: string
  expectedDDx: string[]
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
  const fullPath = resolvePersonaPath(personaFile)
  let raw: string
  try {
    raw = fs.readFileSync(fullPath, 'utf-8')
  } catch (err) {
    throw new Error(
      `[personaTranscripts] Could not read persona fixture "${personaFile}" (resolved to ${fullPath}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }

  const persona = JSON.parse(raw) as PersonaJSON
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
  const expectedDDx = (persona.expectedDDx ?? [])
    .map((d) => d.diagnosis)
    .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)

  return { transcript, chiefComplaint, expectedDDx }
}
