import { NextResponse } from 'next/server'
import { from } from '@/lib/db-query'
import { DISCLAIMER_TEXT, type AITriageResponse, type TriageTier } from '@/lib/triage/types'
import { formatTierDisplay, calculateTriageTier } from '@/lib/triage/scoring'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { SOURCE_SAFETY_WORKFLOW_INCONSISTENT_REASON } from '@/lib/triage/pollSafetyState'

// Poll endpoint for the async triage flow. POST /api/triage returns 202 +
// session_id; the client polls here until status is 'complete' or 'error'.
//
// Response shape mirrors the original synchronous POST response so the UI
// can consume `status === 'complete'` payloads without restructuring.
export const dynamic = 'force-dynamic'

function parseJSON(value: unknown) {
  if (value == null) return null
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

// NUMERIC columns come back from node-postgres as strings. Return a finite
// number or null — never a string that would crash `.toFixed()` downstream.
function parseWeightedScore(value: unknown): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function projectedPollSafety(
  data: Record<string, unknown>,
  triageSessionId: string,
) {
  const carePathway = data.care_pathway
  const isGovernedPathway =
    carePathway === 'emergency_now' ||
    carePathway === 'same_day_clinician_review'
  const isUndeterminedPathway = carePathway === 'undetermined'
  if (data.workflow_status === 'closed') {
    return {}
  }
  if (
    isUndeterminedPathway &&
    data.workflow_status === 'pending_safety_screen'
  ) {
    return {}
  }
  if (!isGovernedPathway && !isUndeterminedPathway) {
    return {}
  }
  const safetyPathway =
    carePathway === 'emergency_now' ||
    carePathway === 'same_day_clinician_review'
      ? carePathway
      : undefined
  const reviewRequirement =
    carePathway === 'emergency_now'
      ? 'emergency_action'
      : 'immediate_clinician_review'
  const workflowContextMatches =
    carePathway === 'emergency_now'
      ? data.workflow_status === 'emergency_hold' &&
        data.review_requirement === 'emergency_action'
      : data.workflow_status === 'clinician_review' &&
        data.review_requirement === 'immediate_clinician_review'
  const workflowStateInconsistent =
    data.scheduling_locked !== true || !workflowContextMatches
  const workflowIdIsValid =
    triageSessionId.length > 0 &&
    triageSessionId.length <= 200 &&
    triageSessionId === triageSessionId.trim() &&
    /^[A-Za-z0-9][A-Za-z0-9_:-]*$/.test(triageSessionId)
  const safetyWorkflowId =
    !workflowStateInconsistent && workflowIdIsValid
      ? triageSessionId
      : undefined
  return {
    packet_safety: {
      care_pathway: carePathway,
      review_requirement: reviewRequirement,
      clinician_hold: true,
      signals: [],
    },
    ...(safetyPathway ? { safety_pathway: safetyPathway } : {}),
    immediate_action_required: safetyPathway !== undefined,
    outpatient_scoring_blocked: true,
    human_review_required: true,
    scheduling_locked: true,
    ...(workflowStateInconsistent
      ? { reason: SOURCE_SAFETY_WORKFLOW_INCONSISTENT_REASON }
      : {}),
    ...(safetyWorkflowId
      ? { safety_triage_session_id: safetyWorkflowId }
      : {}),
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const access = await authorizeClinicalAccess({
    action: 'triage.read',
    allowedRoles: ['viewer', 'scheduler', 'clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Access denied', reason: access.reason },
      { status: access.status },
    )
  }
  // Scheduling lock release stays disabled until recommendation snapshots and
  // all decision-critical missing information have governed, resolvable records.
  const outpatientFinalizationAllowed = false

  const { data, error } = await from('triage_sessions')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', access.context.tenantId)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'Triage session not found' },
      { status: 404 },
    )
  }

  // Note: triage_sessions has a pre-existing `status` column for the
  // physician-override workflow ('pending_review' etc). The async pipeline
  // uses a distinct `processing_status` column.
  const processingStatus = (data.processing_status as string | undefined) ?? 'complete'
  const pollSafety = projectedPollSafety(
    data as Record<string, unknown>,
    id,
  )

  if (processingStatus === 'pending') {
    return NextResponse.json({
      session_id: id,
      status: 'pending',
      care_pathway: data.care_pathway ?? 'undetermined',
      data_quality: data.data_quality ?? 'partial',
      coverage_status: data.coverage_status ?? 'legacy_unknown',
      review_requirement:
        data.review_requirement ?? 'clinician_confirmation',
      workflow_status: data.workflow_status ?? 'pending_safety_screen',
      scheduling_locked: data.scheduling_locked !== false,
      outpatient_finalization_allowed: outpatientFinalizationAllowed,
      safety_review: parseJSON(data.safety_shadow_result),
      ...pollSafety,
    })
  }

  if (processingStatus === 'error') {
    return NextResponse.json({
      session_id: id,
      status: 'error',
      error: data.error_message || 'Triage failed',
      care_pathway: data.care_pathway ?? 'undetermined',
      data_quality: data.data_quality ?? 'insufficient',
      coverage_status: data.coverage_status ?? 'legacy_unknown',
      review_requirement:
        data.review_requirement ?? 'immediate_clinician_review',
      workflow_status: data.workflow_status ?? 'clinician_review',
      outpatient_finalization_allowed: outpatientFinalizationAllowed,
      safety_review: parseJSON(data.safety_shadow_result),
      outpatient_scoring_blocked: true,
      human_review_required: true,
      scheduling_locked: true,
      ...pollSafety,
    })
  }

  // status === 'complete' — return the same shape the synchronous POST used to.
  // Reconstruct triage_tier_display from the persisted tier; cheaper than
  // storing a redundant column.
  const aiResponse = (parseJSON(data.ai_raw_response) ?? {}) as Partial<AITriageResponse>
  const tier = data.triage_tier as TriageTier | undefined
  let triageTierDisplay = ''
  if (tier) {
    triageTierDisplay = formatTierDisplay(tier, !!aiResponse.red_flag_override)
  } else if (aiResponse.dimension_scores) {
    // Fallback — recompute tier from dimension_scores if for some reason
    // the column write was skipped.
    const recomputed = calculateTriageTier(aiResponse as AITriageResponse)
    triageTierDisplay = recomputed.display
  }
  const completedCarePathway = data.care_pathway ?? 'undetermined'
  const completedReviewRequirement =
    data.review_requirement ??
    (completedCarePathway === 'routine_outpatient'
      ? 'clinician_confirmation'
      : 'immediate_clinician_review')

  return NextResponse.json({
    session_id: id,
    status: 'complete',
    triage_tier: tier,
    triage_tier_display: triageTierDisplay,
    confidence: data.confidence,
    dimension_scores: parseJSON(data.dimension_scores),
    // node-postgres returns NUMERIC/DECIMAL columns as strings, which would
    // slip past the UI's `!== null` guard and crash `.toFixed()`. Coerce back
    // to a real number so the typed `weighted_score: number | null` holds.
    weighted_score: parseWeightedScore(data.weighted_score),
    red_flag_override: aiResponse.red_flag_override ?? false,
    emergent_override: aiResponse.emergent_override ?? false,
    emergent_reason:
      aiResponse.emergent_reason ??
      (tier === 'emergent'
        ? 'An independent emergency safety review identified a time-critical neurologic concern. Review the cited source evidence and initiate the emergency action workflow.'
        : null),
    insufficient_data: aiResponse.insufficient_data ?? false,
    missing_information: parseJSON(data.missing_information) ?? [],
    clinical_reasons: parseJSON(data.clinical_reasons) ?? [],
    red_flags: parseJSON(data.red_flags) ?? [],
    suggested_workup: parseJSON(data.suggested_workup) ?? [],
    failed_therapies: parseJSON(data.failed_therapies) ?? [],
    subspecialty_recommendation: data.subspecialty_recommendation,
    subspecialty_rationale: data.subspecialty_rationale,
    redirect_to_non_neuro: aiResponse.redirect_to_non_neuro ?? false,
    redirect_specialty: aiResponse.redirect_specialty ?? null,
    redirect_rationale: aiResponse.redirect_rationale ?? null,
    safety_anticoagulation: aiResponse.safety_anticoagulation ?? null,
    safety_symptom_onset_time: aiResponse.safety_symptom_onset_time ?? null,
    safety_allergies: aiResponse.safety_allergies ?? null,
    safety_implanted_devices: aiResponse.safety_implanted_devices ?? null,
    safety_pregnancy_status: aiResponse.safety_pregnancy_status ?? null,
    safety_recent_procedures: aiResponse.safety_recent_procedures ?? null,
    safety_renal_function: aiResponse.safety_renal_function ?? null,
    disclaimer: DISCLAIMER_TEXT,
    consult_id: data.consult_id ?? null,
    scheduled_appointment_id: data.scheduled_appointment_id ?? null,
    care_pathway: completedCarePathway,
    data_quality: data.data_quality ?? 'insufficient',
    coverage_status: data.coverage_status ?? 'legacy_unknown',
    review_requirement: completedReviewRequirement,
    workflow_status: data.workflow_status ?? 'clinician_review',
    scheduling_locked: data.scheduling_locked !== false,
    outpatient_finalization_allowed: outpatientFinalizationAllowed,
    safety_review: parseJSON(data.safety_shadow_result),
    ...pollSafety,
  })
}
