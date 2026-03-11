#!/usr/bin/env tsx
/**
 * Local validation runner — calls Bedrock directly, no Amplify timeout.
 * Usage: npx tsx scripts/run-validation.ts <model-id> [--start-case N] [--no-clear]
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { calculateTriageTier, validateAIResponse } from '../src/lib/triage/scoring'
import { TRIAGE_SYSTEM_PROMPT, buildTriageUserPrompt } from '../src/lib/triage/systemPrompt'
import { AITriageResponse } from '../src/lib/triage/types'
import { Pool } from 'pg'

const args = process.argv.slice(2)
const MODEL = args.find(a => !a.startsWith('--')) || 'us.anthropic.claude-sonnet-4-6'
const START_CASE = Number(args.find(a => a.startsWith('--start-case='))?.split('=')[1] || 1)
const NO_CLEAR = args.includes('--no-clear')
const SKIP_EXISTING = args.includes('--skip-existing')
const RUN_COUNT = 3
const INCLUDE_BASELINE = true

const pool = new Pool({
  host: process.env.RDS_HOST,
  port: Number(process.env.RDS_PORT || 5432),
  user: process.env.RDS_USER,
  password: process.env.RDS_PASSWORD,
  database: process.env.RDS_DATABASE,
  ssl: { rejectUnauthorized: false },
  keepAlive: true,
  idleTimeoutMillis: 0,
})

// Prevent unhandled pool errors from crashing the process
pool.on('error', (err) => {
  console.error('Pool error (will reconnect):', err.message)
})

// Direct Bedrock client (no timeout wrapper from runTriage)
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.BEDROCK_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.BEDROCK_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
    ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
  },
})

async function callBedrock(referralText: string, patientAge: number | null, patientSex: string | null, temperature: number) {
  const userPrompt = buildTriageUserPrompt(referralText, {
    patientAge: patientAge ?? undefined,
    patientSex: patientSex ?? undefined,
  })

  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    system: TRIAGE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    max_tokens: 4000,
    temperature,
  })

  const command = new InvokeModelCommand({
    modelId: MODEL,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(body),
  })

  // 90-second timeout per Bedrock call to prevent hanging
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90000)

  let response
  try {
    response = await bedrockClient.send(command, { abortSignal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
  const responseBody = JSON.parse(new TextDecoder().decode(response.body))
  const text = responseBody.content?.[0]?.text || ''

  // Parse JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in response')

  const parsed = JSON.parse(jsonMatch[0])
  const validationError = validateAIResponse(parsed)
  if (validationError) throw new Error(`AI response validation failed: ${validationError}`)

  const aiResponse = parsed as AITriageResponse
  const scoring = calculateTriageTier(aiResponse)

  return {
    triage_tier: scoring.tier,
    weighted_score: scoring.weightedScore,
    dimension_scores: aiResponse.dimension_scores,
    subspecialty_recommendation: aiResponse.subspecialty_recommendation,
    redirect_to_non_neuro: aiResponse.redirect_to_non_neuro || false,
    redirect_specialty: aiResponse.redirect_specialty || null,
    confidence: aiResponse.confidence,
    raw: parsed,
  }
}

async function main() {
  console.log(`\n=== Validation Runner: ${MODEL} ===`)
  console.log(`Runs per case: ${RUN_COUNT} standard + ${INCLUDE_BASELINE ? '1 baseline' : 'no baseline'}`)
  console.log(`Starting from case ${START_CASE}, ${NO_CLEAR ? 'preserving' : 'clearing'} previous runs`)
  console.log(`Running SEQUENTIALLY to avoid throttling\n`)

  const { rows: cases } = await pool.query(
    `SELECT id, case_number, title, referral_text, patient_age, patient_sex
     FROM validation_cases WHERE active = true AND case_number >= $1 ORDER BY case_number`,
    [START_CASE]
  )
  console.log(`Found ${cases.length} cases to process (starting from case ${START_CASE})\n`)

  if (!NO_CLEAR) {
    const caseIds = cases.map((c: { id: string }) => c.id)
    const { rowCount } = await pool.query(
      `DELETE FROM validation_ai_runs WHERE model = $1 AND case_id = ANY($2::uuid[])`,
      [MODEL, caseIds]
    )
    console.log(`Cleared ${rowCount} previous runs for ${MODEL} (cases ${START_CASE}+)\n`)
  } else {
    console.log(`Skipping clear — preserving existing data\n`)
  }

  let totalSuccess = 0
  let totalFail = 0

  for (const c of cases) {
    const runs: Array<{ run_number: number; temperature: number }> = []
    if (INCLUDE_BASELINE) runs.push({ run_number: 0, temperature: 0 })
    for (let i = 1; i <= RUN_COUNT; i++) runs.push({ run_number: i, temperature: 0.2 })

    process.stdout.write(`Case ${c.case_number} (${c.title.slice(0, 40)}): `)

    let ok = 0, fail = 0

    // Run SEQUENTIALLY to avoid Bedrock throttling
    for (const run of runs) {
      // Skip runs that already exist in DB
      if (SKIP_EXISTING) {
        const { rows: existing } = await pool.query(
          `SELECT 1 FROM validation_ai_runs WHERE case_id=$1 AND run_number=$2 AND model=$3 AND error IS NULL`,
          [c.id, run.run_number, MODEL]
        )
        if (existing.length > 0) {
          ok++
          continue
        }
      }

      const startTime = Date.now()
      try {
        const data = await callBedrock(c.referral_text, c.patient_age, c.patient_sex, run.temperature)
        const durationMs = Date.now() - startTime

        await pool.query(
          `INSERT INTO validation_ai_runs
           (case_id, run_number, model, temperature, ai_triage_tier, ai_weighted_score,
            ai_dimension_scores, ai_subspecialty, ai_redirect_to_non_neuro, ai_redirect_specialty,
            ai_confidence, ai_session_id, ai_raw_response, duration_ms, error)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (case_id, run_number, model)
           DO UPDATE SET temperature=EXCLUDED.temperature, ai_triage_tier=EXCLUDED.ai_triage_tier,
            ai_weighted_score=EXCLUDED.ai_weighted_score, ai_dimension_scores=EXCLUDED.ai_dimension_scores,
            ai_subspecialty=EXCLUDED.ai_subspecialty, ai_redirect_to_non_neuro=EXCLUDED.ai_redirect_to_non_neuro,
            ai_redirect_specialty=EXCLUDED.ai_redirect_specialty, ai_confidence=EXCLUDED.ai_confidence,
            ai_raw_response=EXCLUDED.ai_raw_response, duration_ms=EXCLUDED.duration_ms, error=NULL`,
          [
            c.id, run.run_number, MODEL, run.temperature,
            data.triage_tier, data.weighted_score,
            JSON.stringify(data.dimension_scores), data.subspecialty_recommendation,
            data.redirect_to_non_neuro, data.redirect_specialty,
            data.confidence, null, JSON.stringify(data.raw), durationMs, null,
          ]
        )
        ok++
      } catch (err) {
        const durationMs = Date.now() - startTime
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'

        await pool.query(
          `INSERT INTO validation_ai_runs (case_id, run_number, model, temperature, duration_ms, error)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (case_id, run_number, model)
           DO UPDATE SET duration_ms=EXCLUDED.duration_ms, error=EXCLUDED.error`,
          [c.id, run.run_number, MODEL, run.temperature, durationMs, errorMsg]
        )
        fail++
      }
    }

    totalSuccess += ok
    totalFail += fail
    console.log(`${ok} ok, ${fail} fail`)
  }

  console.log(`\n=== DONE: ${totalSuccess} success, ${totalFail} failed ===`)
  await pool.end()
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
