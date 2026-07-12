import { getPool } from '@/lib/db'
import type { ReferralClarificationQuestion } from '@/lib/historianTypes'
import {
  canAdvanceToHistorian,
  type HistorianAuthorization,
  type WorkflowPolicyDecision,
} from './workflowPolicy'

export interface HistorianAuthorizationResult {
  decision: WorkflowPolicyDecision
  approvedQuestions: ReferralClarificationQuestion[]
}

export async function loadHistorianAuthorization(
  triageSessionId: string,
  tenantId: string,
): Promise<HistorianAuthorizationResult> {
  const pool = await getPool()
  const { rows } = await pool.query(
    `
    SELECT
      ts."care_pathway",
      ts."workflow_status",
      ts."scheduling_locked",
      ts."reviewed_at",
      ts."reviewed_by",
      ts."coverage_status",
      ts."data_quality",
      ts."review_requirement",
      (
        SELECT COUNT(*)::integer
        FROM "triage_clarification_questions" critical_q
        WHERE critical_q."triage_session_id" = ts."id"
          AND critical_q."criticality" = 'critical'
          AND critical_q."status" NOT IN ('verified', 'closed')
      ) AS "open_critical_clarifications",
      (
        SELECT COUNT(*)::integer
        FROM "triage_emergency_actions" open_action
        WHERE open_action."triage_session_id" = ts."id"
          AND open_action."status" <> 'closed'
      ) AS "open_emergency_actions",
      q."id" AS "question_id",
      q."question_code",
      q."question_text"
    FROM "triage_sessions" ts
    LEFT JOIN "triage_clarification_questions" q
      ON q."triage_session_id" = ts."id"
     AND q."target" = 'patient'
     AND q."criticality" = 'non_critical'
     AND q."status" = 'approved'
     AND q."approved_by" IS NOT NULL
     AND q."approved_at" IS NOT NULL
    WHERE ts."id" = $1
      AND ts."tenant_id" = $2
    ORDER BY q."created_at", q."id"
    `,
    [triageSessionId, tenantId],
  )

  const authorizationRow = rows[0]
  if (!authorizationRow) {
    return {
      decision: { allowed: false, reason: 'triage_authorization_missing' },
      approvedQuestions: [],
    }
  }

  const approvedQuestions = rows
    .filter(
      (row) =>
        typeof row.question_id === 'string' &&
        typeof row.question_code === 'string' &&
        typeof row.question_text === 'string',
    )
    .map((row) => ({
      id: row.question_id,
      code: row.question_code,
      text: row.question_text,
    }))

  const authorization = {
    carePathway: authorizationRow.care_pathway,
    workflowStatus: authorizationRow.workflow_status,
    schedulingLocked: authorizationRow.scheduling_locked,
    reviewedAt: authorizationRow.reviewed_at,
    reviewedBy: authorizationRow.reviewed_by,
    finalCarePathway: authorizationRow.final_care_pathway ?? null,
    finalTriageTier: authorizationRow.final_triage_tier ?? null,
    openCriticalClarifications: Number(
      authorizationRow.open_critical_clarifications,
    ),
    openEmergencyActions: Number(authorizationRow.open_emergency_actions),
    coverageStatus: authorizationRow.coverage_status,
    dataQuality: authorizationRow.data_quality,
    reviewRequirement: authorizationRow.review_requirement,
    patientClarificationApproved: approvedQuestions.length > 0,
    clarificationMode: 'referral_clarification',
    approvedQuestionIds: approvedQuestions.map((question) => question.id),
  } as HistorianAuthorization

  return {
    decision: canAdvanceToHistorian(authorization),
    approvedQuestions,
  }
}
