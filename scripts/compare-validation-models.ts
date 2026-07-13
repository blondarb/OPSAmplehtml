#!/usr/bin/env tsx
/**
 * Compare validation_ai_runs across models against the expected tiers in
 * DEMO_SCENARIOS (keyed by scenario_id — the DB carries no expected_tier).
 * Read-only. Majority tier per (model, case) across runs; flags every
 * disagreement with expected, marking direction (UNDER/OVER-triage).
 *
 * Usage:
 *   RDS_HOST=... RDS_USER=... RDS_PASSWORD=... RDS_DATABASE=ops_amplehtml \
 *   npx tsx scripts/compare-validation-models.ts <modelA> <modelB>
 */
import { Pool } from 'pg'
import { DEMO_SCENARIOS } from '../src/lib/triage/demoScenarios'

const TIER_ORDER = [
  'emergent',
  'urgent',
  'semi_urgent',
  'routine_priority',
  'routine',
  'non_urgent',
  'insufficient_data',
]

const models = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (models.length === 0) {
  console.error('usage: compare-validation-models.ts <modelA> [modelB...]')
  process.exit(1)
}

const pool = new Pool({
  host: process.env.RDS_HOST,
  port: Number(process.env.RDS_PORT || 5432),
  user: process.env.RDS_USER,
  password: process.env.RDS_PASSWORD,
  database: process.env.RDS_DATABASE,
  ssl: { rejectUnauthorized: false },
})

interface RunRow {
  scenario_id: string
  title: string
  model: string
  ai_triage_tier: string | null
  error: string | null
}

function majority(tiers: string[]): { tier: string; agreement: string } {
  const counts = new Map<string, number>()
  for (const t of tiers) counts.set(t, (counts.get(t) || 0) + 1)
  const [tier, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return { tier, agreement: `${n}/${tiers.length}` }
}

function direction(expected: string, got: string): string {
  const e = TIER_ORDER.indexOf(expected)
  const g = TIER_ORDER.indexOf(got)
  if (e < 0 || g < 0) return '?'
  if (g > e) return 'UNDER-triage'
  if (g < e) return 'OVER-triage'
  return 'match'
}

async function main() {
  const { rows } = await pool.query<RunRow>(
    `SELECT c.scenario_id, c.title, r.model, r.ai_triage_tier, r.error
       FROM validation_ai_runs r
       JOIN validation_cases c ON c.id = r.case_id
      WHERE r.model = ANY($1)
      ORDER BY c.case_number, r.model, r.run_number`,
    [models],
  )
  const expected = new Map(DEMO_SCENARIOS.map((s) => [s.id, s.expectedTier]))

  const byCase = new Map<string, Map<string, RunRow[]>>()
  for (const r of rows) {
    if (!byCase.has(r.scenario_id)) byCase.set(r.scenario_id, new Map())
    const m = byCase.get(r.scenario_id)!
    if (!m.has(r.model)) m.set(r.model, [])
    m.get(r.model)!.push(r)
  }

  const summary: Record<string, { match: number; under: number; over: number; errored: number }> = {}
  for (const m of models) summary[m] = { match: 0, under: 0, over: 0, errored: 0 }

  console.log('scenario | expected | ' + models.map((m) => m.split('.').pop()).join(' | '))
  for (const [sid, perModel] of byCase) {
    const exp = expected.get(sid) || '??'
    const cells: string[] = []
    for (const m of models) {
      const runs = perModel.get(m) || []
      const ok = runs.filter((r) => !r.error && r.ai_triage_tier)
      if (ok.length === 0) {
        cells.push(`ERROR(${runs.length})`)
        summary[m].errored++
        continue
      }
      const { tier, agreement } = majority(ok.map((r) => r.ai_triage_tier!))
      const dir = direction(exp, tier)
      if (dir === 'match') summary[m].match++
      else if (dir === 'UNDER-triage') summary[m].under++
      else if (dir === 'OVER-triage') summary[m].over++
      cells.push(dir === 'match' ? `${tier} (${agreement})` : `${tier} (${agreement}) <-- ${dir}`)
    }
    console.log(`${sid} | ${exp} | ${cells.join(' | ')}`)
  }

  console.log('\n=== summary (26 cases, majority-of-runs) ===')
  for (const m of models) {
    const s = summary[m]
    console.log(
      `${m}: ${s.match} match, ${s.under} UNDER, ${s.over} OVER, ${s.errored} errored`,
    )
  }
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
