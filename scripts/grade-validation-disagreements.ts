#!/usr/bin/env tsx
/**
 * Independent cross-family grading of validation disagreements.
 *
 * For every case where a Claude model's majority tier disagrees with the
 * expected tier in DEMO_SCENARIOS, ask an INDEPENDENT (non-Anthropic) model
 * on Bedrock to triage the SAME raw referral text with a deliberately
 * neutral prompt — no expected tier, no other model's answer, no framing.
 * (A leading prompt is how the 2026-07-10 "missed TIA" false alarm happened.)
 *
 * Read-only against validation tables; writes nothing to the DB.
 *
 * Usage:
 *   RDS_HOST=... RDS_USER=... RDS_PASSWORD=... RDS_DATABASE=ops_amplehtml \
 *   AWS_PROFILE=sevaro-sandbox \
 *   npx tsx scripts/grade-validation-disagreements.ts <claudeModelA> [claudeModelB...]
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { Pool } from 'pg'
import { DEMO_SCENARIOS } from '../src/lib/triage/demoScenarios'

const GRADER_MODEL = process.env.GRADER_MODEL || 'openai.gpt-oss-120b-1:0'
const TIERS = [
  'emergent',
  'urgent',
  'semi_urgent',
  'routine_priority',
  'routine',
  'non_urgent',
] as const

const models = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (models.length === 0) {
  console.error('usage: grade-validation-disagreements.ts <modelA> [modelB...]')
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

const bedrock = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || 'us-east-2',
})

const NEUTRAL_SYSTEM = `You are a neurology referral triage specialist at an outpatient neurology practice. You will be given the raw text of one referral. Decide how urgently this patient needs to be seen.

Assign EXACTLY one tier:
- emergent: send to emergency care now
- urgent: neurology evaluation within days
- semi_urgent: within 1-2 weeks
- routine_priority: within 2-4 weeks
- routine: within 4-8 weeks
- non_urgent: standard scheduling / could be managed by referring provider

Reply with ONLY a JSON object: {"tier": "<one tier>", "rationale": "<one sentence>"}`

function majority(tiers: string[]): string {
  const counts = new Map<string, number>()
  for (const t of tiers) counts.set(t, (counts.get(t) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

async function gradeReferral(text: string): Promise<{ tier: string; rationale: string }> {
  const res = await bedrock.send(
    new ConverseCommand({
      modelId: GRADER_MODEL,
      system: [{ text: NEUTRAL_SYSTEM }],
      messages: [{ role: 'user', content: [{ text }] }],
      inferenceConfig: { maxTokens: 1200 },
    }),
  )
  const out = res.output?.message?.content?.map((c) => c.text || '').join('') || ''
  const match = out.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`unparseable grader output: ${out.slice(0, 120)}`)
  const parsed = JSON.parse(match[0])
  if (!TIERS.includes(parsed.tier)) throw new Error(`ungoverned tier: ${parsed.tier}`)
  return parsed
}

async function main() {
  const { rows } = await pool.query(
    `SELECT c.scenario_id, c.title, c.referral_text, r.model, r.ai_triage_tier, r.error
       FROM validation_ai_runs r
       JOIN validation_cases c ON c.id = r.case_id
      WHERE r.model = ANY($1)`,
    [models],
  )
  const expected = new Map(DEMO_SCENARIOS.map((s) => [s.id, s.expectedTier]))

  const byCase = new Map<string, { title: string; text: string; byModel: Map<string, string[]> }>()
  for (const r of rows) {
    if (!byCase.has(r.scenario_id))
      byCase.set(r.scenario_id, { title: r.title, text: r.referral_text, byModel: new Map() })
    if (r.error || !r.ai_triage_tier) continue
    const e = byCase.get(r.scenario_id)!
    if (!e.byModel.has(r.model)) e.byModel.set(r.model, [])
    e.byModel.get(r.model)!.push(r.ai_triage_tier)
  }

  const disagreements: Array<{ sid: string; title: string; text: string; expected: string; got: Record<string, string> }> = []
  for (const [sid, entry] of byCase) {
    const exp = expected.get(sid)
    if (!exp) continue
    const got: Record<string, string> = {}
    let disagrees = false
    for (const [m, tiers] of entry.byModel) {
      got[m] = majority(tiers)
      if (got[m] !== exp) disagrees = true
    }
    if (disagrees) disagreements.push({ sid, title: entry.title, text: entry.text, expected: exp, got })
  }

  console.log(`grader: ${GRADER_MODEL}; disagreement cases: ${disagreements.length}\n`)
  for (const d of disagreements) {
    try {
      const verdict = await gradeReferral(d.text)
      console.log(`### ${d.sid} (${d.title})`)
      console.log(`expected: ${d.expected} | ${Object.entries(d.got).map(([m, t]) => `${m.split('.').pop()}: ${t}`).join(' | ')}`)
      console.log(`independent (${GRADER_MODEL}): ${verdict.tier} — ${verdict.rationale}\n`)
    } catch (e) {
      console.log(`### ${d.sid}: grader error: ${(e as Error).message}\n`)
    }
  }
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
