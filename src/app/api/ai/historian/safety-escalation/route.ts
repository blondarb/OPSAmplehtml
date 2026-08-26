import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { ensureInvitedHistorianAlert } from '@/lib/historian/safetyNotification'
import { resolveHistorianPatientGrant } from '@/lib/historian/invitationStore'
import { HISTORIAN_GRANT_COOKIE, readCookieValue } from '@/lib/historian/invitationTokens'

async function rollbackQuietly(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }) {
  try { await client.query('ROLLBACK') } catch {}
}

export async function POST(request: Request) {
  const binding = await resolveHistorianPatientGrant(request)
  if (readCookieValue(request, HISTORIAN_GRANT_COOKIE) && !binding) {
    return NextResponse.json({ error: 'This interview session is invalid or has expired.' }, { status: 401 })
  }
  if (!binding) return NextResponse.json({ error: 'A verified patient invitation is required.' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  if (body?.sessionId !== binding.sessionId) {
    return NextResponse.json({ error: 'Session binding mismatch.' }, { status: 409 })
  }

  const pool = await getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const locked = await client.query(
      `SELECT session.id
         FROM historian_sessions session
         JOIN historian_invites invite ON invite.session_id = session.id
        WHERE session.id = $1
          AND session.tenant_id = $2
          AND invite.id = $3
          AND invite.status IN ('redeemed', 'in_progress')
          AND invite.grant_expires_at > now()
        FOR UPDATE OF session, invite`,
      [binding.sessionId, binding.tenantId, binding.inviteId],
    )
    if (locked.rowCount !== 1) {
      await rollbackQuietly(client)
      return NextResponse.json({ error: 'This interview is no longer active.' }, { status: 409 })
    }
    const updated = await client.query(
      `UPDATE historian_sessions
          SET safety_escalated = true, updated_at = now()
        WHERE id = $1 AND tenant_id = $2`,
      [binding.sessionId, binding.tenantId],
    )
    if (updated.rowCount !== 1) throw new Error('Historian safety state was not persisted.')
    await ensureInvitedHistorianAlert(client, binding, [], true)
    await client.query('COMMIT')
    return NextResponse.json({ alerted: true })
  } catch (error) {
    await rollbackQuietly(client)
    console.error('[historian/safety-escalation] transactional alert failed', {
      sessionId: binding.sessionId,
      error,
    })
    return NextResponse.json({ error: 'The clinic alert could not be confirmed.' }, { status: 503 })
  } finally {
    client.release()
  }
}
