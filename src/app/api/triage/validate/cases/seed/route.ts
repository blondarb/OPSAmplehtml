import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { DEMO_SCENARIOS } from '@/lib/triage/demoScenarios'
import { from } from '@/lib/db-query'
import { isDemoEndpointsEnabled } from '@/lib/appMode'

/**
 * POST /api/triage/validate/cases/seed
 *
 * Seeds validation cases from the existing demo scenarios in demoScenarios.ts.
 * Each scenario's first file previewText is used as the referral note.
 * Cases are run through AI triage to populate baseline AI results.
 *
 * Body (optional):
 *   { study_name?: string, run_ai?: boolean, clear_existing?: boolean }
 *
 * - study_name: defaults to 'default'
 * - run_ai: if true, each case is run through the triage API (default true)
 * - clear_existing: if true, deletes existing cases for this study first (default false)
 */
export const maxDuration = 300

export async function POST(req: NextRequest) {

  if (!isDemoEndpointsEnabled()) {
    return NextResponse.json({ error: 'Demo endpoints are disabled' }, { status: 403 })
  }

  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const studyName = body.study_name || 'default'
  const runAi = body.run_ai !== false  // default true
  const clearExisting = body.clear_existing === true

  // Optionally clear existing cases
  if (clearExisting) {
    await from('validation_cases')
      .delete()
      .eq('study_name', studyName)
  }

  // Build internal API URL for AI triage
  const protocol = req.headers.get('x-forwarded-proto') || 'http'
  const host = req.headers.get('host') || 'localhost:3000'
  const baseUrl = `${protocol}://${host}`
  const cookieHeader = req.headers.get('cookie') || ''

  const results: Array<{
    case_number: number
    title: string
    scenario_id: string
    status: 'created' | 'updated' | 'error'
    ai_tier?: string
    ai_score?: number
    error?: string
  }> = []

  let caseNumber = 1

  for (const scenario of DEMO_SCENARIOS) {
    // Use the first file's previewText as the referral note
    // For multi-file scenarios (packets), concatenate all files
    const referralText = scenario.files
      .map(f => f.previewText)
      .join('\n\n--- Next Document ---\n\n')

    if (!referralText || referralText.trim().length < 50) {
      results.push({
        case_number: caseNumber,
        title: `${scenario.patientName} — ${scenario.briefDescription}`,
        scenario_id: scenario.id,
        status: 'error',
        error: 'Referral text too short',
      })
      caseNumber++
      continue
    }

    const title = `${scenario.patientName} — ${scenario.briefDescription}`

    let aiTier = null
    let aiScore = null
    let aiDimensionScores = null
    let aiSubspecialty = null
    let aiRedirectToNonNeuro = false
    let aiRedirectSpecialty = null
    let aiConfidence = null
    let aiSessionId = null

    // Run AI triage if enabled
    if (runAi) {
      try {
        const triageRes = await fetch(`${baseUrl}/api/triage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': cookieHeader,
          },
          body: JSON.stringify({
            referral_text: referralText,
            patient_age: scenario.age,
            patient_sex: scenario.sex,
          }),
        })

        if (triageRes.ok) {
          const started = await triageRes.json()
          aiSessionId = started.session_id ?? null
          // /api/triage is async: the POST returns 202 + session_id with NO
          // tier. Read the tier from the response only if a legacy synchronous
          // path ever returns it; otherwise poll the result endpoint until the
          // pipeline reaches a terminal state. (Without this, every case is
          // seeded with a null ai_triage_tier — the prior behavior.)
          const applyResult = (r: {
            triage_tier?: string | null
            weighted_score?: number | null
            dimension_scores?: unknown
            subspecialty_recommendation?: string | null
            redirect_to_non_neuro?: boolean
            redirect_specialty?: string | null
            confidence?: string | null
          }) => {
            aiTier = r.triage_tier ?? null
            aiScore = r.weighted_score ?? null
            aiDimensionScores = r.dimension_scores ?? null
            aiSubspecialty = r.subspecialty_recommendation ?? null
            aiRedirectToNonNeuro = r.redirect_to_non_neuro || false
            aiRedirectSpecialty = r.redirect_specialty || null
            aiConfidence = r.confidence ?? null
          }
          if (started.triage_tier) {
            applyResult(started)
          } else if (aiSessionId) {
            const deadline = Date.now() + 90_000
            while (Date.now() < deadline) {
              await new Promise((resolve) => setTimeout(resolve, 1500))
              const pollRes = await fetch(
                `${baseUrl}/api/triage/${encodeURIComponent(aiSessionId)}`,
                { headers: { Cookie: cookieHeader } },
              )
              if (!pollRes.ok) continue
              const result = await pollRes.json()
              if (result.status === 'pending') continue
              if (result.status === 'error') {
                console.warn(
                  `AI triage error for ${scenario.id}:`,
                  result.error,
                )
                break
              }
              applyResult(result) // status === 'complete'
              break
            }
            if (aiTier === null) {
              console.warn(
                `AI triage did not complete within 90s for ${scenario.id}`,
              )
            }
          }
        } else {
          const errData = await triageRes.json().catch(() => ({}))
          console.warn(`AI triage failed for ${scenario.id}:`, errData.error)
        }
      } catch (err) {
        console.warn(`AI triage error for ${scenario.id}:`, err)
      }
    }

    // Upsert into validation_cases
    const { error: insertError } = await from('validation_cases')
      .upsert({
        case_number: caseNumber,
        title,
        referral_text: referralText,
        patient_age: scenario.age,
        patient_sex: scenario.sex,
        study_name: studyName,
        is_calibration: false,
        ai_triage_tier: aiTier,
        ai_weighted_score: aiScore,
        ai_dimension_scores: aiDimensionScores,
        ai_subspecialty: aiSubspecialty,
        ai_redirect_to_non_neuro: aiRedirectToNonNeuro,
        ai_redirect_specialty: aiRedirectSpecialty,
        ai_confidence: aiConfidence,
        ai_session_id: aiSessionId,
      }, { onConflict: 'study_name,case_number' })

    if (insertError) {
      results.push({
        case_number: caseNumber,
        title,
        scenario_id: scenario.id,
        status: 'error',
        error: insertError.message,
      })
    } else {
      results.push({
        case_number: caseNumber,
        title,
        scenario_id: scenario.id,
        status: clearExisting ? 'created' : 'updated',
        ai_tier: aiTier || undefined,
        ai_score: aiScore || undefined,
      })
    }

    caseNumber++
  }

  const successCount = results.filter(r => r.status !== 'error').length
  const withAi = results.filter(r => r.ai_tier).length

  return NextResponse.json({
    total_scenarios: DEMO_SCENARIOS.length,
    seeded: successCount,
    with_ai_results: withAi,
    errors: results.filter(r => r.status === 'error').length,
    study_name: studyName,
    results,
  })
}
