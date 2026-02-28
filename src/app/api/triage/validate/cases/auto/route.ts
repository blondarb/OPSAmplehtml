import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/triage/validate/cases/auto
 *
 * Runs a note through the AI triage algorithm, then creates a validation case
 * with the AI results pre-populated. Accepts a single note or a batch.
 *
 * Body (single):
 *   { referral_text, title?, patient_age?, patient_sex?, case_number?, study_name?, is_calibration? }
 *
 * Body (batch):
 *   { notes: [{ referral_text, title?, patient_age?, patient_sex? }], study_name?, start_case_number? }
 */
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  // Determine if batch or single
  const isBatch = Array.isArray(body.notes)
  const studyName = body.study_name || 'default'

  // Get the current max case_number for this study to auto-increment
  const { data: maxCase } = await supabase
    .from('validation_cases')
    .select('case_number')
    .eq('study_name', studyName)
    .order('case_number', { ascending: false })
    .limit(1)
    .single()

  let nextCaseNumber = body.start_case_number || (maxCase?.case_number ? maxCase.case_number + 1 : 1)

  // Build the list of notes to process
  interface NoteInput {
    referral_text: string
    title?: string
    patient_age?: number
    patient_sex?: string
    case_number?: number
    is_calibration?: boolean
  }

  const notes: NoteInput[] = isBatch ? body.notes : [body]

  if (notes.length === 0) {
    return NextResponse.json({ error: 'No notes provided' }, { status: 400 })
  }

  // Determine the base URL for internal API calls
  const protocol = req.headers.get('x-forwarded-proto') || 'http'
  const host = req.headers.get('host') || 'localhost:3000'
  const baseUrl = `${protocol}://${host}`

  // Forward cookies for authentication
  const cookieHeader = req.headers.get('cookie') || ''

  const results: Array<{
    case_number: number
    title: string
    status: 'success' | 'error'
    ai_tier?: string
    ai_score?: number
    error?: string
    case_id?: string
  }> = []

  for (const note of notes) {
    if (!note.referral_text || note.referral_text.trim().length < 10) {
      results.push({
        case_number: note.case_number || nextCaseNumber,
        title: note.title || `Case ${note.case_number || nextCaseNumber}`,
        status: 'error',
        error: 'Referral text too short (minimum 10 characters)',
      })
      nextCaseNumber++
      continue
    }

    const caseNum = note.case_number || nextCaseNumber
    const title = note.title || `Case ${caseNum}`

    try {
      // Call the triage API
      const triageRes = await fetch(`${baseUrl}/api/triage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookieHeader,
        },
        body: JSON.stringify({
          referral_text: note.referral_text,
          patient_age: note.patient_age,
          patient_sex: note.patient_sex,
        }),
      })

      let aiTier = null
      let aiScore = null
      let aiDimensionScores = null
      let aiSubspecialty = null
      let aiRedirectToNonNeuro = false
      let aiRedirectSpecialty = null
      let aiConfidence = null
      let aiSessionId = null

      if (triageRes.ok) {
        const triageData = await triageRes.json()
        aiTier = triageData.triage_tier
        aiScore = triageData.weighted_score
        aiDimensionScores = triageData.dimension_scores
        aiSubspecialty = triageData.subspecialty_recommendation
        aiRedirectToNonNeuro = triageData.redirect_to_non_neuro || false
        aiRedirectSpecialty = triageData.redirect_specialty || null
        aiConfidence = triageData.confidence
        aiSessionId = triageData.session_id
      } else {
        // AI triage failed — still create the case, just without AI results
        const errData = await triageRes.json().catch(() => ({}))
        console.warn(`AI triage failed for case ${caseNum}:`, errData.error)
      }

      // Create the validation case
      const { data: caseData, error: insertError } = await supabase
        .from('validation_cases')
        .upsert({
          case_number: caseNum,
          title,
          referral_text: note.referral_text,
          patient_age: note.patient_age || null,
          patient_sex: note.patient_sex || null,
          study_name: studyName,
          is_calibration: note.is_calibration || false,
          ai_triage_tier: aiTier,
          ai_weighted_score: aiScore,
          ai_dimension_scores: aiDimensionScores,
          ai_subspecialty: aiSubspecialty,
          ai_redirect_to_non_neuro: aiRedirectToNonNeuro,
          ai_redirect_specialty: aiRedirectSpecialty,
          ai_confidence: aiConfidence,
          ai_session_id: aiSessionId,
        }, { onConflict: 'study_name,case_number' })
        .select('id')
        .single()

      if (insertError) {
        results.push({ case_number: caseNum, title, status: 'error', error: insertError.message })
      } else {
        results.push({
          case_number: caseNum,
          title,
          status: 'success',
          ai_tier: aiTier || undefined,
          ai_score: aiScore || undefined,
          case_id: caseData?.id,
        })
      }
    } catch (err) {
      results.push({
        case_number: caseNum,
        title,
        status: 'error',
        error: err instanceof Error ? err.message : 'Processing failed',
      })
    }

    nextCaseNumber = caseNum + 1
  }

  const successCount = results.filter(r => r.status === 'success').length
  const errorCount = results.filter(r => r.status === 'error').length

  return NextResponse.json({
    total: results.length,
    success: successCount,
    errors: errorCount,
    results,
  })
}
