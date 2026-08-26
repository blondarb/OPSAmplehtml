import type { PoolClient } from 'pg'
import type { HistorianInvitationBinding } from './invitationStore'
import type { HistorianRedFlag } from '@/lib/historianTypes'

/**
 * Create the invited-session clinician alert inside the caller's transaction.
 * The historian session row is locked by every caller before this runs, so the
 * existence check is an idempotency gate even without changing the legacy
 * notifications schema.
 */
export async function ensureInvitedHistorianAlert(
  client: PoolClient,
  binding: HistorianInvitationBinding,
  redFlags: HistorianRedFlag[],
  safetyEscalated: boolean,
): Promise<void> {
  if (!safetyEscalated && redFlags.length === 0) return

  const existing = await client.query<{ id: string }>(
    `SELECT id
       FROM notifications
      WHERE tenant_id = $1
        AND source_type = 'historian_red_flag'
        AND source_id = $2
      LIMIT 1`,
    [binding.tenantId, binding.sessionId],
  )
  if (existing.rows[0]) return

  const critical = safetyEscalated || redFlags.some((flag) => flag.severity === 'high')
  const flagSummary = redFlags.map((flag) => flag.flag).filter(Boolean).join(', ')
  const title = safetyEscalated
    ? `Emergency safety escalation for ${binding.patientName}`
    : `Red flag${redFlags.length > 1 ? 's' : ''} detected for ${binding.patientName}`
  const body = flagSummary ||
    'The Historian triggered an emergency safety escalation; immediate clinical follow-up is required.'

  const inserted = await client.query(
    `INSERT INTO notifications
      (tenant_id, recipient_user_id, source_type, source_id, patient_id,
       priority, title, body, metadata)
     VALUES ($1, NULL, 'historian_red_flag', $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      binding.tenantId,
      binding.sessionId,
      binding.patientId,
      critical ? 'critical' : 'high',
      title,
      body,
      JSON.stringify({
        safetyEscalated,
        redFlagCount: redFlags.length,
        flags: redFlags,
        invitationId: binding.inviteId,
      }),
    ],
  )
  if (inserted.rowCount !== 1) throw new Error('Historian alert notification was not persisted.')
}
