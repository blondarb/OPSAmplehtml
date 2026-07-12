/**
 * POST /api/neuro-consults/[id]/report
 *
 * Generates a unified report from all pipeline data for a consult.
 *
 * GET /api/neuro-consults/[id]/report
 *
 * Retrieves the most recent report for a consult.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { getConsult } from '@/lib/consult/pipeline'
import {
  buildConsultReport,
  generateAssessmentAndPlan,
  appendAssessmentAndPlan,
} from '@/lib/consult/report'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import {
  canActivateOutpatientScheduling,
  type SchedulingAuthorization,
} from '@/lib/triage/workflowPolicy'

const OUTPATIENT_REPORT_TIERS = new Set([
  'urgent',
  'semi_urgent',
  'routine_priority',
  'routine',
  'non_urgent',
])

async function reportAuthorizationDecision(
  pool: Awaited<ReturnType<typeof getPool>>,
  consultId: string,
  tenantId: string,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const { rows } = await pool.query(
    `SELECT
       ts.care_pathway,
       ts.data_quality,
       ts.coverage_status,
       ts.review_requirement,
       ts.workflow_status,
       ts.scheduling_locked,
       ts.reviewed_at,
       ts.reviewed_by,
       ts.final_care_pathway,
       ts.final_triage_tier,
       (
         SELECT COUNT(*)::integer
           FROM triage_clarification_questions q
          WHERE q.triage_session_id = ts.id
            AND q.criticality = 'critical'
            AND q.status NOT IN ('verified', 'closed')
       ) AS open_critical_clarifications,
       (
         SELECT COUNT(*)::integer
           FROM triage_emergency_actions emergency_action
          WHERE emergency_action.triage_session_id = ts.id
            AND emergency_action.status <> 'closed'
       ) AS open_emergency_actions,
       EXISTS (
         SELECT 1
           FROM clinical_access_memberships reviewer
          WHERE reviewer.user_id = ts.reviewed_by
            AND reviewer.tenant_id = ts.tenant_id
            AND reviewer.active = true
            AND reviewer.role IN ('clinician', 'admin')
       ) AS reviewer_authorized
      FROM neurology_consults nc
      JOIN triage_sessions ts
        ON ts.id = nc.triage_session_id
       AND ts.tenant_id = nc.tenant_id
     WHERE nc.id = $1
       AND nc.tenant_id = $2
     LIMIT 1`,
    [consultId, tenantId],
  )
  const row = rows[0] as Record<string, unknown> | undefined
  if (!row) return { allowed: false, reason: 'triage_finalization_missing' }
  if (row.reviewer_authorized !== true) {
    return { allowed: false, reason: 'clinician_reviewer_not_authorized' }
  }
  if (
    !Number.isSafeInteger(Number(row.open_emergency_actions)) ||
    Number(row.open_emergency_actions) !== 0
  ) {
    return { allowed: false, reason: 'emergency_action_open' }
  }
  if (
    typeof row.final_triage_tier !== 'string' ||
    !OUTPATIENT_REPORT_TIERS.has(row.final_triage_tier)
  ) {
    return { allowed: false, reason: 'final_triage_tier_not_outpatient' }
  }
  const reviewedAt =
    row.reviewed_at instanceof Date
      ? Number.isNaN(row.reviewed_at.getTime())
        ? null
        : row.reviewed_at.toISOString()
      : row.reviewed_at

  const policy = canActivateOutpatientScheduling({
    carePathway: row.care_pathway,
    dataQuality: row.data_quality,
    coverageStatus: row.coverage_status,
    reviewRequirement: row.review_requirement,
    workflowStatus: row.workflow_status,
    schedulingLocked: row.scheduling_locked,
    reviewedAt,
    reviewedBy: row.reviewed_by,
    finalCarePathway: row.final_care_pathway,
    finalTriageTier: row.final_triage_tier,
    openCriticalClarifications: Number(row.open_critical_clarifications),
    openEmergencyActions: Number(row.open_emergency_actions),
  } as SchedulingAuthorization)

  return policy.allowed
    ? { allowed: true }
    : { allowed: false, reason: policy.reason }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const access = await authorizeClinicalAccess({
      action: 'consult.update',
      allowedRoles: ['clinician', 'admin'],
    })
    if (!access.ok) {
      return NextResponse.json(
        { error: 'Access denied', reason: access.reason },
        { status: access.status },
      )
    }

    // 1. Load the consult record
    const consult = await getConsult(id, access.context.tenantId)
    if (!consult) {
      return NextResponse.json({ error: 'Consult not found' }, { status: 404 })
    }

    const pool = await getPool()
    const authorization = await reportAuthorizationDecision(
      pool,
      id,
      access.context.tenantId,
    )
    if (!authorization.allowed) {
      return NextResponse.json(
        {
          error: 'Consult is not authorized for report finalization',
          reason: authorization.reason,
        },
        { status: 409 },
      )
    }

    // 2. Load related data in parallel
    const [scalesResult, markersResult, measurementsResult, redFlagsResult] = await Promise.all([
      pool.query(
        `SELECT sr.*
           FROM scale_results sr
           JOIN neurology_consults nc
             ON nc.id = sr.consult_id
            AND nc.tenant_id = $2
          WHERE sr.consult_id = $1
          ORDER BY sr.created_at`,
        [id, access.context.tenantId],
      ).catch(() => ({ rows: [] })),

      pool.query(
        `SELECT marker.*
           FROM patient_body_map_markers marker
           JOIN neurology_consults nc
             ON nc.id = marker.consult_id
            AND nc.tenant_id = $2
          WHERE marker.consult_id = $1`,
        [id, access.context.tenantId],
      ).catch(() => ({ rows: [] })),

      pool.query(
        `SELECT measurement.*
           FROM patient_device_measurements measurement
           JOIN neurology_consults nc
             ON nc.id = measurement.consult_id
            AND nc.tenant_id = $2
          WHERE measurement.consult_id = $1`,
        [id, access.context.tenantId],
      ).catch(() => ({ rows: [] })),

      pool.query(
        `SELECT red_flag.*
           FROM red_flag_events red_flag
           JOIN neurology_consults nc
             ON nc.id = red_flag.consult_id
            AND nc.tenant_id = $2
          WHERE red_flag.consult_id = $1
          ORDER BY red_flag.detected_at`,
        [id, access.context.tenantId],
      ).catch(() => ({ rows: [] })),
    ])

    // 3. Parse localizer differential from consult
    let localizerDifferential: Array<{ diagnosis: string; likelihood: string; rationale: string }> = []
    if (consult.historian_structured_output) {
      const so = consult.historian_structured_output as Record<string, unknown>
      if (so.localizer_differential && typeof so.localizer_differential === 'string') {
        try {
          localizerDifferential = JSON.parse(so.localizer_differential)
        } catch { /* non-fatal */ }
      }
    }

    // 4. Build the report (pure assembly)
    const baseReport = buildConsultReport({
      consult,
      scaleResults: scalesResult.rows.map((r: Record<string, unknown>) => ({
        scale_id: r.scale_id as string,
        scale_name: r.scale_name as string,
        abbreviation: r.abbreviation as string || (r.scale_id as string),
        total_score: r.total_score as number,
        max_score: r.max_score as number || 0,
        severity: r.severity as string || '',
        interpretation: r.interpretation as string || '',
      })),
      localizerDifferential,
      bodyMapMarkers: markersResult.rows.map((r: Record<string, unknown>) => ({
        region: r.region as string,
        symptom_type: r.symptom_type as string,
        severity: r.severity as string,
      })),
      deviceMeasurements: measurementsResult.rows.map((r: Record<string, unknown>) => ({
        measurement_type: r.measurement_type as string,
        result: (typeof r.result === 'string' ? JSON.parse(r.result) : r.result) as Record<string, unknown>,
      })),
      redFlagEvents: redFlagsResult.rows.map((r: Record<string, unknown>) => ({
        flag_name: r.flag_name as string,
        severity: r.severity as string,
        confidence: r.confidence as number,
      })),
    })

    // 4b. Generate Assessment + Plan via Bedrock (AI synthesis).
    //     Non-fatal: if generation fails (timeout, KB outage, parse error)
    //     we still persist the structured report so the physician has the
    //     data dump to work from.
    let report = baseReport
    try {
      const ap = await generateAssessmentAndPlan(baseReport, { timeoutMs: 30000 })
      if (ap.assessment.trim()) {
        report = appendAssessmentAndPlan(baseReport, ap)
      }
    } catch (err) {
      console.warn('[report] Assessment/Plan generation failed; persisting report without them:', err)
    }

    // 5. Atomically re-check authorization, persist the report, and complete
    // the consult. This closes the race where triage could be re-held while
    // Bedrock was generating the assessment and plan.
    const { rows } = await pool.query(
      `WITH authorized_consult AS MATERIALIZED (
         SELECT nc.id
           FROM neurology_consults nc
           JOIN triage_sessions ts
             ON ts.id = nc.triage_session_id
            AND ts.tenant_id = nc.tenant_id
          WHERE nc.id = $1
            AND nc.tenant_id = $2
            AND ts.care_pathway IN ('expedited_outpatient', 'routine_outpatient')
            AND ts.data_quality = 'sufficient'
            AND ts.coverage_status = 'complete'
            AND ts.review_requirement = 'none'
            AND ts.workflow_status = 'decision_ready'
            AND ts.scheduling_locked = false
            AND ts.reviewed_at IS NOT NULL
            AND ts.reviewed_by IS NOT NULL
            AND ts.final_care_pathway = ts.care_pathway
            AND (
              (
                ts.final_care_pathway = 'expedited_outpatient'
                AND ts.final_triage_tier IN ('urgent', 'semi_urgent')
              )
              OR
              (
                ts.final_care_pathway = 'routine_outpatient'
                AND ts.final_triage_tier IN (
                  'routine_priority', 'routine', 'non_urgent'
                )
              )
            )
            AND EXISTS (
              SELECT 1
                FROM clinical_access_memberships reviewer
               WHERE reviewer.user_id = ts.reviewed_by
                 AND reviewer.tenant_id = ts.tenant_id
                 AND reviewer.active = true
                 AND reviewer.role IN ('clinician', 'admin')
            )
            AND NOT EXISTS (
              SELECT 1
                FROM triage_clarification_questions q
               WHERE q.triage_session_id = ts.id
                 AND q.criticality = 'critical'
                 AND q.status NOT IN ('verified', 'closed')
            )
            AND NOT EXISTS (
              SELECT 1
                FROM triage_emergency_actions emergency_action
               WHERE emergency_action.triage_session_id = ts.id
                 AND emergency_action.status <> 'closed'
            )
       ), inserted_report AS (
         INSERT INTO consult_reports
           (consult_id, status, report_data, generated_at)
         SELECT id, $3, $4, $5
           FROM authorized_consult
         RETURNING id
       ), updated_consult AS (
         UPDATE neurology_consults nc
            SET status = 'complete', updated_at = NOW()
           FROM authorized_consult authorized
          WHERE nc.id = authorized.id
         RETURNING nc.id
       )
       SELECT inserted.id
         FROM inserted_report inserted
         CROSS JOIN updated_consult updated`,
      [
        id,
        access.context.tenantId,
        'draft',
        JSON.stringify(report),
        report.generated_at,
      ],
    )
    if (!rows[0]?.id) {
      return NextResponse.json(
        {
          error: 'Consult is no longer authorized for report finalization',
          reason: 'triage_authorization_revoked',
        },
        { status: 409 },
      )
    }

    report.id = rows[0].id

    return NextResponse.json({ report })
  } catch {
    console.error('[report] generation failed')
    return NextResponse.json(
      { error: 'Failed to generate consult report' },
      { status: 500 },
    )
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const access = await authorizeClinicalAccess({
      action: 'consult.read',
      allowedRoles: ['viewer', 'scheduler', 'clinician', 'admin'],
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

    const pool = await getPool()
    const { rows } = await pool.query(
      `SELECT report.*
         FROM consult_reports report
         JOIN neurology_consults nc
           ON nc.id = report.consult_id
          AND nc.tenant_id = $2
        WHERE report.consult_id = $1
       ORDER BY report.generated_at DESC
       LIMIT 1`,
      [id, access.context.tenantId],
    )

    if (rows.length === 0) {
      return NextResponse.json({ report: null })
    }

    const row = rows[0]
    const report = typeof row.report_data === 'string'
      ? JSON.parse(row.report_data)
      : row.report_data

    report.id = row.id

    return NextResponse.json({ report })
  } catch {
    console.error('[report] read failed')
    return NextResponse.json(
      { error: 'Failed to fetch consult report' },
      { status: 500 },
    )
  }
}
