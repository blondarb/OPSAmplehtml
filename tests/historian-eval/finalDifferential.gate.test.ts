/**
 * Live gate for the final full-transcript differential pass.
 *
 * Hits REAL Bedrock (and the real neuro_plans DB, non-fatally if
 * unreachable) — only runs when HISTORIAN_EVAL_LIVE is set, e.g.:
 *
 *   HISTORIAN_EVAL_LIVE=1 AWS_PROFILE=sevaro-sandbox npx vitest run \
 *     tests/historian-eval/finalDifferential.gate.test.ts
 *
 * Actual policy (corrected 2026-07-20 — see task-2-report.md fix-report
 * section for what the previous version got wrong):
 *
 *   For each of the 5 simulated-patient personas: build a synthetic
 *   transcript, run generateFinalDifferential, then HIT if ANY
 *   high-likelihood ground-truth entry from that persona's expectedDDx
 *   (falling back to ALL entries if none are marked "high" — two of the
 *   five personas have multiple tied-high entries, e.g. first-seizure.json
 *   lists both "Epilepsy (new onset)" and "Provoked seizure" as high) is a
 *   normalized TOKEN-SET match (see ./ddxMatch.ts — casefold, punctuation
 *   as a word boundary not a deletion, connector-stopword-tolerant,
 *   negation-safe) against ANY of the model's top-3 ranked diagnoses.
 *
 *   This is still an interim, no-LLM matcher — Task 4's ICD-10/adjudicated
 *   matching (normalizeIcd10 + a real independent scorer) supersedes it.
 *
 * Gate: >= 4/5 personas hit. This test does NOT tune prompts (or the
 * matcher) to pass — it reports the actual numbers either way.
 */
import { describe, it, expect } from 'vitest'

import { listPersonaFiles, buildPersonaTranscript, type PersonaExpectedDx } from './fixtures/personaTranscripts'
import { generateFinalDifferential } from '@/lib/historian/eval/finalDifferential'
import { tokenSetMatch } from './ddxMatch'

const LIVE_GATE_TIMEOUT_MS = 60_000
const TOP_N = 3
const PASS_THRESHOLD = 4

/**
 * The ground-truth candidates a HIT is judged against: every entry marked
 * "high" likelihood, or every entry at all if the fixture marks none
 * "high" (defensive fallback — every current persona does mark at least
 * one "high", but a future fixture shouldn't silently pass 0 candidates).
 */
function highLikelihoodOrAll(expectedDDx: PersonaExpectedDx[]): PersonaExpectedDx[] {
  const high = expectedDDx.filter((d) => d.likelihood === 'high')
  return high.length > 0 ? high : expectedDDx
}

interface GateResult {
  persona: string
  expectedCandidates: string[]
  top3: string[]
  hit: boolean
}

describe('Final differential — live gate (HISTORIAN_EVAL_LIVE)', () => {
  const personaFiles = listPersonaFiles()
  const results: GateResult[] = []

  for (const file of personaFiles) {
    it.skipIf(!process.env.HISTORIAN_EVAL_LIVE)(
      `${file}: a high-likelihood expected diagnosis appears in top-3`,
      async () => {
        const { transcript, chiefComplaint, expectedDDx } = buildPersonaTranscript(file)
        expect(expectedDDx.length, `${file} fixture has no expectedDDx entries`).toBeGreaterThan(0)
        const candidates = highLikelihoodOrAll(expectedDDx)

        const result = await generateFinalDifferential(transcript, chiefComplaint)
        const top3 = result.differential.slice(0, TOP_N).map((d) => d.diagnosis)
        const hit = candidates.some((c) => top3.some((dx) => tokenSetMatch(dx, c.diagnosis)))

        const expectedCandidates = candidates.map((c) => c.diagnosis)
        results.push({ persona: file, expectedCandidates, top3, hit })

        console.log(
          `[gate] ${file}: expected [${expectedCandidates.join(' | ')}] — top3 [${top3.join(' | ')}] — ${
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
