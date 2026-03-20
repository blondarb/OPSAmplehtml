/**
 * GET /api/neuro-consults/[id]/historian-context
 *
 * Returns the pre-built historian context for a consult record.
 * The caller (historian session creation UI) uses this to enrich
 * the OpenAI Realtime session with triage and intake findings before
 * the WebRTC connection opens.
 *
 * Response shape maps directly to buildHistorianSystemPrompt() params:
 *   { referralReason, patientContext }
 */

import { NextResponse } from 'next/server'
import { getConsult } from '@/lib/consult/pipeline'
import { buildHistorianContextFromConsult } from '@/lib/consult/contextBuilder'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const consult = await getConsult(id)

    if (!consult) {
      return NextResponse.json({ error: 'Consult not found' }, { status: 404 })
    }

    // Build the context strings from whatever pipeline data is available.
    // Even a triage-only consult (no intake yet) produces useful context.
    const context = buildHistorianContextFromConsult(consult)

    // Determine the recommended session type for the historian.
    // If the patient has had prior visits we'd know from the patient record;
    // for now we default to 'new_patient' unless intake indicated otherwise.
    const sessionType = consult.intake_summary?.toLowerCase().includes('follow')
      ? 'follow_up'
      : 'new_patient'

    return NextResponse.json({
      consult_id: consult.id,
      consult_status: consult.status,
      session_type: sessionType,
      referral_reason: context.referralReason,
      patient_context: context.patientContext,
      // Summary of pipeline data available
      has_triage: !!consult.triage_session_id,
      has_intake: !!consult.intake_session_id,
      triage_urgency: consult.triage_urgency,
      triage_tier_display: consult.triage_tier_display,
    })
  } catch (error: unknown) {
    console.error(`GET /api/neuro-consults/${id}/historian-context error:`, error)
    const message = error instanceof Error ? error.message : 'Failed to build historian context'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
