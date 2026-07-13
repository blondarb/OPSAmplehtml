#!/usr/bin/env tsx
/**
 * One-off corrected reseed of validation_cases (Option A — restore curriculum).
 *
 * Builds the corrected 26-card set deterministically from the CURRENT
 * DEMO_SCENARIOS (re-pairs copy existing docs; 14 gap labels get fresh notes
 * from TRIAGE_FRESH_NOTES.md) and upserts on a STABLE scenario_id key so a
 * future reorder can never silently overwrite the wrong row again.
 *
 * Usage:
 *   tsx scripts/reseed-validation-cases.ts --dry     # print mapping, no DB write
 *   tsx scripts/reseed-validation-cases.ts           # apply (DB write)
 * Env: PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE (ops_amplehtml), PGSSLMODE=require
 */
import { readFileSync } from 'fs'
import { Pool } from 'pg'
import { DEMO_SCENARIOS } from '../src/lib/triage/demoScenarios'

const DRY = process.argv.includes('--dry')
const STUDY = 'default'
const SEP = '\n\n--- Next Document ---\n\n'
const NOTES_FILE = process.env.NOTES_FILE ||
  'qa/triage-validation/TRIAGE_FRESH_NOTES.md'

// destinationCardId -> sourceCardId (dest referral_text = source's ORIGINAL joined text)
const REPAIR: Record<string, string> = {
  'outpatient-02-gutierrez': 'cross-07-reynolds',   // postpartum carpal tunnel
  'outpatient-05-hargrove': 'outpatient-03-patterson', // diabetic peripheral neuropathy
  'outpatient-07-kowalski': 'outpatient-02-gutierrez', // chronic migraine / MOH (migraine/IIH)
  'cross-02-vasquez': 'cross-10-okafor',            // CNS mass vasculitis vs lymphoma
  'cross-03-mcallister': 'outpatient-09-washington', // TIA, AFib, off-anticoagulation
  'cross-07-reynolds': 'cross-09-kim',              // post-concussion (soccer)
  'cross-09-kim': 'cross-04-patel',                 // BPPV / peripheral vestibular
}

// Patterson reverts to the TIA teaching case (title only; note supplied via FRESH).
const PATTERSON_ID = 'outpatient-03-patterson'
const PATTERSON_TIA_BRIEF =
  'HTN follow-up with two transient episodes of right arm weakness and speech difficulty.'

function parseFreshNotes(md: string): Record<string, string> {
  const out: Record<string, string> = {}
  // Split on headers "## CARD <id> ..." then take the first fenced ``` block.
  const parts = md.split(/^## CARD\s+/m).slice(1)
  for (const part of parts) {
    const id = part.split(/[\s(]/, 1)[0].trim()
    const fence = part.match(/```[a-z]*\n([\s\S]*?)\n```/)
    if (id && fence) out[id] = fence[1]
  }
  return out
}

function joinFiles(s: (typeof DEMO_SCENARIOS)[number]): string {
  return s.files.map((f) => f.previewText).join(SEP)
}

// ONE-SHOT GUARD (added 2026-07-12): this migration ran 2026-07-10 against the
// SCRAMBLED demo set. The REPAIR map references pre-correction positions, so
// running it against the corrected file would re-scramble content. Abort if
// the tree is already corrected.
function assertNotAlreadyCorrected() {
  const patterson = DEMO_SCENARIOS.find((s) => s.id === 'outpatient-03-patterson')
  if (patterson?.clinicalHighlight === 'TIA presentation') {
    console.error(
      'ABORT: demoScenarios.ts is already corrected (Patterson = TIA). ' +
        'This one-shot 2026-07-10 migration must not run against the corrected set.',
    )
    process.exit(1)
  }
}

function main() {
  assertNotAlreadyCorrected()
  const fresh = parseFreshNotes(readFileSync(NOTES_FILE, 'utf-8'))
  const byId = new Map(DEMO_SCENARIOS.map((s) => [s.id, s]))

  const corrected = DEMO_SCENARIOS.map((s, i) => {
    let referral_text: string
    let source: string
    if (fresh[s.id]) {
      referral_text = fresh[s.id]
      source = 'FRESH note'
    } else if (REPAIR[s.id]) {
      const src = byId.get(REPAIR[s.id])
      if (!src) throw new Error(`re-pair source not found: ${REPAIR[s.id]}`)
      referral_text = joinFiles(src)
      source = `re-pair ← ${REPAIR[s.id]}`
    } else {
      referral_text = joinFiles(s)
      source = 'KEEP'
    }
    const brief = s.id === PATTERSON_ID ? PATTERSON_TIA_BRIEF : s.briefDescription
    return {
      scenario_id: s.id,
      case_number: i + 1,
      title: `${s.patientName} — ${brief}`,
      referral_text,
      patient_age: s.age,
      patient_sex: s.sex,
      source,
    }
  })

  console.log(`\n=== Corrected ${corrected.length} cases (${DRY ? 'DRY RUN' : 'APPLYING'}) ===`)
  for (const c of corrected) {
    const firstLine = c.referral_text.split('\n').find((l) => l.trim()) || ''
    console.log(`\n[${c.source}] ${c.scenario_id}`)
    console.log(`  TITLE: ${c.title}`)
    console.log(`  DOC:   ${firstLine.slice(0, 90)}`)
  }

  if (DRY) {
    console.log('\n(dry run — no DB writes)')
    return
  }

  applyToDb(corrected)
}

async function applyToDb(corrected: Array<{ scenario_id: string; case_number: number; title: string; referral_text: string; patient_age: number; patient_sex: string }>) {
  const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || 'ops_amplehtml',
    ssl: { rejectUnauthorized: false },
  })
  const client = await pool.connect()
  try {
    // 1. Stable-key column + unique constraint (idempotent).
    await client.query(`ALTER TABLE validation_cases ADD COLUMN IF NOT EXISTS scenario_id text`)
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS validation_cases_study_scenario_uidx
         ON validation_cases (study_name, scenario_id)`,
    )
    // 2. Backfill scenario_id on existing rows by matching patient name prefix in title,
    //    so the upsert below updates them in place rather than duplicating.
    for (let i = 0; i < corrected.length; i++) {
      const c = corrected[i]
      const namePrefix = c.title.split(' — ')[0]
      await client.query(
        `UPDATE validation_cases SET scenario_id = $1
           WHERE study_name = $2 AND scenario_id IS NULL AND title LIKE $3`,
        [c.scenario_id, STUDY, `${namePrefix}%`],
      )
    }
    // 3. Upsert corrected content on the stable key. NULL out stale ai_* — they were
    //    graded against scrambled labels and are invalid.
    let updated = 0
    for (const c of corrected) {
      await client.query(
        `INSERT INTO validation_cases
           (study_name, scenario_id, case_number, title, referral_text, patient_age, patient_sex, is_calibration,
            ai_triage_tier, ai_weighted_score, ai_dimension_scores, ai_subspecialty,
            ai_redirect_to_non_neuro, ai_redirect_specialty, ai_confidence, ai_session_id, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,false, NULL,NULL,NULL,NULL,false,NULL,NULL,NULL,true)
         ON CONFLICT (study_name, scenario_id) DO UPDATE SET
           title = EXCLUDED.title,
           referral_text = EXCLUDED.referral_text,
           patient_age = EXCLUDED.patient_age,
           patient_sex = EXCLUDED.patient_sex,
           ai_triage_tier = NULL, ai_weighted_score = NULL, ai_dimension_scores = NULL,
           ai_subspecialty = NULL, ai_redirect_to_non_neuro = false, ai_redirect_specialty = NULL,
           ai_confidence = NULL, ai_session_id = NULL, active = true`,
        [STUDY, c.scenario_id, c.case_number, c.title, c.referral_text, c.patient_age, c.patient_sex],
      )
      updated++
    }
    // 4. Purge stale per-run AI results (graded against scrambled labels).
    const del = await client.query(
      `DELETE FROM validation_ai_runs WHERE case_id IN
         (SELECT id FROM validation_cases WHERE study_name = $1)`,
      [STUDY],
    ).catch((e) => { console.warn('validation_ai_runs purge skipped:', e.message); return { rowCount: 0 } })

    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM validation_cases WHERE study_name = $1 AND scenario_id IS NOT NULL`,
      [STUDY],
    )
    console.log(`\n=== DONE: ${updated} upserted; ${rows[0].n} rows now keyed by scenario_id; ${del.rowCount ?? 0} stale ai_runs purged ===`)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
