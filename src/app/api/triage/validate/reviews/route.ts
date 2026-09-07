import { NextRequest, NextResponse } from 'next/server'
import { authorizeValidationStudy, lockedValidationResponse } from '@/lib/triage/validationAccess'
import { from } from '@/lib/db-query'
import { NEURO_SUBSPECIALTIES, NON_NEURO_SPECIALTIES } from '@/lib/triage/types'
import {
  CLINICAL_ASSESSMENT_ACTIONS,
  CLINICAL_ASSESSMENT_LEGACY_TIERS,
  CLINICAL_ASSESSMENT_INTERVAL_UNITS,
  CLINICAL_ASSESSMENT_ORIGINS,
  IMMEDIATE_CLINICAL_ASSESSMENT_ACTIONS,
  type ClinicalAssessment,
} from '@/lib/triage/validationTypes'

const MAX_INTERVAL_BY_UNIT = { minutes: 10080, hours: 8760, days: 3650, weeks: 520 } as const
const GOVERNED_SERVICES: readonly string[] = [...NEURO_SUBSPECIALTIES, ...NON_NEURO_SPECIALTIES]

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every(key => keys.includes(key))
}

function validateClinicalAssessment(value: unknown): value is ClinicalAssessment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const assessment = value as Record<string, unknown>
  if (!hasOnlyKeys(assessment, ['version', 'action', 'latest_safe_assessment', 'services', 'decisive_missing_facts']) ||
      assessment.version !== 'v1' || !CLINICAL_ASSESSMENT_ACTIONS.includes(assessment.action as ClinicalAssessment['action']) ||
      !Array.isArray(assessment.services) || assessment.services.length > 12 ||
      assessment.services.some(service => typeof service !== 'string' || !GOVERNED_SERVICES.includes(service)) ||
      !Array.isArray(assessment.decisive_missing_facts) || assessment.decisive_missing_facts.length > 12 ||
      assessment.decisive_missing_facts.some(fact => typeof fact !== 'string' || !fact.trim() || fact.length > 500)) return false
  const timing = assessment.latest_safe_assessment
  if (!timing || typeof timing !== 'object' || Array.isArray(timing)) return false
  const latest = timing as Record<string, unknown>
  if (!CLINICAL_ASSESSMENT_ORIGINS.includes(latest.origin as ClinicalAssessment['latest_safe_assessment']['origin']) ||
      !hasOnlyKeys(latest, ['origin', 'interval', 'anchor']) ||
      (latest.anchor !== undefined && (typeof latest.anchor !== 'string' || !latest.anchor.trim() || latest.anchor.length > 200))) return false
  const interval = latest.interval
  const immediate = IMMEDIATE_CLINICAL_ASSESSMENT_ACTIONS.includes(assessment.action as typeof IMMEDIATE_CLINICAL_ASSESSMENT_ACTIONS[number])
  if (latest.origin === 'unknown') return !immediate && interval === undefined && latest.anchor === undefined
  if (!interval || typeof interval !== 'object' || Array.isArray(interval)) return false
  const bounded = interval as Record<string, unknown>
  if (!hasOnlyKeys(bounded, ['value', 'unit']) || typeof bounded.value !== 'number' || !Number.isFinite(bounded.value) || !Number.isInteger(bounded.value) || typeof bounded.unit !== 'string' ||
    !CLINICAL_ASSESSMENT_INTERVAL_UNITS.includes(bounded.unit as keyof typeof MAX_INTERVAL_BY_UNIT)) return false
  return immediate
    ? latest.origin === 'decision_time' && latest.anchor === undefined && bounded.value === 0 && bounded.unit === 'minutes'
    : bounded.value > 0 && bounded.value <= MAX_INTERVAL_BY_UNIT[bounded.unit as keyof typeof MAX_INTERVAL_BY_UNIT]
}

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
    clinical_assessment,
  } = body

  if (!['high','moderate','low'].includes(confidence) || !['yes','no','uncertain'].includes(comfortable_with_wait) || typeof case_id !== 'string' || !case_id || case_id.length > 100 || !triage_tier || !validateClinicalAssessment(clinical_assessment)) {
    return NextResponse.json(
      { error: 'A complete versioned clinical assessment, case_id, and triage_tier are required' },
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
  const assessmentAction = clinical_assessment.action
  const allowedLegacyTiers: readonly string[] = CLINICAL_ASSESSMENT_LEGACY_TIERS[assessmentAction]
  if (!allowedLegacyTiers.includes(triage_tier) ||
      (assessmentAction === 'clinician_review_now' && triage_tier === 'urgent' && comfortable_with_wait === 'yes')) {
    return NextResponse.json({ error: 'Clinical action, legacy comparison tier, and wait comfort are inconsistent' }, { status: 400 })
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
      clinical_assessment,
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
    const missingAssessmentMigration = error.code === '42703' || /clinical_assessment/i.test(error.message || '')
    return NextResponse.json({ error: missingAssessmentMigration ? 'Clinical assessment storage is unavailable; migration 063 is required' : 'Review could not be saved; submitted reviews are locked' }, { status: missingAssessmentMigration ? 503 : error.code === '23505' || error.code === '55000' ? 409 : 500 })
  }

  return NextResponse.json({ review: data })
}
