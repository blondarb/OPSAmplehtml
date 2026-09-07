/**
 * Shared scoring for a simulator transcript — used by BOTH:
 *   - /sim/run           (scripted: fixture transcript, generates the differential here)
 *   - /sim/score/finalize (live: differential already computed in stage 1, passed in)
 *
 * Runs the LEAN sim differential (if not provided) + thoroughness +
 * ground-truth scoring, then persists one historian_sim_runs row. Uses the
 * lean differential (simDifferential.ts) so scripted runs no longer 504 on the
 * heavy production grader. Cross-model (R1 + agreement) is intentionally
 * omitted from on-demand/live runs.
 *
 * Synthetic only. Incurs Bedrock cost.
 */

import type { HistorianTranscriptEntry } from '@/lib/historianTypes'
import type { SimDifferential, SimPhysicianSummary } from '@/lib/historian/sim/simDifferential'

interface Pool {
  query: (sql: string, params: unknown[]) => Promise<unknown>
}

export interface ScoreSimResult {
  ok: boolean
  top1Hit: boolean | null
  top3Hit: boolean | null
}

export async function scoreAndPersistSimRun(opts: {
  pool: Pool
  persona: string
  transcript: HistorianTranscriptEntry[]
  /** Live path passes the stage-1 differential; scripted leaves it undefined so we generate it. */
  differential?: SimDifferential | null
  /** In-depth physician summary (live path computes it in its own stage); merged onto the stored differential. */
  physicianSummary?: SimPhysicianSummary | null
  /** Precomputed thoroughness (live path runs it in its own stage to fit the gateway). Scripted leaves it undefined so we generate it here. */
  thoroughness?: { result: unknown; modelId: string | null; costUsd: number | null } | null
  batchId: string
  batchLabel: string | null
}): Promise<ScoreSimResult> {
  const { pool, persona, transcript, batchId, batchLabel } = opts

  const { buildPersonaTranscript } = await import('@/lib/historian/eval/personaFixtures')
  const fixture = buildPersonaTranscript(persona)
  const chiefComplaint = fixture.chiefComplaint || undefined
  const expectedDDx = fixture.expectedDDx

  // Differential (generate if not supplied).
  let differential = opts.differential ?? null
  if (!differential) {
    const { generateSimDifferential } = await import('@/lib/historian/sim/simDifferential')
    differential = await generateSimDifferential(transcript, chiefComplaint)
  }
  // Merge the (separately-generated) physician summary onto the differential
  // object so it persists + renders under final_differential.physician_summary.
  if (differential && opts.physicianSummary) {
    differential = { ...differential, physician_summary: opts.physicianSummary }
  }

  // Thoroughness — use the precomputed value (live path's own stage) if given;
  // otherwise generate it here (scripted path, short fixture transcripts).
  let thoroughnessResult: unknown = opts.thoroughness?.result ?? null
  let thoroughnessModel: string | null = opts.thoroughness?.modelId ?? null
  let thoroughnessCost: number | null = opts.thoroughness?.costUsd ?? null
  if (!thoroughnessResult) {
    // Lean Haiku thoroughness (fast) so the scripted single-request path also
    // stays under the gateway. Non-fatal.
    try {
      const { generateSimThoroughness } = await import('@/lib/historian/sim/simThoroughness')
      const { result, modelId, costUsd } = await generateSimThoroughness(transcript, chiefComplaint)
      thoroughnessResult = result
      thoroughnessModel = modelId
      thoroughnessCost = costUsd
    } catch (err) {
      console.error('[scoreSimTranscript] thoroughness failed (non-fatal):', err)
    }
  }

  // Ground-truth scoring (non-fatal).
  const high = expectedDDx.filter((d) => d?.likelihood === 'high')
  const expectedCandidates = (high.length > 0 ? high : expectedDDx).map((d) => d.diagnosis)
  let pipeline: any = null
  if (differential?.differential?.length && expectedCandidates.length > 0) {
    try {
      const { scoreAgainstGroundTruth } = await import('@/lib/historian/eval/agreement')
      const { adjudicateEquivalence } = await import('@/lib/historian/eval/independentDdx')
      pipeline = await scoreAgainstGroundTruth(differential.differential, expectedCandidates, adjudicateEquivalence)
    } catch (err) {
      console.error('[scoreSimTranscript] ground-truth scoring failed (non-fatal):', err)
    }
  }
  const groundTruth = { expectedCandidates, pipeline, independent: null }

  const outcome = {
    caseId: persona,
    source: 'fixture' as const,
    syndrome: persona,
    chiefComplaint: chiefComplaint ?? null,
    turnCount: transcript.length,
    insufficientTranscript: false,
    finalDifferential: {
      result: differential,
      costUsd: null,
      modelId: differential?.provenance?.model_id ?? null,
    },
    thoroughness: { result: thoroughnessResult, costUsd: thoroughnessCost, modelId: thoroughnessModel },
    independentDdx: { result: null },
    agreement: { result: null },
    groundTruth,
  }

  const { persistSimCase } = await import('@/lib/historian/eval/persistSimRun')
  await persistSimCase(pool, batchId, batchLabel, outcome as any, transcript)

  return {
    ok: Boolean(differential?.differential?.length),
    top1Hit: pipeline?.top1Hit ?? null,
    top3Hit: pipeline?.top3Hit ?? null,
  }
}
