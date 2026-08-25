import { NextResponse } from 'next/server'
import { verifyFlushToken } from '@/lib/historian/flushToken'
import {
  recoverHistorianInvitationStartup,
  type HistorianStartupRecoveryReason,
} from '@/lib/historian/invitationStore'

const ALLOWED_REASONS = new Set<HistorianStartupRecoveryReason>([
  'provider_error',
  'transport_lost',
])

/**
 * Reopens only a zero-turn, identity-verified invited session after a voice
 * startup failure. The flush bearer binds the request to the server-minted
 * session; no transcript, patient field, invitation bearer, or credential is
 * accepted or logged here.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const verified = token ? await verifyFlushToken(token) : null
  if (!verified) {
    return NextResponse.json({ error: 'Invalid or missing recovery token.' }, { status: 403 })
  }

  let body: { sessionId?: unknown; reason?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  if (typeof body.sessionId !== 'string' || body.sessionId !== verified.sessionId) {
    return NextResponse.json({ error: 'Token/session binding mismatch.' }, { status: 403 })
  }
  if (!verified.startupAttemptId) {
    return NextResponse.json({ error: 'Token/startup-attempt binding missing.' }, { status: 403 })
  }
  if (typeof body.reason !== 'string' || !ALLOWED_REASONS.has(body.reason as HistorianStartupRecoveryReason)) {
    return NextResponse.json({ error: 'Invalid startup failure reason.' }, { status: 400 })
  }

  const result = await recoverHistorianInvitationStartup(
    body.sessionId,
    verified.startupAttemptId,
    body.reason as HistorianStartupRecoveryReason,
  )
  if (!result.ok) {
    return NextResponse.json(
      { error: 'This interrupted interview cannot be reopened safely.' },
      { status: result.reason === 'database_error' ? 503 : 409 },
    )
  }

  console.info('[historian/startup-recovery]', JSON.stringify({
    event: 'zero_turn_invitation_reopened',
    reason: body.reason,
    replayed: result.replayed,
  }))
  return NextResponse.json({ recovered: true })
}
