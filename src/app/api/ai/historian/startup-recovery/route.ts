import { NextResponse } from 'next/server'
import { verifyFlushToken } from '@/lib/historian/flushToken'
import {
  recoverHistorianInvitationStartup,
  type HistorianStartupRecoveryReason,
} from '@/lib/historian/invitationStore'
import type { VoiceStartupFailureStage } from '@/lib/voice/providerTypes'

const ALLOWED_REASONS = new Set<HistorianStartupRecoveryReason>([
  'provider_error',
  'transport_lost',
])
const ALLOWED_STAGES = new Set<VoiceStartupFailureStage>([
  'websocket_unavailable',
  'websocket_after_open',
  'microphone_setup',
  'microphone_runtime',
  'provider_setup',
  'provider_runtime',
  'transport_after_open',
])

function allowlistedBrowserFamily(userAgent: string): 'edge' | 'chrome' | 'firefox' | 'safari' | 'other' {
  if (/Edg\//.test(userAgent)) return 'edge'
  if (/(?:Chrome|CriOS)\//.test(userAgent)) return 'chrome'
  if (/(?:Firefox|FxiOS)\//.test(userAgent)) return 'firefox'
  if (/Safari\//.test(userAgent)) return 'safari'
  return 'other'
}

function allowlistedPlatform(userAgent: string): 'android' | 'ios' | 'mac' | 'windows' | 'other' {
  if (/Android/.test(userAgent)) return 'android'
  if (/(?:iPhone|iPad|iPod)/.test(userAgent)) return 'ios'
  if (/Macintosh/.test(userAgent)) return 'mac'
  if (/Windows/.test(userAgent)) return 'windows'
  return 'other'
}

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

  let body: { sessionId?: unknown; reason?: unknown; stage?: unknown }
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
  if (
    body.stage !== undefined &&
    (typeof body.stage !== 'string' || !ALLOWED_STAGES.has(body.stage as VoiceStartupFailureStage))
  ) {
    return NextResponse.json({ error: 'Invalid startup failure stage.' }, { status: 400 })
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
    stage: body.stage ?? 'unspecified',
    browser: allowlistedBrowserFamily(request.headers.get('user-agent') ?? ''),
    platform: allowlistedPlatform(request.headers.get('user-agent') ?? ''),
    replayed: result.replayed,
  }))
  return NextResponse.json({ recovered: true })
}
