#!/usr/bin/env tsx
/**
 * OFFLINE tier/floor re-baseline for validation_cases — NO Bedrock calls.
 *
 * For every active case in a given study that has a RECORDED
 * `ai_dimension_scores` value, this replays the frozen scoring path
 * (`calculateWeightedScore`, `mapScoreToTier`, `calculateTriageDecision` from
 * `src/lib/triage/scoring.ts` — imported, never reimplemented) to separate
 * "the weighted score alone would produce tier X" from "a single-dimension
 * floor pushed it to tier Y instead", and cross-references the result
 * against each case's `expectedTier` in `src/lib/triage/demoScenarios.ts`.
 *
 * Cases with NO recorded ai_dimension_scores cannot be replayed offline —
 * they are reported as such, never silently skipped or invented.
 *
 * CAVEAT (read before trusting the floor column): `validation_cases` has no
 * column for `red_flag_override`, `insufficient_data`, or `emergent_override`
 * — only `ai_dimension_scores`, `ai_weighted_score`, `ai_triage_tier`, etc.
 * Those three booleans are part of the AITriageResponse shape that
 * `calculateTriageDecision()` requires, so this script supplies them as
 * `false` (never true) when reconstructing the response object. That means:
 *   - the `red_flag_override` floor can NEVER fire in this replay (its input
 *     is hard-coded false — it is a distinct field from the red_flag_presence
 *     DIMENSION score, which IS reconstructed faithfully from real data);
 *   - a case whose expectedTier is 'emergent' can never be reproduced by this
 *     replay (emergent_override is hard-coded false), and is reported as
 *     N/A rather than a false "disagreement".
 * The four dimension-score floors (red_flag_presence>=4, symptom_acuity==5,
 * diagnostic_concern==5, rate_of_progression==5) and the two semi_urgent
 * floors (symptom_acuity>=4, diagnostic_concern>=4) ARE fully faithful — they
 * are computed only from the recorded dimension_scores.
 *
 * Usage:
 *   npx tsx scripts/tier-floor-breakdown.ts [--study default]
 * Env: RDS_HOST / RDS_PORT / RDS_USER / RDS_PASSWORD / RDS_DATABASE (.env.local)
 * READ-ONLY: issues SELECT statements only.
 */
import { readFileSync } from 'node:fs'
import { Pool } from 'pg'
import {
  calculateWeightedScore,
  calculateTriageDecision,
  mapScoreToTier,
} from '../src/lib/triage/scoring'
import { DEMO_SCENARIOS } from '../src/lib/triage/demoScenarios'
import type { AITriageResponse, DimensionScores, TriageTier } from '../src/lib/triage/types'

const args = process.argv.slice(2)
function argValue(flag: string, fallback: string): string {
  const withEquals = args.find((a) => a.startsWith(`${flag}=`))
  if (withEquals) return withEquals.split('=').slice(1).join('=')
  const idx = args.indexOf(flag)
  if (idx !== -1 && args[idx + 1]) return args[idx + 1]
  return fallback
}
const STUDY = argValue('--study', 'default')

function loadCaBundle(): string {
  const src = readFileSync(
    new URL('../src/lib/rds-ca-bundle.ts', import.meta.url),
    'utf8',
  )
  const match = src.match(/`([\s\S]*)`/)
  if (!match) throw new Error('Could not extract PEM CA bundle from rds-ca-bundle.ts')
  return match[1]
}

// Tier rank, most-urgent first. Used only to describe OVER/UNDER direction
// for reporting — this is not clinical logic, it is a display convenience
// derived from calculateTriageDecision's own output.
const TIER_RANK: Record<TriageTier, number> = {
  emergent: 0,
  urgent: 1,
  semi_urgent: 2,
  routine_priority: 3,
  routine: 4,
  non_urgent: 5,
  insufficient_data: 6,
}

const DIMENSION_KEYS = [
  'symptom_acuity',
  'diagnostic_concern',
  'rate_of_progression',
  'functional_impairment',
  'red_flag_presence',
] as const

function isValidDimensionScores(value: unknown): value is DimensionScores {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return DIMENSION_KEYS.every((key) => {
    const entry = record[key]
    return (
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { score?: unknown }).score === 'number' &&
      Number.isInteger((entry as { score: number }).score) &&
      (entry as { score: number }).score >= 1 &&
      (entry as { score: number }).score <= 5
    )
  })
}

// Minimal, honest AITriageResponse reconstruction. See file-header caveat:
// red_flag_override / insufficient_data / emergent_override are NOT stored
// in validation_cases, so they are fixed to false rather than guessed.
function buildStubAiResponse(dimensionScores: DimensionScores): AITriageResponse {
  return {
    emergent_override: false,
    emergent_reason: null,
    insufficient_data: false,
    missing_information: null,
    confidence: 'moderate',
    dimension_scores: dimensionScores,
    red_flag_override: false,
    clinical_reasons: ['offline replay — not sourced from a live model response'],
    red_flags: [],
    suggested_workup: [],
    failed_therapies: [],
    subspecialty_recommendation: 'General Neurology',
    subspecialty_rationale: 'offline replay placeholder',
    redirect_to_non_neuro: false,
    redirect_specialty: null,
    redirect_rationale: null,
    safety_anticoagulation: null,
    safety_symptom_onset_time: null,
    safety_allergies: null,
    safety_implanted_devices: null,
    safety_pregnancy_status: null,
    safety_recent_procedures: null,
    safety_renal_function: null,
  }
}

interface Row {
  scenario_id: string | null
  case_number: number
  title: string
  ai_dimension_scores: unknown
  ai_weighted_score: string | null
  ai_triage_tier: string | null
}

async function main() {
  const ca = loadCaBundle()
  const pool = new Pool({
    host: process.env.RDS_HOST,
    port: Number(process.env.RDS_PORT || 5432),
    user: process.env.RDS_USER,
    password: process.env.RDS_PASSWORD,
    database: process.env.RDS_DATABASE,
    ssl: { ca, rejectUnauthorized: true },
  })

  console.log(`\n=== Tier / Floor Breakdown — study "${STUDY}" (OFFLINE, no Bedrock calls) ===\n`)

  // Dimension scores are written to validation_AI_RUNS, not validation_cases —
  // both the live runner (scripts/run-validation.ts) and the UI rerun/auto
  // endpoints write there. Reading validation_cases.ai_dimension_scores returns
  // all-NULL and makes a perfectly good live run look like it produced nothing.
  // (Found 2026-08-04.) One row per case: the most recent BASELINE run
  // (temperature 0) when present, else the most recent run of any temperature.
  const { rows } = await pool.query<Row>(
    `SELECT DISTINCT ON (vc.case_number)
            vc.scenario_id, vc.case_number, vc.title,
            r.ai_dimension_scores, r.ai_weighted_score, r.ai_triage_tier,
            r.model, r.temperature, r.created_at
     FROM validation_cases vc
     JOIN validation_ai_runs r ON r.case_id = vc.id
     WHERE vc.study_name = $1 AND vc.active = true
       AND r.error IS NULL AND r.ai_dimension_scores IS NOT NULL
     ORDER BY vc.case_number,
              (r.temperature = 0) DESC,
              r.created_at DESC`,
    [STUDY],
  )
  await pool.end()

  const expectedByScenarioId = new Map(DEMO_SCENARIOS.map((s) => [s.id, s.expectedTier]))

  const evaluableRows: Array<{
    scenarioId: string
    caseNumber: number
    title: string
    expectedTier: TriageTier | 'unknown (no scenario_id match)'
    weightedScore: number
    tierFromScoreAlone: TriageTier
    appliedFloors: string[]
    finalTier: TriageTier
    floorDriven: boolean
    agreement: 'AGREE' | 'DISAGREE' | 'N/A (emergent expected — cannot be reconstructed offline)'
    direction: 'OVER' | 'UNDER' | '—'
  }> = []
  const unevaluableRows: Array<{ scenarioId: string | null; caseNumber: number; title: string }> = []

  for (const row of rows) {
    if (!isValidDimensionScores(row.ai_dimension_scores)) {
      unevaluableRows.push({
        scenarioId: row.scenario_id,
        caseNumber: row.case_number,
        title: row.title,
      })
      continue
    }

    const dimensionScores = row.ai_dimension_scores
    const weightedScore = calculateWeightedScore(dimensionScores)
    const tierFromScoreAlone = mapScoreToTier(weightedScore)
    const decision = calculateTriageDecision(buildStubAiResponse(dimensionScores))
    const finalTier: TriageTier = decision.outpatientPriority
    const floorDriven = tierFromScoreAlone !== finalTier

    const expected = row.scenario_id
      ? expectedByScenarioId.get(row.scenario_id) ?? 'unknown (no scenario_id match)'
      : 'unknown (no scenario_id match)'

    let agreement: 'AGREE' | 'DISAGREE' | 'N/A (emergent expected — cannot be reconstructed offline)'
    let direction: 'OVER' | 'UNDER' | '—' = '—'
    if (expected === 'emergent') {
      agreement = 'N/A (emergent expected — cannot be reconstructed offline)'
    } else if (expected === finalTier) {
      agreement = 'AGREE'
    } else if (expected === 'unknown (no scenario_id match)') {
      agreement = 'DISAGREE'
    } else {
      agreement = 'DISAGREE'
      direction = TIER_RANK[finalTier] < TIER_RANK[expected] ? 'OVER' : 'UNDER'
    }

    evaluableRows.push({
      scenarioId: row.scenario_id ?? '(none)',
      caseNumber: row.case_number,
      title: row.title,
      expectedTier: expected,
      weightedScore,
      tierFromScoreAlone,
      appliedFloors: decision.appliedFloors,
      finalTier,
      floorDriven,
      agreement,
      direction,
    })
  }

  console.log(`Active cases in study "${STUDY}": ${rows.length}`)
  console.log(`With recorded ai_dimension_scores (evaluable offline): ${evaluableRows.length}`)
  console.log(`WITHOUT recorded ai_dimension_scores (cannot be replayed offline): ${unevaluableRows.length}\n`)

  if (unevaluableRows.length > 0) {
    console.log('--- Cases that CANNOT be evaluated (no ai_dimension_scores recorded) ---')
    for (const r of unevaluableRows) {
      console.log(`  case ${r.caseNumber} [${r.scenarioId ?? '(no scenario_id)'}] ${r.title}`)
    }
    console.log('')
  }

  if (evaluableRows.length === 0) {
    console.log(
      `No cases in study "${STUDY}" have a recorded ai_dimension_scores value.\n` +
        `RESULT: the floor-vs-score breakdown table cannot be produced for this study — ` +
        `there is nothing to replay. This is reported as the finding, not papered over.\n`,
    )
    return
  }

  console.log('--- Floor / Score Breakdown ---')
  const header = [
    'scenario_id',
    'expectedTier',
    'weightedScore',
    'tierFromScoreAlone',
    'appliedFloors',
    'finalTier',
    'FLOOR-DRIVEN?',
    'AGREES-WITH-EXPECTED?',
  ]
  console.log(header.join(' | '))
  for (const r of evaluableRows) {
    console.log(
      [
        r.scenarioId,
        r.expectedTier,
        r.weightedScore.toFixed(2),
        r.tierFromScoreAlone,
        r.appliedFloors.length > 0 ? r.appliedFloors.join(',') : '(none)',
        r.finalTier,
        r.floorDriven ? 'YES' : 'no',
        r.agreement === 'AGREE'
          ? 'AGREE'
          : r.agreement === 'DISAGREE'
            ? `DISAGREE (${r.direction})`
            : r.agreement,
      ].join(' | '),
    )
  }

  const floorDrivenCount = evaluableRows.filter((r) => r.floorDriven).length
  const disagreeRows = evaluableRows.filter((r) => r.agreement === 'DISAGREE')
  const overCount = disagreeRows.filter((r) => r.direction === 'OVER').length
  const underCount = disagreeRows.filter((r) => r.direction === 'UNDER').length
  const naCount = evaluableRows.filter((r) => r.agreement.startsWith('N/A')).length

  console.log('\n--- Summary ---')
  console.log(`Evaluable cases: ${evaluableRows.length} / ${rows.length} active cases`)
  console.log(`Floor-driven (tier-from-score !== final tier): ${floorDrivenCount} / ${evaluableRows.length}`)
  console.log(
    `Disagree with expectedTier: ${disagreeRows.length} / ${evaluableRows.length} ` +
      `(OVER: ${overCount}, UNDER: ${underCount})`,
  )
  if (naCount > 0) {
    console.log(
      `N/A (expectedTier = 'emergent', not reconstructable offline since emergent_override ` +
        `is not stored in validation_cases): ${naCount}`,
    )
  }
  console.log('')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
