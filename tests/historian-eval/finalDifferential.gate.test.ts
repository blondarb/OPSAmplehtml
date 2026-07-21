/**
 * Live gate for the final full-transcript differential pass.
 *
 * Hits REAL Bedrock (and the real neuro_plans DB, non-fatally if
 * unreachable) — only runs when HISTORIAN_EVAL_LIVE is set, e.g.:
 *
 *   HISTORIAN_EVAL_LIVE=1 AWS_PROFILE=sevaro-sandbox npx vitest run \
 *     tests/historian-eval/finalDifferential.gate.test.ts
 *
 * For each of the 5 simulated-patient personas: build a synthetic
 * transcript, run generateFinalDifferential, and check whether that
 * persona's PRIMARY expected diagnosis (expectedDDx[0] — the highest-
 * likelihood entry in every persona fixture) appears in the model's
 * top-3 ranked differential, via a normalized casefold substring match
 * (ICD-10 category matching is a Task 4 concern — normalizeIcd10 doesn't
 * exist yet, so substring-only per the brief).
 *
 * Gate: >= 4/5 personas hit. This test does NOT tune prompts to pass —
 * it reports the actual numbers either way.
 */
import { describe, it, expect } from 'vitest'

import { listPersonaFiles, buildPersonaTranscript } from './fixtures/personaTranscripts'
import { generateFinalDifferential } from '@/lib/historian/eval/finalDifferential'

const LIVE_GATE_TIMEOUT_MS = 60_000
const TOP_N = 3
const PASS_THRESHOLD = 4

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
}

function casefoldSubstringMatch(a: string, b: string): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return false
  return na.includes(nb) || nb.includes(na)
}

interface GateResult {
  persona: string
  expected: string
  top3: string[]
  hit: boolean
}

describe('Final differential — live gate (HISTORIAN_EVAL_LIVE)', () => {
  const personaFiles = listPersonaFiles()
  const results: GateResult[] = []

  for (const file of personaFiles) {
    it.skipIf(!process.env.HISTORIAN_EVAL_LIVE)(
      `${file}: primary expected diagnosis appears in top-3`,
      async () => {
        const { transcript, chiefComplaint, expectedDDx } = buildPersonaTranscript(file)
        expect(expectedDDx.length, `${file} fixture has no expectedDDx entries`).toBeGreaterThan(0)
        const primaryExpected = expectedDDx[0]

        const result = await generateFinalDifferential(transcript, chiefComplaint)
        const top3 = result.differential.slice(0, TOP_N).map((d) => d.diagnosis)
        const hit = top3.some((dx) => casefoldSubstringMatch(dx, primaryExpected))

        results.push({ persona: file, expected: primaryExpected, top3, hit })

        console.log(
          `[gate] ${file}: expected "${primaryExpected}" — top3 [${top3.join(' | ')}] — ${
            hit ? 'HIT' : 'MISS'
          } — dropped_quotes=${result.dropped_quotes}`,
        )
      },
      LIVE_GATE_TIMEOUT_MS,
    )
  }

  it.skipIf(!process.env.HISTORIAN_EVAL_LIVE)(
    `overall pass rate is at least ${PASS_THRESHOLD}/${personaFiles.length}`,
    () => {
      // Relies on the per-persona `it`s above having already run and pushed
      // into `results` — vitest executes `it`s within one describe block
      // sequentially in declaration order by default (same pattern already
      // used by tests/simulated-patients/runner.test.ts's shared `let`s).
      expect(
        results.length,
        'Not every per-persona gate test populated a result — check for a thrown error above.',
      ).toBe(personaFiles.length)

      const hits = results.filter((r) => r.hit).length
      const detail = results.map((r) => `${r.persona}=${r.hit ? 'HIT' : 'MISS'}`).join(', ')
      console.log(`[gate] SUMMARY: ${hits}/${results.length} personas hit top-3. ${detail}`)

      expect(
        hits,
        `Gate result: ${hits}/${results.length} personas hit top-3 (need >= ${PASS_THRESHOLD}). ${detail}`,
      ).toBeGreaterThanOrEqual(PASS_THRESHOLD)
    },
  )
})
