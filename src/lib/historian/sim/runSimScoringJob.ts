/**
 * Consolidated background scoring for one simulator run (async 202+poll path).
 *
 * Runs the WHOLE scoring pipeline that the live sim used to split across four
 * client requests — differential (Sonnet) + physician summary (Sonnet) +
 * thoroughness (lean Haiku, inside scoreAndPersistSimRun) + ground-truth +
 * persist to historian_sim_runs — as a single background job. Because it runs
 * after the 202 is returned (see /api/ai/historian/sim/score/start), it is NOT
 * bound by the ~30s gateway, only by the route's maxDuration.
 *
 * Never throws: it records terminal state on historian_sim_score_jobs
 * (migration 066) so the polling client always sees 'complete' or 'error'
 * rather than waiting out a silent death. Synthetic data only.
 */

import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

interface Pool {
  query: (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, any>> }>
}

export async function runSimScoringJob(opts: {
  pool: Pool
  jobId: string
  persona: string
  transcript: HistorianTranscriptEntry[]
  batchId: string
  batchLabel: string | null
}): Promise<void> {
  const { pool, jobId, persona, transcript, batchId, batchLabel } = opts
  try {
    // Chief complaint from the persona fixture (best-effort; scoring works
    // without it). The generators only use it as a light steer.
    let chiefComplaint: string | undefined
    try {
      const { buildPersonaTranscript } = await import('@/lib/historian/eval/personaFixtures')
      chiefComplaint = buildPersonaTranscript(persona).chiefComplaint || undefined
    } catch {
      chiefComplaint = undefined
    }

    const { generateSimDifferential } = await import('@/lib/historian/sim/simDifferential')
    const differential = await generateSimDifferential(transcript, chiefComplaint)

    const { generateSimPhysicianSummary } = await import('@/lib/historian/sim/simPhysicianSummary')
    const physicianSummary = await generateSimPhysicianSummary(transcript, differential, chiefComplaint)

    // scoreAndPersistSimRun generates the (lean) thoroughness itself, runs
    // ground-truth scoring, and writes the historian_sim_runs row.
    const { scoreAndPersistSimRun } = await import('@/lib/historian/sim/scoreSimTranscript')
    const result = await scoreAndPersistSimRun({
      pool,
      persona,
      transcript,
      differential,
      physicianSummary,
      batchId,
      batchLabel,
    })

    await pool.query(
      `UPDATE historian_sim_score_jobs
       SET status = 'complete', top1_hit = $2, top3_hit = $3, updated_at = now()
       WHERE id = $1`,
      [jobId, result.top1Hit, result.top3Hit],
    )
  } catch (err: any) {
    console.error('[sim/score] background job failed:', jobId, err?.message || err)
    try {
      await pool.query(
        `UPDATE historian_sim_score_jobs
         SET status = 'error', error = $2, updated_at = now()
         WHERE id = $1`,
        [jobId, String(err?.message || err).slice(0, 500)],
      )
    } catch (updateErr) {
      console.error('[sim/score] could not record job error:', jobId, updateErr)
    }
  }
}
