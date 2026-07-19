import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { from } from '@/lib/db-query'
import {
  canActivateOutpatientScheduling,
  type SchedulingAuthorization,
} from '@/lib/triage/workflowPolicy'
import { authorizeClinicalAccess, clinicalAccessDeniedMessage } from '@/lib/auth/clinicalAccess'

/**
 * POST /api/triage/[id]/schedule
 *
 * Creates a pending-review suggestion only after explicit clinician clearance.
 * Called automatically from the triage route or manually by staff.
 *
 * The API policy and a database trigger both fail closed.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await authorizeClinicalAccess({
      action: 'triage.schedule',
      allowedRoles: ['scheduler', 'clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: clinicalAccessDeniedMessage(access.reason), reason: access.reason },
        { status: access.status },
      )
    }

    const { id: triageSessionId } = await params

    // Fetch only the fields required for scheduling authorization and display.
    const pool = await getPool()
    const { rows } = await pool.query(
      `
      SELECT
        ts."id",
        ts."triage_tier",
        ts."patient_id",
        ts."clinical_reasons",
        ts."subspecialty_recommendation",
        ts."care_pathway",
        ts."data_quality",
        ts."coverage_status",
        ts."review_requirement",
        ts."workflow_status",
        ts."scheduling_locked",
        ts."reviewed_at",
        ts."reviewed_by",
        ts."final_care_pathway",
        ts."final_triage_tier",
        (
          SELECT COUNT(*)::integer
          FROM "triage_clarification_questions" q
          WHERE q."triage_session_id" = ts."id"
            AND q."criticality" = 'critical'
            AND q."status" NOT IN ('verified', 'closed')
        ) AS "open_critical_clarifications"
        ,(
          SELECT COUNT(*)::integer
          FROM "triage_emergency_actions" action
          WHERE action."triage_session_id" = ts."id"
            AND action."status" <> 'closed'
        ) AS "open_emergency_actions"
      FROM "triage_sessions" ts
      WHERE ts."id" = $1
        AND ts."tenant_id" = $2
      LIMIT 1
      `,
      [triageSessionId, access.context.tenantId],
    )

    const triage = rows[0]
    if (!triage) {
      return NextResponse.json(
        { error: 'Triage session not found' },
        { status: 404 },
      )
    }

    const authorization = {
      carePathway: triage.care_pathway,
      dataQuality: triage.data_quality,
      coverageStatus: triage.coverage_status,
      reviewRequirement: triage.review_requirement,
      workflowStatus: triage.workflow_status,
      schedulingLocked: triage.scheduling_locked,
      reviewedAt: triage.reviewed_at,
      reviewedBy: triage.reviewed_by,
      finalCarePathway: triage.final_care_pathway,
      finalTriageTier: triage.final_triage_tier,
      openCriticalClarifications: Number(
        triage.open_critical_clarifications,
      ),
      openEmergencyActions: Number(triage.open_emergency_actions),
    } as SchedulingAuthorization
    const policy = canActivateOutpatientScheduling(authorization)
    if (!policy.allowed) {
      return NextResponse.json(
        {
          error: 'Triage session is not authorized for outpatient scheduling',
          reason: policy.reason,
        },
        { status: 409 },
      )
    }

    // Legacy tier labels are explanatory only. Emergency/critical labels can
    // never create an outpatient appointment, even if other fields drift.
    const tier = (triage.triage_tier || '').toLowerCase()
    if (tier !== 'urgent') {
      return NextResponse.json(
        { error: 'Only a cleared urgent outpatient decision can be suggested' },
        { status: 400 },
      )
    }

    // If no patient_id, we cannot schedule (patient must be registered first)
    if (!triage.patient_id) {
      return NextResponse.json(
        { error: 'Cannot schedule appointment — no patient linked to this triage session' },
        { status: 400 },
      )
    }

    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)
    const suggestedDate = nextWeek.toISOString().split('T')[0]
    const appointmentType = 'new-consult'

    // Build reason from triage data
    const clinicalReasons = Array.isArray(triage.clinical_reasons)
      ? triage.clinical_reasons.join('; ')
      : ''
    const reason =
      triage.subspecialty_recommendation ||
      clinicalReasons ||
      'Urgent triage result — review needed'

    // Create the appointment flagged as AI-suggested
    const { data: appointment, error: insertError } = await from('appointments')
      .insert({
        tenant_id: access.context.tenantId,
        triage_session_id: triageSessionId,
        patient_id: triage.patient_id,
        appointment_date: suggestedDate,
        appointment_time: '09:00', // Default morning slot; staff will adjust
        duration_minutes: 45,
        appointment_type: appointmentType,
        status: 'pending-review',
        hospital_site: 'Meridian Neurology',
        reason_for_visit: reason,
        scheduling_notes: `AI-suggested: ${tier} triage result (session ${triageSessionId}). Staff review required before confirming.`,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[triage/schedule] appointment insert failed', {
        code: insertError.code ?? 'UNKNOWN',
      })
      return NextResponse.json(
        { error: 'Failed to create appointment' },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        appointment,
        message: `AI-suggested ${appointmentType} appointment created for ${suggestedDate}`,
        ai_suggested: true,
      },
      { status: 201 },
    )
  } catch {
    console.error('[triage/schedule] request failed')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
