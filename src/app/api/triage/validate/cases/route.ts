import { NextRequest, NextResponse } from 'next/server'
import { authorizeValidationStudy, BLINDED_CASE_FIELDS, lockedValidationResponse } from '@/lib/triage/validationAccess'
import { from } from '@/lib/db-query'

// GET /api/triage/validate/cases — list validation cases with reviewer's completion status
export async function GET(req: NextRequest) {

  const studyName = req.nextUrl.searchParams.get('study') || 'default'
  const access = await authorizeValidationStudy(studyName, 'review')
  if (!access.ok) return access.response
  const user = { id: access.context.userId }

  // Fetch all active cases for this study
  const { data: cases, error: casesError } = await from('validation_cases')
    .select(BLINDED_CASE_FIELDS)
    .eq('study_name', studyName)
    .eq('active', true)
    .order('case_number', { ascending: true })

  if (casesError) {
    return NextResponse.json({ error: 'Unable to read study cases' }, { status: 500 })
  }

  // Fetch this reviewer's reviews
  const { data: reviews, error: reviewsError } = await from('validation_reviews')
    .select('*')
    .eq('reviewer_id', user.id)
    .in('case_id', (cases || []).map((c: { id: string; is_calibration: boolean }) => c.id))

  if (reviewsError) {
    return NextResponse.json({ error: 'Unable to read your reviews' }, { status: 500 })
  }

  const reviewMap = new Map((reviews || []).map((r: { case_id: string }) => [r.case_id, r]))

  const casesWithStatus = (cases || []).map((c: { id: string; is_calibration: boolean }) => ({
    ...c,
    title: `Case ${String((c as unknown as { case_number: number }).case_number)}`,
    reviewed: reviewMap.has(c.id),
    review: reviewMap.get(c.id) || undefined,
  }))

  return NextResponse.json({
    cases: casesWithStatus,
    phase: access.phase, study_kind: access.studyKind, member_role: access.memberRole, reviewer_kind: access.reviewerKind,
    total: casesWithStatus.length,
    completed: casesWithStatus.filter((c: { reviewed: boolean }) => c.reviewed).length,
    calibration_count: casesWithStatus.filter((c: { id: string; is_calibration: boolean }) => c.is_calibration).length,
  })
}

// Insert-only draft setup. Existing study records are never overwritten.
export async function POST(req: NextRequest) {
  const studyName = req.nextUrl.searchParams.get('study') || 'default'
  const access = await authorizeValidationStudy(studyName, 'manage')
  if (!access.ok) return access.response
  if (access.phase !== 'draft') return lockedValidationResponse()
  const body = await req.json().catch(() => null)
  const cases = Array.isArray(body) ? body : [body]
  if (!cases.length || cases.length > 100 || cases.some(c =>
    !c || typeof c !== 'object' || !Number.isInteger(c.case_number) || c.case_number < 1 ||
    typeof c.title !== 'string' || !c.title.trim() || c.title.length > 500 ||
    typeof c.referral_text !== 'string' || !c.referral_text.trim() || c.referral_text.length > 50000 ||
    (c.study_name !== undefined && c.study_name !== studyName) ||
    (c.patient_age != null && (!Number.isInteger(c.patient_age) || c.patient_age < 18 || c.patient_age > 120)) ||
    (c.patient_sex != null && (typeof c.patient_sex !== 'string' || c.patient_sex.length > 50)) ||
    (c.is_calibration !== undefined && typeof c.is_calibration !== 'boolean') ||
    Object.keys(c).some(key => !['case_number','title','referral_text','study_name','patient_age','patient_sex','is_calibration'].includes(key))
  )) return NextResponse.json({ error: 'Invalid source-only case batch' }, { status: 400 })
  const rows = cases.map(c => ({
    case_number: c.case_number, title: c.title.trim(), referral_text: c.referral_text,
    patient_age: c.patient_age ?? null, patient_sex: c.patient_sex ?? null,
    study_name: studyName, is_calibration: c.is_calibration ?? false,
  }))
  const { data, error } = await from('validation_cases').insert(rows).select(BLINDED_CASE_FIELDS)
  if (error) return NextResponse.json({ error: 'Case insertion failed; existing cases cannot be replaced' },
    { status: error.code === '23505' || error.code === '55000' ? 409 : 500 })
  return NextResponse.json({ cases: data, count: data?.length ?? 0 }, { status: 201 })
}
