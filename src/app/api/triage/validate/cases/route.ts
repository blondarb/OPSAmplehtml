import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { from } from '@/lib/db-query'

// GET /api/triage/validate/cases — list validation cases with reviewer's completion status
export async function GET(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const studyName = req.nextUrl.searchParams.get('study') || 'default'

  // Fetch all active cases for this study
  const { data: cases, error: casesError } = await from('validation_cases')
    .select('*')
    .eq('study_name', studyName)
    .eq('active', true)
    .order('case_number', { ascending: true })

  if (casesError) {
    return NextResponse.json({ error: casesError.message }, { status: 500 })
  }

  // Fetch this reviewer's reviews
  const { data: reviews, error: reviewsError } = await from('validation_reviews')
    .select('*')
    .eq('reviewer_id', user.id)
    .in('case_id', (cases || []).map((c: any) => c.id))

  if (reviewsError) {
    return NextResponse.json({ error: reviewsError.message }, { status: 500 })
  }

  const reviewMap = new Map((reviews || []).map((r: any) => [r.case_id, r]))

  const casesWithStatus = (cases || []).map((c: any) => ({
    ...c,
    reviewed: reviewMap.has(c.id),
    review: reviewMap.get(c.id) || undefined,
  }))

  return NextResponse.json({
    cases: casesWithStatus,
    total: casesWithStatus.length,
    completed: casesWithStatus.filter((c: any) => c.reviewed).length,
    calibration_count: casesWithStatus.filter((c: any) => c.is_calibration).length,
  })
}

// POST /api/triage/validate/cases — add new validation cases (admin/setup)
export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  // Support single case or batch
  const cases: Array<{
    case_number: number
    title: string
    referral_text: string
    patient_age?: number
    patient_sex?: string
    study_name?: string
    is_calibration?: boolean
    ai_triage_tier?: string
    ai_weighted_score?: number
    ai_dimension_scores?: unknown
    ai_subspecialty?: string
    ai_confidence?: string
    ai_session_id?: string
  }> = Array.isArray(body) ? body : [body]

  if (cases.length === 0) {
    return NextResponse.json({ error: 'No cases provided' }, { status: 400 })
  }

  // Validate required fields
  for (const c of cases) {
    if (!c.case_number || !c.title || !c.referral_text) {
      return NextResponse.json(
        { error: 'Each case requires case_number, title, and referral_text' },
        { status: 400 }
      )
    }
  }

  const rows = cases.map(c => ({
    case_number: c.case_number,
    title: c.title,
    referral_text: c.referral_text,
    patient_age: c.patient_age ?? null,
    patient_sex: c.patient_sex ?? null,
    study_name: c.study_name || 'default',
    is_calibration: c.is_calibration ?? false,
    ai_triage_tier: c.ai_triage_tier ?? null,
    ai_weighted_score: c.ai_weighted_score ?? null,
    ai_dimension_scores: c.ai_dimension_scores ?? null,
    ai_subspecialty: c.ai_subspecialty ?? null,
    ai_confidence: c.ai_confidence ?? null,
    ai_session_id: c.ai_session_id ?? null,
  }))

  const { data, error } = await from('validation_cases')
    .upsert(rows, { onConflict: 'study_name,case_number' })
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ cases: data, count: data?.length ?? 0 })
}
