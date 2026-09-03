/**
 * Shared persistence for a single simulator case → historian_sim_runs
 * (migration 059). Used by both:
 *   - POST /api/ai/historian/sim/run    (on-demand run of one persona)
 *   - POST /api/ai/historian/sim/import (ingest a batch report)
 *
 * Takes an already-computed eval case outcome (the HistorianEvalCaseOutcome
 * shape from the batch harness) plus a batch id, enriches it with the
 * persona's synthetic transcript + lay belief + personality (best-effort, no
 * PHI — role-played personas), and inserts one row.
 *
 * Never persists anything for --sessions (real-patient) cases here — this
 * table is synthetic-only.
 */

import { getPersonality } from '@/lib/historian/synthetic/personalities'

export interface SimRunResultLike {
  result?: unknown
  costUsd?: number | null
  modelId?: string | null
}

export interface SimCaseLike {
  caseId: string
  source?: 'fixture' | 'session'
  syndrome?: string | null
  chiefComplaint?: string | null
  turnCount?: number
  insufficientTranscript?: boolean
  finalDifferential?: SimRunResultLike
  thoroughness?: SimRunResultLike
  independentDdx?: SimRunResultLike
  agreement?: SimRunResultLike
  groundTruth?: unknown
}

function sumCost(...runs: (SimRunResultLike | undefined)[]): number {
  return runs.reduce((s, r) => s + (typeof r?.costUsd === 'number' ? r.costUsd : 0), 0)
}

/**
 * Insert one sim case row. `pool` is a node-postgres pool (from getPool()).
 * Throws on a real DB error (caller decides how to handle 42P01 etc.).
 */
export async function persistSimCase(
  pool: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  batchId: string,
  batchLabel: string | null,
  c: SimCaseLike,
): Promise<void> {
  const personaId = c.caseId.replace(/\.json$/, '')

  // Best-effort persona enrichment — depends on the fixture files being
  // present at runtime. Never fatal.
  let transcript: unknown = null
  let patientBelief: unknown = null
  let personality: unknown = null
  if (c.source !== 'session') {
    try {
      const mod = await import('@/lib/historian/eval/personaFixtures')
      try {
        transcript = mod.buildPersonaTranscript(c.caseId).transcript
      } catch {
        transcript = null
      }
      try {
        const profile = mod.loadPersonaProfile(c.caseId)
        if (profile.patientBelief) patientBelief = profile.patientBelief
        const p = getPersonality(profile.personality)
        if (p) personality = { id: p.id, label: p.label, description: p.description }
      } catch {
        /* leave belief/personality null */
      }
    } catch {
      /* fixtures module unavailable — leave all null */
    }
  }

  const models = {
    final: c.finalDifferential?.modelId ?? null,
    thoroughness: c.thoroughness?.modelId ?? null,
    independent: c.independentDdx?.modelId ?? null,
    agreement: c.agreement?.modelId ?? null,
  }
  const costUsd = sumCost(c.finalDifferential, c.thoroughness, c.independentDdx, c.agreement)

  await pool.query(
    `INSERT INTO historian_sim_runs
      (batch_id, batch_label, persona_id, persona_label, syndrome, chief_complaint,
       turn_count, transcript, final_differential, independent_ddx, agreement,
       thoroughness, ground_truth, patient_belief, personality, cost_usd, models, insufficient)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      batchId,
      batchLabel,
      personaId,
      null,
      c.syndrome ?? null,
      c.chiefComplaint ?? null,
      c.turnCount ?? 0,
      transcript != null ? JSON.stringify(transcript) : null,
      c.finalDifferential?.result != null ? JSON.stringify(c.finalDifferential.result) : null,
      c.independentDdx?.result != null ? JSON.stringify(c.independentDdx.result) : null,
      c.agreement?.result != null ? JSON.stringify(c.agreement.result) : null,
      c.thoroughness?.result != null ? JSON.stringify(c.thoroughness.result) : null,
      c.groundTruth != null ? JSON.stringify(c.groundTruth) : null,
      patientBelief != null ? JSON.stringify(patientBelief) : null,
      personality != null ? JSON.stringify(personality) : null,
      costUsd || null,
      JSON.stringify(models),
      c.insufficientTranscript === true,
    ],
  )
}
