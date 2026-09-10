/**
 * Shared loader for the LIVE on-demand review (see /api/ai/historian/review/*).
 *
 * Pulls one real historian_sessions row + its joined Localizer differential and
 * shapes it into the inputs the sim generators already accept
 * (generateSimPhysicianSummary / generateSimThoroughness) so the live dashboard
 * reuses the exact same generation + rendering the AI-to-AI simulator uses.
 *
 * Read-only. Operates on a real session id (PHI). Callers gate on Cognito.
 */

import type { HistorianTranscriptEntry } from '@/lib/historianTypes'
import type { SimDifferential } from '@/lib/historian/sim/simDifferential'

interface Pool {
  query: (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, any>> }>
}

export interface SessionReviewInput {
  transcript: HistorianTranscriptEntry[]
  chiefComplaint?: string
  /** Best-available differential (post-interview eval preferred, else Localizer), sim-shaped. */
  differential: SimDifferential | null
}

function coerceJson<T>(v: unknown): T | null {
  if (v == null) return null
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T
    } catch {
      return null
    }
  }
  return v as T
}

/** Map a stored {role,text}[] transcript into the entry shape the generators expect. */
function toEntries(raw: unknown): HistorianTranscriptEntry[] {
  const arr = Array.isArray(raw) ? raw : []
  return arr
    .filter((t: any) => t && (t.role === 'assistant' || t.role === 'user') && typeof t.text === 'string')
    .map((t: any, i: number) => ({ role: t.role, text: t.text, timestamp: i, seq: i + 1 }))
}

/**
 * Build a SimDifferential-shaped object from whatever differential the real
 * session has. Prefers the post-interview `final_differential` (carries
 * evidence_against + exclusion reasoning); falls back to the live Localizer
 * columns. Returns null when neither exists (physician summary still runs — it
 * just has no differential to reason from).
 */
function shapeDifferential(row: Record<string, any>): SimDifferential | null {
  const final = coerceJson<any>(row.final_differential)
  if (final && final.status === 'ok' && Array.isArray(final.differential) && final.differential.length > 0) {
    return {
      differential: final.differential.map((d: any) => ({
        diagnosis: d.diagnosis,
        icd10: d.icd10 ?? null,
        rationale: d.rationale ?? '',
        evidence_against: d.evidence_against ?? '',
      })),
      excluded: Array.isArray(final.excluded)
        ? final.excluded.map((e: any) => ({ diagnosis: e.diagnosis, reason: e.exclusion_reason ?? e.reason ?? '' }))
        : [],
      summary: final.summary ?? '',
    } as unknown as SimDifferential
  }

  const loc = coerceJson<any[]>(row.localizer_differential)
  if (Array.isArray(loc) && loc.length > 0) {
    const excl = coerceJson<any[]>(row.localizer_excluded) ?? []
    return {
      differential: loc.map((d: any) => ({
        diagnosis: d.diagnosis ?? d.name,
        icd10: d.icd10 ?? null,
        rationale: d.rationale ?? '',
        evidence_against: d.evidence_against ?? '',
      })),
      excluded: Array.isArray(excl) ? excl.map((e: any) => ({ diagnosis: e.diagnosis, reason: e.reason ?? '' })) : [],
      summary: '',
    } as unknown as SimDifferential
  }

  return null
}

export async function loadSessionForReview(pool: Pool, sessionId: string): Promise<SessionReviewInput | null> {
  const sql = `
    SELECT hs."transcript", hs."structured_output", hs."final_differential",
           nc."localizer_differential", nc."localizer_excluded"
    FROM "historian_sessions" hs
    LEFT JOIN "neurology_consults" nc ON nc."historian_session_id" = hs."id"
    WHERE hs."id" = $1
    LIMIT 1
  `
  const { rows } = await pool.query(sql, [sessionId])
  if (!rows || rows.length === 0) return null
  const row = rows[0]

  const structured = coerceJson<Record<string, any>>(row.structured_output)
  const chiefComplaint =
    typeof structured?.chief_complaint === 'string' && structured.chief_complaint.trim()
      ? structured.chief_complaint.trim()
      : undefined

  return {
    transcript: toEntries(row.transcript),
    chiefComplaint,
    differential: shapeDifferential(row),
  }
}
