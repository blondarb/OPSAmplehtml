import { NextResponse } from 'next/server'
import {
  authorizeClinicalAccess,
  clinicalAccessDeniedMessage,
} from '@/lib/auth/clinicalAccess'
import { getPool } from '@/lib/db'

export async function POST(request: Request) {
  const access = await authorizeClinicalAccess({
    action: 'historian.report_read',
    allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: clinicalAccessDeniedMessage(access.reason), reason: access.reason },
      { status: access.status },
    )
  }

  const body = await request.json().catch(() => ({}))
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 })

  try {
    const pool = await getPool()
    const result = await pool.query<{ id: string }>(
      `UPDATE historian_eval_jobs
          SET status = 'pending',
              attempt_count = 0,
              next_attempt_at = now(),
              lease_token = NULL,
              lease_expires_at = NULL,
              last_error_code = NULL,
              updated_at = now()
        WHERE session_id = $1
          AND tenant_id = $2
          AND status = 'failed'
      RETURNING id`,
      [sessionId, access.context.tenantId],
    )
    if (result.rowCount !== 1) {
      return NextResponse.json(
        { error: 'No failed differential job is available to retry.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ status: 'pending' })
  } catch (error) {
    console.error('[historian/evaluations/retry] failed', { sessionId, error })
    return NextResponse.json({ error: 'The differential retry could not be scheduled.' }, { status: 503 })
  }
}
