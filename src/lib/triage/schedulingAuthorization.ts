import { getPool } from '@/lib/db'
import {
  canActivateOutpatientScheduling,
  type SchedulingAuthorization,
  type WorkflowPolicyDecision,
} from './workflowPolicy'

export interface SchedulingAuthorizationResult {
  authorization: SchedulingAuthorization | null
  decision: WorkflowPolicyDecision
}

export async function loadSchedulingAuthorization(
  triageSessionId: string,
  tenantId: string,
): Promise<SchedulingAuthorizationResult> {
  const pool = await getPool()
  const { rows } = await pool.query(
    `SELECT
       ts."care_pathway",
       ts."workflow_status",
       ts."scheduling_locked",
       ts."reviewed_at",
       ts."reviewed_by",
       ts."final_care_pathway",
       ts."final_triage_tier",
       ts."coverage_status",
       ts."data_quality",
       ts."review_requirement",
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
     LIMIT 1`,
    [triageSessionId, tenantId],
  )

  const row = rows[0]
  if (!row) {
    return {
      authorization: null,
      decision: { allowed: false, reason: 'triage_authorization_missing' },
    }
  }

  const authorization = {
    carePathway: row.care_pathway,
    workflowStatus: row.workflow_status,
    schedulingLocked: row.scheduling_locked,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    finalCarePathway: row.final_care_pathway,
    finalTriageTier: row.final_triage_tier,
    openCriticalClarifications: Number(row.open_critical_clarifications),
    openEmergencyActions: Number(row.open_emergency_actions),
    coverageStatus: row.coverage_status,
    dataQuality: row.data_quality,
    reviewRequirement: row.review_requirement,
  } as SchedulingAuthorization

  return {
    authorization,
    decision: canActivateOutpatientScheduling(authorization),
  }
}
