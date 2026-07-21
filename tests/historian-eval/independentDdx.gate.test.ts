/**
 * Live gate for the independent DeepSeek-R1 differential + cross-family
 * agreement metrics (Historian Validation Suite Task 4).
 *
 * Hits REAL Bedrock (Sonnet for the pipeline differential, DeepSeek-R1 for
 * the independent differential, Haiku for adjudication) and the real
 * neuro_plans DB (non-fatally if unreachable, same as finalDifferential's
 * own gate) — only runs when HISTORIAN_EVAL_LIVE is set, e.g.:
 *
 *   HISTORIAN_EVAL_LIVE=1 AWS_PROFILE=sevaro-sandbox npx vitest run \
 *     tests/historian-eval/independentDdx.gate.test.ts
 *
 * For each of the 5 simulated-patient personas, this test:
 *   1. Generates a FRESH pipeline differential (Task 2, Sonnet) and a
 *      BLIND independent differential (Task 4, DeepSeek-R1 — transcript +
 *      chief complaint only, exactly per generateIndependentDdx's
 *      signature; never given the pipeline's own output).
 *   2. Computes agreement between the two (ICD-10-first, Haiku-adjudicated
 *      fallback).
 *   3. Scores BOTH differentials against the persona's ground-truth
 *      expectedDDx.
 *
 * Ground-truth candidate policy (shared with finalDifferential.gate.test.ts
 * — see that file's highLikelihoodOrAll, and agreement.ts's own module
 * doc): every expectedDDx entry marked likelihood "high", or every entry if
 * none is marked "high" (defensive fallback; every current persona fixture
 * does mark at least one "high"). Duplicated here as a small pure helper
 * rather than imported, since finalDifferential.gate.test.ts doesn't export
 * it — same one-line policy, kept in sync by convention across both gates.
 *
 * NO THRESHOLD in this task — this is a recorded baseline only. If
 * DeepSeek-R1 fails persistently on a persona (its own one internal retry,
 * inside generateIndependentDdx, already exhausted), that persona's failure
 * is recorded honestly in the printed table rather than failing the whole
 * suite — per the task brief, a persistent live-model failure is a finding
 * to report, not a bug to hide.
 */
import { describe, it, expect } from 'vitest'

import { listPersonaFiles, buildPersonaTranscript, type PersonaExpectedDx } from './fixtures/personaTranscripts'
import { generateFinalDifferential } from '@/lib/historian/eval/finalDifferential'
import { generateIndependentDdx, adjudicateEquivalence } from '@/lib/historian/eval/independentDdx'
import { computeAgreement, scoreAgainstGroundTruth } from '@/lib/historian/eval/agreement'

const LIVE_GATE_TIMEOUT_MS = 120_000
const TOP_N = 3

/** Shared ground-truth candidate policy — see module doc. */
function highLikelihoodOrAll(expectedDDx: PersonaExpectedDx[]): PersonaExpectedDx[] {
  const high = expectedDDx.filter((d) => d.likelihood === 'high')
  return high.length > 0 ? high : expectedDDx
}

interface GateRow {
  persona: string
  pipelineTop3: string[]
  r1Ok: boolean
  r1Top3: string[]
  r1StopReason: string | null
  r1Error: string | null
  agreementTop1Match: boolean | null
  agreementTop3Overlap: number | null
  agreementJaccardTop3: number | null
  viaIcd10: number | null
  viaAdjudicated: number | null
  pipelineGroundTruth: { top1Hit: boolean; top3Hit: boolean } | null
  independentGroundTruth: { top1Hit: boolean; top3Hit: boolean } | null
}

describe('Independent DDx + agreement — live gate (HISTORIAN_EVAL_LIVE)', () => {
  const personaFiles = listPersonaFiles()
  const results: GateRow[] = []

  for (const file of personaFiles) {
    it.skipIf(!process.env.HISTORIAN_EVAL_LIVE)(
      `${file}: independent R1 differential + agreement + ground-truth scoring`,
      async () => {
        const { transcript, chiefComplaint, expectedDDx } = buildPersonaTranscript(file)
        expect(expectedDDx.length, `${file} fixture has no expectedDDx entries`).toBeGreaterThan(0)
        const candidates = highLikelihoodOrAll(expectedDDx)
        const expectedStrings = candidates.map((c) => c.diagnosis)

        // Generate a FRESH pipeline differential (Task 2) live — the gate
        // records agreement against a real, freshly-generated run, not a
        // stale fixture.
        const pipeline = await generateFinalDifferential(transcript, chiefComplaint)
        const pipelineTop3 = pipeline.differential.slice(0, TOP_N).map((d) => d.diagnosis)
        const pipelineGroundTruth = await scoreAgainstGroundTruth(
          pipeline.differential,
          expectedStrings,
          adjudicateEquivalence,
        )

        const row: GateRow = {
          persona: file,
          pipelineTop3,
          r1Ok: false,
          r1Top3: [],
          r1StopReason: null,
          r1Error: null,
          agreementTop1Match: null,
          agreementTop3Overlap: null,
          agreementJaccardTop3: null,
          viaIcd10: null,
          viaAdjudicated: null,
          pipelineGroundTruth,
          independentGroundTruth: null,
        }

        try {
          // BLIND — transcript + chief complaint only. Must never receive
          // `pipeline` (Task 2's own output) or anything derived from it.
          const independent = await generateIndependentDdx(transcript, chiefComplaint)
          row.r1Ok = true
          row.r1Top3 = independent.differential.slice(0, TOP_N).map((d) => d.diagnosis)
          row.r1StopReason = independent.stop_reason

          const agreement = await computeAgreement(pipeline.differential, independent.differential, adjudicateEquivalence)
          row.agreementTop1Match = agreement.top1Match
          row.agreementTop3Overlap = agreement.top3Overlap
          row.agreementJaccardTop3 = agreement.jaccardTop3
          row.viaIcd10 = agreement.matchedPairs.filter((p) => p.via === 'icd10').length
          row.viaAdjudicated = agreement.matchedPairs.filter((p) => p.via === 'adjudicated').length

          row.independentGroundTruth = await scoreAgainstGroundTruth(
            independent.differential,
            expectedStrings,
            adjudicateEquivalence,
          )
        } catch (err) {
          // Persistent R1 failure (its own one internal retry already
          // exhausted) — record honestly, do not fail the suite.
          row.r1Error = err instanceof Error ? err.message : String(err)
        }

        results.push(row)

        console.log(
          `[gate] ${file}:\n` +
            `  pipeline top-3: [${pipelineTop3.join(' | ')}] — top1Hit=${pipelineGroundTruth.top1Hit} top3Hit=${pipelineGroundTruth.top3Hit}\n` +
            (row.r1Ok
              ? `  R1 top-3: [${row.r1Top3.join(' | ')}] (stop_reason=${row.r1StopReason}) — top1Hit=${row.independentGroundTruth?.top1Hit} top3Hit=${row.independentGroundTruth?.top3Hit}\n` +
                `  agreement: top1Match=${row.agreementTop1Match} top3Overlap=${row.agreementTop3Overlap}/3 jaccard=${row.agreementJaccardTop3?.toFixed(2)} (via icd10=${row.viaIcd10}, adjudicated=${row.viaAdjudicated})`
              : `  R1 FAILED after internal retry: ${row.r1Error}`),
        )
      },
      LIVE_GATE_TIMEOUT_MS,
    )
  }

  it.skipIf(!process.env.HISTORIAN_EVAL_LIVE)(
    'prints the full baseline metrics table (no threshold — recorded baseline only)',
    () => {
      expect(
        results.length,
        'Not every per-persona gate test populated a result — check for a thrown error above.',
      ).toBe(personaFiles.length)

      const r1Successes = results.filter((r) => r.r1Ok).length
      const pipelineTop1Hits = results.filter((r) => r.pipelineGroundTruth?.top1Hit).length
      const pipelineTop3Hits = results.filter((r) => r.pipelineGroundTruth?.top3Hit).length
      const independentTop1Hits = results.filter((r) => r.independentGroundTruth?.top1Hit).length
      const independentTop3Hits = results.filter((r) => r.independentGroundTruth?.top3Hit).length
      const top1MatchCount = results.filter((r) => r.agreementTop1Match).length

      const header =
        'persona'.padEnd(24) +
        'R1'.padEnd(6) +
        'top1Match'.padEnd(11) +
        'top3Overlap'.padEnd(13) +
        'jaccard'.padEnd(9) +
        'icd10/adj'.padEnd(11) +
        'pipeGT(1/3)'.padEnd(13) +
        'r1GT(1/3)'.padEnd(11)

      const lines = results.map((r) => {
        const r1Col = r.r1Ok ? 'ok' : 'FAILED'
        const top1MatchCol = r.r1Ok ? String(r.agreementTop1Match) : '-'
        const overlapCol = r.r1Ok ? `${r.agreementTop3Overlap}/3` : '-'
        const jaccardCol = r.r1Ok ? (r.agreementJaccardTop3 ?? 0).toFixed(2) : '-'
        const viaCol = r.r1Ok ? `${r.viaIcd10}/${r.viaAdjudicated}` : '-'
        const pipeGtCol = `${r.pipelineGroundTruth?.top1Hit ?? '-'}/${r.pipelineGroundTruth?.top3Hit ?? '-'}`
        const r1GtCol = r.r1Ok ? `${r.independentGroundTruth?.top1Hit}/${r.independentGroundTruth?.top3Hit}` : '-'
        return (
          r.persona.padEnd(24) +
          r1Col.padEnd(6) +
          top1MatchCol.padEnd(11) +
          overlapCol.padEnd(13) +
          jaccardCol.padEnd(9) +
          viaCol.padEnd(11) +
          pipeGtCol.padEnd(13) +
          r1GtCol.padEnd(11)
        )
      })

      console.log(
        `\n[gate] BASELINE METRICS TABLE (no threshold — recorded baseline only)\n` +
          `${header}\n${'-'.repeat(header.length)}\n${lines.join('\n')}\n` +
          `\n[gate] SUMMARY: R1 succeeded ${r1Successes}/${results.length} personas | ` +
          `top1Match ${top1MatchCount}/${r1Successes || 0} of successful R1 runs | ` +
          `pipeline ground-truth top1=${pipelineTop1Hits}/${results.length} top3=${pipelineTop3Hits}/${results.length} | ` +
          `R1 ground-truth top1=${independentTop1Hits}/${r1Successes || 0} top3=${independentTop3Hits}/${r1Successes || 0}`,
      )

      // No threshold — this gate records a baseline. The only assertion is
      // structural: every persona produced a row (checked above) and the
      // pipeline half of the table (Task 2, already gated elsewhere) never
      // silently no-ops.
      expect(results.every((r) => r.pipelineGroundTruth !== null)).toBe(true)
    },
  )
})
