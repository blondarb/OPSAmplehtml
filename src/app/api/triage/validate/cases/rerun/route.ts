import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runTriage } from '@/lib/triage/runTriage'

/**
 * POST /api/triage/validate/cases/rerun
 *
 * Re-runs one or more validation cases through the AI triage algorithm
 * multiple times to measure consistency. Stores each run in validation_ai_runs.
 *
 * Uses the shared runTriage() function directly instead of HTTP self-fetch
 * to avoid serverless deadlocks on Vercel.
 *
 * Body:
 *   {
 *     case_ids: string[]          — which cases to re-run
 *     run_count: number           — how many standard (temp=0.2) runs (default 3)
 *     include_baseline: boolean   — also run once at temp=0 (default true)
 *     clear_previous: boolean     — delete previous runs for these cases first (default true)
 *   }
 *
 * Returns progress as results come in (non-streaming — waits for all).
 */
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const {
    case_ids,
    run_count = 3,
    include_baseline = true,
    clear_previous = true,
  } = body

  if (!Array.isArray(case_ids) || case_ids.length === 0) {
    return NextResponse.json({ error: 'case_ids is required (array of UUIDs)' }, { status: 400 })
  }

  if (run_count < 1 || run_count > 10) {
    return NextResponse.json({ error: 'run_count must be between 1 and 10' }, { status: 400 })
  }

  // Fetch the cases
  const { data: cases, error: fetchError } = await supabase
    .from('validation_cases')
    .select('id, case_number, title, referral_text, patient_age, patient_sex')
    .in('id', case_ids)

  if (fetchError || !cases || cases.length === 0) {
    return NextResponse.json({ error: 'No matching cases found' }, { status: 404 })
  }

  // Optionally clear previous runs
  if (clear_previous) {
    await supabase
      .from('validation_ai_runs')
      .delete()
      .in('case_id', case_ids)
  }

  const allResults: Array<{
    case_id: string
    case_number: number
    title: string
    runs: Array<{
      run_number: number
      temperature: number
      status: 'success' | 'error'
      ai_tier?: string
      ai_score?: number | null
      ai_confidence?: string
      duration_ms?: number
      error?: string
    }>
  }> = []

  for (const c of cases) {
    const caseRuns: typeof allResults[0]['runs'] = []

    // Determine which runs to perform
    const runsToPerform: Array<{ run_number: number; temperature: number }> = []

    if (include_baseline) {
      runsToPerform.push({ run_number: 0, temperature: 0 })
    }
    for (let i = 1; i <= run_count; i++) {
      runsToPerform.push({ run_number: i, temperature: 0.2 })
    }

    for (const run of runsToPerform) {
      const startTime = Date.now()

      try {
        // Call triage logic directly — no HTTP self-fetch
        const data = await runTriage({
          referral_text: c.referral_text,
          patient_age: c.patient_age,
          patient_sex: c.patient_sex,
          temperature: run.temperature,
        })

        const durationMs = Date.now() - startTime

        // Store in validation_ai_runs
        await supabase.from('validation_ai_runs').upsert({
          case_id: c.id,
          run_number: run.run_number,
          temperature: run.temperature,
          ai_triage_tier: data.triage_tier,
          ai_weighted_score: data.weighted_score,
          ai_dimension_scores: data.dimension_scores,
          ai_subspecialty: data.subspecialty_recommendation,
          ai_redirect_to_non_neuro: data.redirect_to_non_neuro || false,
          ai_redirect_specialty: data.redirect_specialty || null,
          ai_confidence: data.confidence,
          ai_session_id: data.session_id,
          ai_raw_response: data,
          duration_ms: durationMs,
          error: null,
        }, { onConflict: 'case_id,run_number' })

        caseRuns.push({
          run_number: run.run_number,
          temperature: run.temperature,
          status: 'success',
          ai_tier: data.triage_tier,
          ai_score: data.weighted_score,
          ai_confidence: data.confidence,
          duration_ms: durationMs,
        })
      } catch (err) {
        const durationMs = Date.now() - startTime
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'

        await supabase.from('validation_ai_runs').upsert({
          case_id: c.id,
          run_number: run.run_number,
          temperature: run.temperature,
          duration_ms: durationMs,
          error: errorMsg,
        }, { onConflict: 'case_id,run_number' })

        caseRuns.push({
          run_number: run.run_number,
          temperature: run.temperature,
          status: 'error',
          duration_ms: durationMs,
          error: errorMsg,
        })
      }
    }

    allResults.push({
      case_id: c.id,
      case_number: c.case_number,
      title: c.title,
      runs: caseRuns,
    })
  }

  // Summary statistics
  const totalRuns = allResults.reduce((sum, c) => sum + c.runs.length, 0)
  const successfulRuns = allResults.reduce(
    (sum, c) => sum + c.runs.filter(r => r.status === 'success').length, 0
  )

  return NextResponse.json({
    total_cases: allResults.length,
    total_runs: totalRuns,
    successful_runs: successfulRuns,
    failed_runs: totalRuns - successfulRuns,
    results: allResults,
  })
}
