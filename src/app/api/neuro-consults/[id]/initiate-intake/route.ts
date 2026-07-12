/**
 * POST /api/neuro-consults/[id]/initiate-intake
 *
 * Triggers the intake (follow-up agent) step for a consult that has
 * completed triage. Returns the triage-enriched patient context that
 * the intake UI needs to pre-populate the agent with triage findings.
 *
 * The intake agent itself still runs through /api/follow-up/message —
 * this endpoint just advances the pipeline state and returns the context.
 */

import { NextResponse } from 'next/server'
import { getConsult, linkIntakeToConsult } from '@/lib/consult/pipeline'
import { buildIntakeContextFromConsult, buildTriageSummaryText } from '@/lib/consult/contextBuilder'
import { from } from '@/lib/db-query'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { loadSchedulingAuthorization } from '@/lib/triage/schedulingAuthorization'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const access = await authorizeClinicalAccess({
      action: 'consult.initiate_intake',
      allowedRoles: ['clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }

    const consult = await getConsult(id, access.context.tenantId)

    if (!consult) {
      return NextResponse.json({ error: 'Consult not found' }, { status: 404 })
    }

    // Must have completed triage before triggering intake
    if (
      consult.status === 'triage_pending' ||
      !consult.triage_session_id
    ) {
      return NextResponse.json(
        { error: 'Triage must be completed before initiating intake' },
        { status: 409 },
      )
    }

    const safetyAuthorization = await loadSchedulingAuthorization(
      consult.triage_session_id,
      access.context.tenantId,
    )
    if (!safetyAuthorization.decision.allowed) {
      return NextResponse.json(
        {
          error: 'Intake is blocked by triage safety state',
          reason: safetyAuthorization.decision.reason,
        },
        { status: 409 },
      )
    }

    // If intake is already in progress or complete, return the existing context
    if (
      consult.status === 'intake_in_progress' ||
      consult.status === 'intake_complete' ||
      consult.status === 'historian_pending' ||
      consult.status === 'historian_in_progress' ||
      consult.status === 'historian_complete' ||
      consult.status === 'complete'
    ) {
      const context = buildIntakeContextFromConsult(consult)
      return NextResponse.json({
        context,
        intake_session_id: consult.intake_session_id,
        already_initiated: true,
        consult_status: consult.status,
      })
    }

    // Build the intake context from triage data
    const intakeContext = buildIntakeContextFromConsult(consult)
    const visitSummary = buildTriageSummaryText(consult)

    // Create a followup_sessions row upfront so the intake_session_id is
    // available immediately (the message route will update it on first message).
    // This lets the consult record point to the session before any messages fire.
    const newSessionId = crypto.randomUUID()
    const { error: sessionError } = await from('followup_sessions')
      .insert({
        id: newSessionId,
        patient_id: consult.patient_id || null,
        patient_name: consult.triage_chief_complaint
          ? `Referral: ${consult.triage_chief_complaint.substring(0, 50)}`
          : 'New Referral',
        patient_age: null,
        patient_gender: null,
        // Carry triage data into the follow-up session for context
        diagnosis: consult.triage_subspecialty || 'Neurological consultation',
        visit_date: new Date().toISOString().split('T')[0],
        provider_name: null,
        medications: [],
        // Inject the triage summary so the agent is aware of urgency/findings
        visit_summary: visitSummary,
        follow_up_method: 'sms',
        status: 'idle',
        current_module: 'greeting',
        transcript: [],
        // Store the consult_id in caregiver_info as a carrier field until
        // we add a dedicated column; the message route reads this back
        caregiver_info: { consult_id: consult.id },
      })
      .select('id')
      .single()

    if (sessionError) {
      // Non-fatal — return context without a pre-created session
      console.error('[initiate-intake] session pre-create error (non-fatal):', sessionError)

      // Advance consult status even without a pre-created session
      await from('neurology_consults')
        .update({
          status: 'intake_pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', consult.id)
        .eq('tenant_id', access.context.tenantId)

      return NextResponse.json({
        context: intakeContext,
        intake_session_id: null,
        already_initiated: false,
        consult_status: 'intake_pending',
      })
    }

    // Link the pre-created session to the consult
    await linkIntakeToConsult(
      consult.id,
      newSessionId,
      'intake_in_progress',
      undefined,
      undefined,
      access.context.tenantId,
    )

    return NextResponse.json({
      context: intakeContext,
      intake_session_id: newSessionId,
      already_initiated: false,
      consult_status: 'intake_in_progress',
    })
  } catch (error: unknown) {
    console.error(`POST /api/neuro-consults/${id}/initiate-intake error:`, error)
    return NextResponse.json(
      { error: 'Failed to initiate intake' },
      { status: 500 },
    )
  }
}
