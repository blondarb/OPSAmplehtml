/**
 * Localizer eval runner.
 *
 *   npx tsx qa/localizer-evals/run.ts
 *
 * Loads every vignette in ./vignettes, sends it to the differential engine via
 * a pluggable adapter, scores the response against gold, and prints a report.
 * Exits non-zero if any vignette fails (so it can gate CI).
 *
 * Adapter selection (env):
 *   LOCALIZER_EVAL_ENDPOINT   Full URL of the localizer route, e.g.
 *                             https://app.neuroplans.app/api/ai/historian/localizer
 *   LOCALIZER_EVAL_COOKIE     Cookie header for auth (id_token=...), optional
 *   LOCALIZER_EVAL_BEARER     Authorization: Bearer token, optional
 *
 * With no endpoint set, the runner SKIPS (exit 0) and explains how to wire it —
 * so the scorer unit tests (score.test.ts) remain the always-on signal in CI.
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { scoreVignette } from './score'
import type { Vignette, LocalizerLike } from './schema'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VIGNETTE_DIR = path.join(__dirname, 'vignettes')

function loadVignettes(): Vignette[] {
  return fs
    .readdirSync(VIGNETTE_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(VIGNETTE_DIR, f), 'utf-8')) as Vignette)
}

/** Map a vignette into the localizer request body and POST it. */
async function callLocalizer(endpoint: string, v: Vignette): Promise<LocalizerLike> {
  const transcript = v.input.transcript.map((t, i) => ({
    role: t.role,
    text: t.text,
    timestamp: t.timestamp ?? Date.now() + i,
  }))
  if (v.input.exam) {
    transcript.push({ role: 'user', text: `On exam: ${v.input.exam}.`, timestamp: Date.now() + transcript.length })
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (process.env.LOCALIZER_EVAL_COOKIE) headers['cookie'] = process.env.LOCALIZER_EVAL_COOKIE
  if (process.env.LOCALIZER_EVAL_BEARER) headers['authorization'] = `Bearer ${process.env.LOCALIZER_EVAL_BEARER}`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId: `eval-${v.id}`,
      sessionType: v.input.sessionType ?? 'new_patient',
      transcript,
      chiefComplaint: v.input.chiefComplaint,
    }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${v.id}`)
  const body: any = await res.json()

  return {
    differential: (body.differential ?? []).map((d: any) => ({
      diagnosis: d.diagnosis ?? d.name ?? '',
      rationale: d.rationale,
      likelihood: d.likelihood,
    })),
    // Dual-axis (spec §3b) — present only once the engine is upgraded.
    cantMiss: Array.isArray(body.cantMiss)
      ? body.cantMiss.map((d: any) => ({ diagnosis: d.diagnosis ?? d.name ?? '', rationale: d.rationale, likelihood: d.likelihood }))
      : undefined,
    followUpQuestions: body.followUpQuestions ?? [],
    localizationHypothesis: body.localizationHypothesis ?? '',
  }
}

async function main() {
  const vignettes = loadVignettes()
  const endpoint = process.env.LOCALIZER_EVAL_ENDPOINT

  if (!endpoint) {
    console.log('⏭  LOCALIZER_EVAL_ENDPOINT not set — skipping live eval.')
    console.log(`   Loaded ${vignettes.length} vignettes: ${vignettes.map((v) => v.id).join(', ')}`)
    console.log('   To run against the live engine:')
    console.log('     LOCALIZER_EVAL_ENDPOINT=https://app.neuroplans.app/api/ai/historian/localizer \\')
    console.log('     LOCALIZER_EVAL_COOKIE="id_token=..." npx tsx qa/localizer-evals/run.ts')
    console.log('   (The scorer itself is covered by score.test.ts in the vitest suite.)')
    process.exit(0)
  }

  let failed = 0
  for (const v of vignettes) {
    try {
      const resp = await callLocalizer(endpoint, v)
      const result = scoreVignette(v.id, v.gold, resp)
      const icon = result.pass ? '✅' : '❌'
      console.log(`\n${icon} ${v.id}  (${result.passed}/${result.total})`)
      for (const c of result.checks) {
        console.log(`   ${c.pass ? '·' : '✗'} ${c.name} — ${c.detail}`)
      }
      if (!result.pass) failed++
    } catch (err) {
      console.error(`\n❌ ${v.id} — adapter error: ${(err as Error).message}`)
      failed++
    }
  }

  console.log(`\n${failed === 0 ? '✅ all vignettes passed' : `❌ ${failed}/${vignettes.length} vignettes failed`}`)
  process.exit(failed === 0 ? 0 : 1)
}

main()
