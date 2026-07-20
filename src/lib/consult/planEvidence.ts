/**
 * Plan-grounded evidence retrieval for the AI Historian localizer.
 *
 * Replaces the (deleted-in-prod, org-policy-blocked-from-recreation) Bedrock
 * Knowledge Base lookup that used to ground the localizer's differential,
 * follow-up questions, and suggested actions. Instead, this queries the
 * neuro_plans PostgreSQL database (same RDS instance, ~487 vetted clinical
 * plans) for plans whose title/ICD-10/differential content matches the
 * patient's reported symptoms, and formats their evidence + differential
 * content into the same free-text "guideline context" shape the localizer's
 * Step 3 generator already expects.
 *
 * Read-only. Never invents content — if nothing matches, returns an empty
 * result and the caller falls back to "clinical judgment" (see route.ts).
 */

import type { Pool } from 'pg'

// ── Public types ──────────────────────────────────────────────────────────────

export interface RetrievePlanEvidenceOptions {
  /** Patient symptom terms to search for (e.g. primary symptoms + red flags). */
  symptomTerms: string[]
  /** Chief complaint, if available — folded into the search term set. */
  chiefComplaint?: string
  /** Max number of matched plans to pull evidence from. Defaults to 3. */
  maxPlans?: number
}

export interface PlanEvidenceResult {
  /** Concatenated, readable evidence text (capped ~4000 chars). Empty if no plans matched. */
  guidelineText: string
  /** Matched plan titles (deduped), for the physician-facing citation list. */
  citations: string[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_SEARCH_TERMS = 12
const MIN_TERM_LENGTH = 3
const DEFAULT_MAX_PLANS = 3
const DIFFERENTIAL_ROWS_PER_PLAN = 4
const EVIDENCE_ROWS_PER_PLAN = 5
const MAX_GUIDELINE_TEXT_CHARS = 4000

// plans.status is populated on every row in the live neuro_plans DB, but the
// value is 'active' — not 'approved' (verified live 2026-07-19: 487/487 rows
// are 'active', 'approved' does not occur). Filter on the real value rather
// than a guessed one so this doesn't silently zero out every match.
const PLAN_STATUS_FILTER = 'active'

// ── Row shapes ────────────────────────────────────────────────────────────────

interface RankedPlanRow {
  plan_id: string
  title: string
  term_hits: number
}

interface DifferentialRow {
  plan_id: string
  diagnosis: string | null
  features: string | null
}

interface EvidenceRow {
  plan_id: string
  recommendation: string | null
  evidence_level: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a deduplicated, lowercased set of search terms from symptom terms +
 * chief complaint. Drops empty/very short terms (avoids overly broad ILIKE
 * matches) and caps the term count so the ranking query stays bounded.
 */
function buildSearchTerms(symptomTerms: string[], chiefComplaint?: string): string[] {
  const raw = [...symptomTerms, ...(chiefComplaint ? [chiefComplaint] : [])]
  const seen = new Set<string>()
  const terms: string[] = []

  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const term = entry.trim().toLowerCase()
    if (term.length < MIN_TERM_LENGTH) continue
    if (seen.has(term)) continue
    seen.add(term)
    terms.push(term)
    if (terms.length >= MAX_SEARCH_TERMS) break
  }

  return terms
}

function groupByPlanId<T extends { plan_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const list = map.get(row.plan_id)
    if (list) {
      list.push(row)
    } else {
      map.set(row.plan_id, [row])
    }
  }
  return map
}

/** Format one matched plan's differential + evidence into a readable text block. */
function formatPlanBlock(
  title: string,
  differential: DifferentialRow[],
  evidence: EvidenceRow[]
): string {
  const lines: string[] = [`### ${title}`]

  const diffLines = differential
    .slice(0, DIFFERENTIAL_ROWS_PER_PLAN)
    .filter((d) => d.diagnosis)
    .map((d) => `- ${d.diagnosis}${d.features ? ` — ${d.features}` : ''}`)
  if (diffLines.length > 0) {
    lines.push('Differential considerations:', ...diffLines)
  }

  const evidenceLines = evidence
    .slice(0, EVIDENCE_ROWS_PER_PLAN)
    .filter((e) => e.recommendation)
    .map((e) => `- ${e.recommendation}${e.evidence_level ? ` (${e.evidence_level})` : ''}`)
  if (evidenceLines.length > 0) {
    lines.push('Evidence-based recommendations:', ...evidenceLines)
  }

  return lines.join('\n')
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Retrieve plan-grounded evidence for the localizer from neuro_plans.
 *
 * Ranks plans by how many search terms match across plans.title,
 * plan_icd10.description, plan_differential.diagnosis, and
 * plan_differential.features (ILIKE, parameterized), takes the top
 * `maxPlans`, then pulls each matched plan's top differential + evidence
 * rows and formats them into a single text block.
 *
 * Returns an empty result (never invented content) if no search terms
 * survive filtering or no plans match. DB errors reject — callers must
 * catch.
 */
export async function retrievePlanEvidence(
  pool: Pool,
  opts: RetrievePlanEvidenceOptions
): Promise<PlanEvidenceResult> {
  const terms = buildSearchTerms(opts.symptomTerms ?? [], opts.chiefComplaint)
  if (terms.length === 0) {
    return { guidelineText: '', citations: [] }
  }

  const maxPlans = Math.max(1, Math.floor(opts.maxPlans ?? DEFAULT_MAX_PLANS))

  const ranked = await pool.query<RankedPlanRow>(
    `WITH terms AS (
       SELECT DISTINCT term FROM unnest($1::text[]) AS term
     ),
     active_plans AS (
       SELECT id, title FROM plans WHERE status = $2
     ),
     hits AS (
       SELECT ap.id AS plan_id, t.term
       FROM active_plans ap
       JOIN terms t ON ap.title ILIKE '%' || t.term || '%'

       UNION

       SELECT pi.plan_id, t.term
       FROM plan_icd10 pi
       JOIN active_plans ap ON ap.id = pi.plan_id
       JOIN terms t ON pi.description ILIKE '%' || t.term || '%'

       UNION

       SELECT pd.plan_id, t.term
       FROM plan_differential pd
       JOIN active_plans ap ON ap.id = pd.plan_id
       JOIN terms t ON (pd.diagnosis ILIKE '%' || t.term || '%' OR pd.features ILIKE '%' || t.term || '%')
     )
     SELECT h.plan_id, ap.title, count(DISTINCT h.term)::int AS term_hits
     FROM hits h
     JOIN active_plans ap ON ap.id = h.plan_id
     GROUP BY h.plan_id, ap.title
     ORDER BY term_hits DESC, ap.title ASC
     LIMIT $3`,
    [terms, PLAN_STATUS_FILTER, maxPlans]
  )

  if (ranked.rows.length === 0) {
    return { guidelineText: '', citations: [] }
  }

  const planIds = ranked.rows.map((r) => r.plan_id)

  const [differentialResult, evidenceResult] = await Promise.all([
    pool.query<DifferentialRow>(
      `SELECT plan_id, diagnosis, features
       FROM plan_differential
       WHERE plan_id = ANY($1::text[])
       ORDER BY plan_id, display_order`,
      [planIds]
    ),
    pool.query<EvidenceRow>(
      `SELECT plan_id, recommendation, evidence_level
       FROM plan_evidence
       WHERE plan_id = ANY($1::text[])
       ORDER BY plan_id, display_order`,
      [planIds]
    ),
  ])

  const differentialByPlan = groupByPlanId(differentialResult.rows)
  const evidenceByPlan = groupByPlanId(evidenceResult.rows)

  const blocks: string[] = []
  const citations: string[] = []
  const seenTitles = new Set<string>()

  for (const row of ranked.rows) {
    blocks.push(
      formatPlanBlock(
        row.title,
        differentialByPlan.get(row.plan_id) ?? [],
        evidenceByPlan.get(row.plan_id) ?? []
      )
    )
    if (!seenTitles.has(row.title)) {
      seenTitles.add(row.title)
      citations.push(row.title)
    }
  }

  const guidelineText = blocks.join('\n\n').slice(0, MAX_GUIDELINE_TEXT_CHARS)

  return { guidelineText, citations }
}
