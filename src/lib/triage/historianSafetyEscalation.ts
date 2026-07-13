import { getPool } from '@/lib/db'

export interface HistorianSafetyEscalationInput {
  consultId: string
  tenantId: string
  historianSessionId: string
  summary: string
  structuredOutput: Record<string, unknown>
  redFlags: Array<{ flag: string; severity: string; context: string }>
  safetyEscalated: true
  completionStatus: 'complete' | 'ended_early' | null
}

export async function recordHistorianSafetyEscalation(
  input: HistorianSafetyEscalationInput,
): Promise<boolean> {
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
      throw new Error('Consult has no triage safety binding')
    }

    await client.query(
      `UPDATE triage_sessions
          SET care_pathway = 'emergency_now',
              review_requirement = 'emergency_action',
              workflow_status = 'emergency_hold',
              scheduling_locked = true,
              due_at = COALESCE(due_at, now()),
              next_escalation_at = COALESCE(next_escalation_at, now() + interval '5 minutes'),
              reviewed_by = NULL,
              reviewed_at = NULL
        WHERE id = $1`,
      [triageSessionId],
    )

    const actionResult = await client.query(
      `INSERT INTO triage_emergency_actions (
         triage_session_id,
         status,
         owner_team,
         due_at,
         next_escalation_at,
         delivery_status,
         understanding_status,
         idempotency_key
       ) VALUES ($1, 'open', 'neurology_triage', now(), now() + interval '5 minutes',
                 'unknown', 'unknown', $2)
       ON CONFLICT (idempotency_key) DO UPDATE
         SET updated_at = now()
       RETURNING id`,
      [triageSessionId, `historian-safety:${input.historianSessionId}`],
    )
    const emergencyActionId = actionResult.rows[0]?.id as string | undefined
    if (!emergencyActionId) {
      throw new Error('Emergency action was not persisted')
    }

    await client.query(
      `UPDATE neurology_consults
          SET historian_session_id = $2,
              historian_summary = $3,
              historian_structured_output = $4::jsonb,
              historian_red_flags = $5::jsonb,
              historian_safety_escalated = true,
              historian_completed_at = now(),
              interview_completion_status = $6,
              status = 'triage_complete',
              updated_at = now()
        WHERE id = $1`,
      [
        input.consultId,
        input.historianSessionId,
        input.summary,
        JSON.stringify(input.structuredOutput),
        JSON.stringify(input.redFlags),
        input.completionStatus,
      ],
    )

    await client.query(
      `INSERT INTO triage_workflow_events (
         triage_session_id,
         emergency_action_id,
         event_type,
         actor_kind,
         previous_state,
         new_state,
         reason,
         correlation_id
       ) VALUES ($1, $2, 'historian_safety_escalated', 'system',
                 'patient_clarification', 'emergency_hold',
                 'Patient reported a possible active emergency during referral clarification',
                 $3)`,
      [
        triageSessionId,
        emergencyActionId,
        `historian:${input.historianSessionId}`,
      ],
    )

    await client.query('COMMIT')
    return true
  } catch {
    await client.query('ROLLBACK')
    console.error('[historian/safety] failed to persist emergency hold')
    return false
  } finally {
    client.release()
  }
}
