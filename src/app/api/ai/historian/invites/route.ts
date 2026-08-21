import { NextResponse } from 'next/server'
import {
  authorizeClinicalAccess,
  clinicalAccessDeniedMessage,
} from '@/lib/auth/clinicalAccess'
import { getPool } from '@/lib/db'
import { createHistorianInvitation } from '@/lib/historian/invitationStore'

function invitationBaseUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  return configured ? configured.replace(/\/$/, '') : new URL(request.url).origin
}

export async function POST(request: Request) {
  const access = await authorizeClinicalAccess({
    action: 'historian.invite',
    allowedRoles: ['clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: clinicalAccessDeniedMessage(access.reason), reason: access.reason },
      { status: access.status },
    )
  }

  const body = await request.json().catch(() => ({}))
  const consultId = typeof body?.consultId === 'string' ? body.consultId.trim() : ''
  if (!consultId) {
    return NextResponse.json({ error: 'consultId is required.' }, { status: 400 })
  }

  const result = await createHistorianInvitation({
    tenantId: access.context.tenantId,
    consultId,
    invitedByUserId: access.context.userId,
    ...(body?.replaceActive === true ? { replaceActive: true } : {}),
  })
  if (!result.ok) {
    if (result.reason === 'consult_not_found') {
      return NextResponse.json({ error: 'Consult not found.' }, { status: 404 })
    }
    if (result.reason === 'interview_in_progress') {
      return NextResponse.json(
        { error: 'This patient has already redeemed a link or started the interview.' },
        { status: 409 },
      )
    }
    if (result.reason === 'patient_identity_unavailable') {
      return NextResponse.json(
        { error: 'This consult needs a patient record with date of birth before a secure link can be created.' },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { error: 'The patient link could not be created.' },
      { status: 503 },
    )
  }

  // The token is deliberately placed after '#'. URL fragments are not sent
  // in HTTP request lines or referrer headers. The patient page removes it
  // from the address bar before redeeming it.
  const url = `${invitationBaseUrl(request)}/patient/historian/invite#token=${encodeURIComponent(result.rawToken)}`
  return NextResponse.json({
    invitation: {
      id: result.inviteId,
      sessionId: result.sessionId,
      url,
      expiresAt: result.expiresAt,
      patientName: result.patientName,
      referralReason: result.referralReason,
      provider: 'nova',
      interviewMode: 'comprehensive',
      interviewPromptVersion: 'comprehensive-v1',
    },
  })
}

export async function GET(request: Request) {
  const access = await authorizeClinicalAccess({
    action: 'historian.start',
    allowedRoles: ['viewer', 'clinician', 'admin'],
  })
  if (!access.ok) {
    return NextResponse.json(
      { error: clinicalAccessDeniedMessage(access.reason), reason: access.reason },
      { status: access.status },
    )
  }

  const consultId = new URL(request.url).searchParams.get('consultId')?.trim()
  if (!consultId) {
    return NextResponse.json({ error: 'consultId is required.' }, { status: 400 })
  }

  try {
    const pool = await getPool()
    const { rows } = await pool.query(
      `SELECT invite.id,
              invite.status,
              invite.expires_at,
              invite.redeemed_at,
              invite.started_at,
              invite.completed_at,
              invite.session_id,
              session.interview_completion_status,
              (session.final_differential IS NOT NULL) AS differential_ready,
              job.status AS evaluation_status
         FROM historian_invites invite
         JOIN historian_sessions session ON session.id = invite.session_id
         LEFT JOIN historian_eval_jobs job ON job.session_id = invite.session_id
        WHERE invite.tenant_id = $1
          AND invite.consult_id = $2
        ORDER BY invite.created_at DESC
        LIMIT 1`,
      [access.context.tenantId, consultId],
    )
    return NextResponse.json({ invitation: rows[0] ?? null })
  } catch (error) {
    console.error('[historian/invites] status lookup failed', { consultId, error })
    return NextResponse.json({ error: 'Invitation status is temporarily unavailable.' }, { status: 503 })
  }
}
