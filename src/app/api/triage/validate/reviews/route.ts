import { NextRequest, NextResponse } from 'next/server'
import { authorizeValidationStudy, lockedValidationResponse } from '@/lib/triage/validationAccess'
import { from } from '@/lib/db-query'
import { NEURO_SUBSPECIALTIES, NON_NEURO_SPECIALTIES } from '@/lib/triage/types'

// GET /api/triage/validate/reviews — get all reviews (for results page)
export async function GET(req: NextRequest) {

  const studyName = req.nextUrl.searchParams.get('study') || 'default'
  const access = await authorizeValidationStudy(studyName, 'results')
  if (!access.ok) return access.response

  // Get case IDs for this study
  const { data: cases, error: casesError } = await from('validation_cases')
    .select('id')
    .eq('study_name', studyName)
    .eq('active', true)
    .eq('is_calibration', false)

  if (casesError) {
    return NextResponse.json({ error: 'Unable to read study cases' }, { status: 500 })
  }

  const caseIds = (cases || []).map((c: { id: string }) => c.id)

  if (caseIds.length === 0) {
    return NextResponse.json({ reviews: [] })
  }

  // Get all reviews for those cases
  const { data: reviews, error: reviewsError } = await from('validation_reviews')
    .select('*')
    .in('case_id', caseIds)
    .order('created_at', { ascending: true })

  if (reviewsError) {
    return NextResponse.json({ error: 'Unable to read study reviews' }, { status: 500 })
  }

  return NextResponse.json({ reviews: reviews || [] })
}

// POST /api/triage/validate/reviews — submit a review
export async function POST(req: NextRequest) {

  const studyName = req.nextUrl.searchParams.get('study') || 'default'
  const access = await authorizeValidationStudy(studyName)
  if (!access.ok) return access.response
  if (access.phase !== 'labeling' || access.memberRole !== 'reviewer' || !['physician','triage_nurse','operational'].includes(access.reviewerKind)) return lockedValidationResponse()
  const user = { id: access.context.userId }
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid review' }, { status: 400 })
  }

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
    comfortable_with_wait,
  } = body

  if (!['high','moderate','low'].includes(confidence) || !['yes','no','uncertain'].includes(comfortable_with_wait) || typeof case_id !== 'string' || !case_id || case_id.length > 100 || !triage_tier) {
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

  const optionalText = (value: unknown, max: number) => value == null || (typeof value === 'string' && value.length <= max)
  if ((subspecialty != null && !NEURO_SUBSPECIALTIES.includes(subspecialty)) ||
      (redirect_to_non_neuro !== undefined && typeof redirect_to_non_neuro !== 'boolean') ||
      (redirect_to_non_neuro && !NON_NEURO_SPECIALTIES.includes(redirect_specialty)) ||
      (confidence != null && !['high','moderate','low'].includes(confidence)) ||
      !optionalText(reasoning, 5000) ||
      (key_factors !== undefined && (!Array.isArray(key_factors) || key_factors.length > 30 || key_factors.some((f: unknown) => typeof f !== 'string' || f.length > 500))) ||
      (started_at != null && (typeof started_at !== 'string' || started_at.length > 40 || !Number.isFinite(Date.parse(started_at)))) ||
      (duration_seconds != null && (!Number.isInteger(duration_seconds) || duration_seconds < 0 || duration_seconds > 86400))) {
    return NextResponse.json({ error: 'Invalid review fields' }, { status: 400 })
  }

  // Verify the case exists
  const { data: caseData, error: caseError } = await from('validation_cases')
    .select('id')
    .eq('id', case_id)
    .eq('study_name', studyName)
    .eq('active', true)
    .single()

  if (caseError || !caseData) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }

  // Insert once: submitted independent judgments cannot be overwritten.
  const { data, error } = await from('validation_reviews')
    .insert({
      case_id,
      reviewer_id: user.id,
      comfortable_with_wait,
      reviewer_kind: access.reviewerKind,
      label_context: 'independent_blinded',
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
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Review could not be saved; submitted reviews are locked' }, { status: error.code === '23505' || error.code === '55000' ? 409 : 500 })
  }

  return NextResponse.json({ review: data })
}
