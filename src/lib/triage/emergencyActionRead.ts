import { getPool } from '@/lib/db'

export interface EmergencyActionView {
  id: string
  status: 'open' | 'attempting_contact' | 'handed_off' | 'closed' | 'failed'
  ownerUserId: string | null
  ownerTeam: string
  dueAt: string
  nextEscalationAt: string
  contactAttemptedAt: string | null
  contactChannel: string | null
  deliveryStatus: string
  understandingStatus: string
  outcome: string | null
  closureCode: string | null
  closedAt: string | null
  reviewedBy: string | null
  reviewedAt: string | null
}

export type LoadEmergencyActionsResult =
  | { ok: true; actions: EmergencyActionView[] }
  | { ok: false; reason: 'triage_session_not_found' | 'persistence_failed' }

function toIso(value: unknown): string | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function loadEmergencyActions(
  triageSessionId: string,
  tenantId: string,
): Promise<LoadEmergencyActionsResult> {
  try {
    const pool = await getPool()
    const session = await pool.query(
      `SELECT id
         FROM triage_sessions
        WHERE id = $1
          AND tenant_id = $2
        LIMIT 1`,
      [triageSessionId, tenantId],
    )
    if (!session.rows[0]) {
      return { ok: false, reason: 'triage_session_not_found' }
    }

    const result = await pool.query(
      `SELECT action.id,
              action.status,
              action.owner_user_id,
              action.owner_team,
              action.due_at,
              action.next_escalation_at,
              action.contact_attempted_at,
              action.contact_channel,
              action.delivery_status,
              action.understanding_status,
              action.outcome,
              action.closure_code,
              action.closed_at,
              action.reviewed_by,
              action.reviewed_at
         FROM triage_emergency_actions action
         JOIN triage_sessions session
           ON session.id = action.triage_session_id
        WHERE action.triage_session_id = $1
          AND session.tenant_id = $2
        ORDER BY CASE WHEN action.status = 'closed' THEN 1 ELSE 0 END,
                 action.created_at DESC`,
      [triageSessionId, tenantId],
    )

    const actions = result.rows.map((row): EmergencyActionView => ({
      id: row.id,
      status: row.status,
      ownerUserId: row.owner_user_id ?? null,
      ownerTeam: row.owner_team,
      dueAt: toIso(row.due_at) ?? '',
      nextEscalationAt: toIso(row.next_escalation_at) ?? '',
      contactAttemptedAt: toIso(row.contact_attempted_at),
      contactChannel: row.contact_channel ?? null,
      deliveryStatus: row.delivery_status,
      understandingStatus: row.understanding_status,
      outcome: row.outcome ?? null,
      closureCode: row.closure_code ?? null,
      closedAt: toIso(row.closed_at),
      reviewedBy: row.reviewed_by ?? null,
      reviewedAt: toIso(row.reviewed_at),
    }))
    return { ok: true, actions }
  } catch {
    console.error('[triage/emergency-action] action list failed')
    return { ok: false, reason: 'persistence_failed' }
  }
}
