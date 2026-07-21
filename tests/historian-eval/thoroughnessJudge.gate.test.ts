/**
 * Live gates for the thoroughness judge.
 *
 * Hits REAL Bedrock — only runs when HISTORIAN_EVAL_LIVE is set, e.g.:
 *
 *   HISTORIAN_EVAL_LIVE=1 AWS_PROFILE=sevaro-sandbox npx vitest run \
 *     tests/historian-eval/thoroughnessJudge.gate.test.ts
 *
 * Two gates (task brief Step 5), neither of which tunes prompts to pass —
 * both report the actual numbers regardless of outcome:
 *
 *   1. Stability: the migraine-chronic persona transcript judged 3x should
 *      have a max-min `overall` spread <= 10.
 *   2. Discriminant: the acute-stroke persona transcript, with its
 *      LKW/anticoagulant/red-flag critical Q&A pairs stripped, should
 *      score >= 15 points below the intact transcript's `overall`.
 */
import { describe, it, expect } from 'vitest'

import { generateThoroughnessEvaluation } from '@/lib/historian/eval/thoroughnessJudge'
import { buildPersonaTranscript } from './fixtures/personaTranscripts'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

const LIVE_GATE_TIMEOUT_MS = 60_000
const STABILITY_RUNS = 3
const STABILITY_MAX_SPREAD = 10
const DISCRIMINANT_MIN_DELTA = 15

// ── Discriminant gate fixture: deterministically strip the acute-stroke
//    persona's critical Q&A pairs by keyword, matched against the rubric's
//    3 severity:"critical" items for acute-stroke
//    (qa/historian-eval/rubric/syndromes/acute-stroke.json: onset-time,
//    anticoagulant-use, thrombolysis-contraindications). Documented mapping
//    from keyword -> which real historyResponses pair it strips, verified
//    against tests/simulated-patients/personas/acute-stroke.json:
//      "when exactly did this start"              -> onset-time / LKW
//      "have you ever had symptoms like this before" -> prior stroke/TIA
//        history, the closest available proxy for thrombolysis-
//        contraindication screening in this fixture (no dedicated
//        surgery/bleeding-history question exists in the persona)
//      "tell me about your medical history"        -> anticoagulant
//        (warfarin) use + INR, i.e. anticoagulant-use AND a second
//        thrombolysis-contraindication signal ──────────────────────────────
const STRIP_KEYWORDS: string[] = [
  'when exactly did this start',
  'have you ever had symptoms like this before',
  'tell me about your medical history',
]

function buildDegradedStrokeTranscript(): {
  transcript: HistorianTranscriptEntry[]
  strippedPairs: string[]
} {
  const { transcript } = buildPersonaTranscript('acute-stroke.json')
  const kept: HistorianTranscriptEntry[] = []
  const strippedPairs: string[] = []

  for (let i = 0; i < transcript.length; i += 2) {
    const question = transcript[i]
    const answer: HistorianTranscriptEntry | undefined = transcript[i + 1]
    const matchedKeyword = STRIP_KEYWORDS.find((kw) => question.text.toLowerCase().includes(kw))
    if (matchedKeyword) {
      strippedPairs.push(`Q: "${question.text}" (stripped — matched keyword "${matchedKeyword}")`)
      continue
    }
    kept.push(question)
    if (answer) kept.push(answer)
  }

  // Re-sequence seq/timestamp so the degraded transcript stays internally
  // monotonic (not required by the judge, but keeps the fixture a
  // plausible transcript rather than one with numbering gaps).
  return {
    transcript: kept.map((e, i) => ({ ...e, seq: i + 1, timestamp: i * 10 })),
    strippedPairs,
  }
}

describe('Thoroughness judge — live gates (HISTORIAN_EVAL_LIVE)', () => {
  it.skipIf(!process.env.HISTORIAN_EVAL_LIVE)(
    `Stability: migraine-chronic judged ${STABILITY_RUNS}x has max-min overall <= ${STABILITY_MAX_SPREAD}`,
    async () => {
      const { transcript, chiefComplaint } = buildPersonaTranscript('migraine-chronic.json')
      const scores: number[] = []

      for (let i = 0; i < STABILITY_RUNS; i++) {
        const result = await generateThoroughnessEvaluation(transcript, {
          chiefComplaint,
          syndrome: 'migraine-chronic',
        })
        scores.push(result.overall)
        console.log(`[gate:stability] run ${i + 1}/${STABILITY_RUNS} overall=${result.overall}`)
      }

      const spread = Math.max(...scores) - Math.min(...scores)
      console.log(`[gate:stability] scores=[${scores.join(', ')}] spread=${spread}`)

      expect(scores).toHaveLength(STABILITY_RUNS)
      expect(
        spread,
        `stability spread was ${spread} (scores: [${scores.join(', ')}]) — need <= ${STABILITY_MAX_SPREAD}`,
      ).toBeLessThanOrEqual(STABILITY_MAX_SPREAD)
    },
    LIVE_GATE_TIMEOUT_MS * STABILITY_RUNS,
  )

  it.skipIf(!process.env.HISTORIAN_EVAL_LIVE)(
    `Discriminant: degraded acute-stroke (critical Q&A stripped) scores >= ${DISCRIMINANT_MIN_DELTA} below intact`,
    async () => {
      const { transcript: intactTranscript, chiefComplaint } = buildPersonaTranscript('acute-stroke.json')
      const { transcript: degradedTranscript, strippedPairs } = buildDegradedStrokeTranscript()

      console.log(`[gate:discriminant] stripped ${strippedPairs.length} pair(s):`)
      for (const p of strippedPairs) console.log(`[gate:discriminant]   ${p}`)

      const intact = await generateThoroughnessEvaluation(intactTranscript, {
        chiefComplaint,
        syndrome: 'acute-stroke',
      })
      const degraded = await generateThoroughnessEvaluation(degradedTranscript, {
        chiefComplaint,
        syndrome: 'acute-stroke',
      })

      const delta = intact.overall - degraded.overall
      console.log(
        `[gate:discriminant] intact.overall=${intact.overall} degraded.overall=${degraded.overall} delta=${delta}`,
      )
      console.log(
        `[gate:discriminant] intact.missed_critical_questions=${intact.missed_critical_questions.length} degraded.missed_critical_questions=${degraded.missed_critical_questions.length}`,
      )

      expect(
        delta,
        `discriminant delta was ${delta} (intact=${intact.overall}, degraded=${degraded.overall}) — need >= ${DISCRIMINANT_MIN_DELTA}`,
      ).toBeGreaterThanOrEqual(DISCRIMINANT_MIN_DELTA)
    },
    LIVE_GATE_TIMEOUT_MS * 2,
  )
})
