import { NextResponse } from 'next/server'
import { from } from '@/lib/db-query'
import { DISCLAIMER_TEXT, type AITriageResponse, type TriageTier } from '@/lib/triage/types'
import { formatTierDisplay, calculateTriageTier } from '@/lib/triage/scoring'

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

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params

  const { data, error } = await from('triage_sessions')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'Triage session not found' },
      { status: 404 },
    )
  }

  const status = (data.status as string | undefined) ?? 'complete'

  if (status === 'pending') {
    return NextResponse.json({
      session_id: id,
      status: 'pending',
    })
  }

  if (status === 'error') {
    return NextResponse.json({
      session_id: id,
      status: 'error',
      error: data.error_message || 'Triage failed',
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

  return NextResponse.json({
    session_id: id,
    status: 'complete',
    triage_tier: tier,
    triage_tier_display: triageTierDisplay,
    confidence: data.confidence,
    dimension_scores: parseJSON(data.dimension_scores),
    weighted_score: data.weighted_score,
    red_flag_override: aiResponse.red_flag_override ?? false,
    emergent_override: aiResponse.emergent_override ?? false,
    emergent_reason: aiResponse.emergent_reason ?? null,
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
  })
}
