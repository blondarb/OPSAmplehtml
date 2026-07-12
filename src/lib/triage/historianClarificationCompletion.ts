import { getPool } from '@/lib/db'

export interface ReferralClarificationAnswer {
  questionId: string
  answer: string
}

export interface ReferralClarificationCompletionInput {
  consultId: string
  tenantId: string
  historianSessionId: string
  summary: string
  structuredOutput: Record<string, unknown>
  redFlags: Array<{ flag: string; severity: string; context: string }>
  completionStatus: 'complete' | 'ended_early' | null
  answers: ReferralClarificationAnswer[]
}

export type ReferralClarificationCompletionResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'clarification_authorization_revoked'
        | 'unapproved_question_answer'
        | 'duplicate_question_answer'
        | 'invalid_question_answer'
        | 'approved_question_answer_missing'
        | 'clarification_persistence_failed'
    }

export async function recordReferralClarificationCompletion(
  input: ReferralClarificationCompletionInput,
): Promise<ReferralClarificationCompletionResult> {
  const pool = await getPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const consultResult = await client.query(
      `SELECT triage_session_id
         FROM neurology_consults
        WHERE id = $1
          AND tenant_id = $2
        FOR UPDATE`,
      [input.consultId, input.tenantId],
    )
    const triageSessionId = consultResult.rows[0]?.triage_session_id as
      | string
      | undefined
    if (!triageSessionId) {
      await client.query('ROLLBACK')
      return { ok: false, reason: 'clarification_authorization_revoked' }
    }

    const approvedResult = await client.query(
      `SELECT id
         FROM triage_clarification_questions
        WHERE triage_session_id = $1
          AND target = 'patient'
          AND criticality = 'non_critical'
          AND status IN ('approved', 'sent')
          AND approved_by IS NOT NULL
          AND approved_at IS NOT NULL
        ORDER BY created_at, id
        FOR UPDATE`,
      [triageSessionId],
    )
    const approvedIds = new Set<string>(
      approvedResult.rows.map((row) => String(row.id)),
    )
    if (approvedIds.size === 0) {
      await client.query('ROLLBACK')
      return { ok: false, reason: 'clarification_authorization_revoked' }
    }

    const answerIds = input.answers.map((answer) => answer.questionId)
    if (new Set(answerIds).size !== answerIds.length) {
      await client.query('ROLLBACK')
      return { ok: false, reason: 'duplicate_question_answer' }
    }
    if (
      input.answers.some(
        (answer) =>
          !answer.questionId.trim() ||
          !answer.answer.trim(),
      )
    ) {
      await client.query('ROLLBACK')
      return { ok: false, reason: 'invalid_question_answer' }
    }
    if (answerIds.some((questionId) => !approvedIds.has(questionId))) {
      await client.query('ROLLBACK')
      return { ok: false, reason: 'unapproved_question_answer' }
    }
    if (
      input.completionStatus === 'complete' &&
      answerIds.length !== approvedIds.size
    ) {
      await client.query('ROLLBACK')
      return { ok: false, reason: 'approved_question_answer_missing' }
    }

    for (const answer of input.answers) {
      await client.query(
        `UPDATE triage_clarification_questions
            SET status = 'answered',
                raw_answer = $3,
                normalized_answer = $4::jsonb,
                responder_kind = 'patient',
                answered_at = now(),
                delivery_status = 'delivered',
                delivered_at = COALESCE(delivered_at, now()),
                updated_at = now()
          WHERE id = $1
            AND triage_session_id = $2`,
        [
          answer.questionId,
          triageSessionId,
          answer.answer,
          JSON.stringify({
            answer: answer.answer,
            source: 'patient_reported_unverified',
          }),
        ],
      )
    }

    const triageUpdate = await client.query(
      `UPDATE triage_sessions
          SET workflow_status = 'clinician_review',
              scheduling_locked = true,
              review_requirement = 'clinician_confirmation',
              reviewed_by = NULL,
              reviewed_at = NULL,
              final_care_pathway = NULL,
              final_triage_tier = NULL
        WHERE id = $1
          AND workflow_status = 'patient_clarification'`,
      [triageSessionId],
    )
    if (triageUpdate.rowCount !== 1) {
      await client.query('ROLLBACK')
      return { ok: false, reason: 'clarification_authorization_revoked' }
    }

    await client.query(
      `UPDATE neurology_consults
          SET historian_session_id = $2,
              historian_summary = $3,
              historian_structured_output = $4::jsonb,
              historian_red_flags = $5::jsonb,
              historian_safety_escalated = false,
              historian_completed_at = now(),
              interview_completion_status = $6,
              status = 'triage_complete',
              updated_at = now()
        WHERE id = $1
          AND tenant_id = $7`,
      [
        input.consultId,
        input.historianSessionId,
        input.summary,
        JSON.stringify(input.structuredOutput),
        JSON.stringify(input.redFlags),
        input.completionStatus,
        input.tenantId,
      ],
    )

    await client.query(
      `INSERT INTO triage_workflow_events (
         triage_session_id,
         event_type,
         actor_kind,
         previous_state,
         new_state,
         reason,
         correlation_id
       ) VALUES ($1, 'patient_clarification_answered', 'patient',
                 'patient_clarification', 'clinician_review',
                 'Patient-reported answers require clinician verification', $2)`,
      [triageSessionId, `historian:${input.historianSessionId}`],
    )

    await client.query('COMMIT')
    return { ok: true }
  } catch {
    await client.query('ROLLBACK')
    console.error('[historian/clarification] failed to persist reconciliation')
    return { ok: false, reason: 'clarification_persistence_failed' }
  } finally {
    client.release()
  }
}
