import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import { from } from '@/lib/db-query'

// GET /api/triage/validate/reviews — get all reviews (for results page)
export async function GET(req: NextRequest) {

  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const studyName = req.nextUrl.searchParams.get('study') || 'default'

  // Get case IDs for this study
  const { data: cases, error: casesError } = await from('validation_cases')
    .select('id')
    .eq('study_name', studyName)
    .eq('active', true)
    .eq('is_calibration', false)

  if (casesError) {
    return NextResponse.json({ error: casesError.message }, { status: 500 })
  }

  const caseIds = (cases || []).map((c: any) => c.id)

  if (caseIds.length === 0) {
    return NextResponse.json({ reviews: [] })
  }

  // Get all reviews for those cases
  const { data: reviews, error: reviewsError } = await from('validation_reviews')
    .select('*')
    .in('case_id', caseIds)
    .order('created_at', { ascending: true })

  if (reviewsError) {
    return NextResponse.json({ error: reviewsError.message }, { status: 500 })
  }

  return NextResponse.json({ reviews: reviews || [] })
}

// POST /api/triage/validate/reviews — submit a review
export async function POST(req: NextRequest) {

  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  const {
    case_id,
    triage_tier,
    subspecialty,
    redirect_to_non_neuro,
    redirect_specialty,
    confidence,
    key_factors,
    reasoning,
    started_at,
    duration_seconds,
  } = body

  if (!case_id || !triage_tier) {
    return NextResponse.json(
      { error: 'case_id and triage_tier are required' },
      { status: 400 }
    )
  }

  const validTiers = ['emergent', 'urgent', 'semi_urgent', 'routine_priority', 'routine', 'non_urgent', 'insufficient_data']
  if (!validTiers.includes(triage_tier)) {
    return NextResponse.json(
      { error: `Invalid triage_tier. Must be one of: ${validTiers.join(', ')}` },
      { status: 400 }
    )
  }

  // Verify the case exists
  const { data: caseData, error: caseError } = await from('validation_cases')
    .select('id')
    .eq('id', case_id)
    .single()

  if (caseError || !caseData) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }

  // Upsert the review (allows updating a previous review)
  const { data, error } = await from('validation_reviews')
    .upsert({
      case_id,
      reviewer_id: user.id,
      triage_tier,
      subspecialty: subspecialty || null,
      redirect_to_non_neuro: redirect_to_non_neuro || false,
      redirect_specialty: redirect_to_non_neuro ? (redirect_specialty || null) : null,
      confidence: confidence || null,
      key_factors: key_factors || [],
      reasoning: reasoning || null,
      started_at: started_at || null,
      duration_seconds: duration_seconds || null,
      completed_at: new Date().toISOString(),
    }, {
      onConflict: 'case_id,reviewer_id',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ review: data })
}
