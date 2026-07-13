/**
 * POST /api/ai/clara/redeem — exchange a shareable invite token for a session.
 *
 * This is the PUBLIC entry point for the invite-link flow: someone opens
 * /rnd/clara?invite=<token> and the gate component posts the token here. We
 * verify it with the same signed-token contract as the password path
 * (verifyGateToken — fail-closed on missing/invalid/expired/unconfigured) and,
 * if valid, set a fresh 24h session cookie. The long-lived invite token stays
 * in the URL so the link keeps working (for anyone who has it) until it expires
 * or CLARA_TEST_PASSWORD is rotated. Synthetic/internal R&D surface only.
 */

import { NextResponse } from 'next/server'
import {
  CLARA_GATE_COOKIE,
  CLARA_GATE_TTL_SECONDS,
  isGateConfigured,
  mintGateToken,
  verifyGateToken,
} from '@/lib/clara/testGate'

export async function POST(request: Request) {
  if (!isGateConfigured()) {
    return NextResponse.json(
      { error: 'Clara test gate is not configured (CLARA_TEST_PASSWORD unset).' },
      { status: 503 },
    )
  }

  const body = await request.json().catch(() => ({}))
  const token = typeof body?.token === 'string' ? body.token : ''

  if (!verifyGateToken(token)) {
    return NextResponse.json({ error: 'This invite link is invalid or has expired.' }, { status: 401 })
  }

  // Issue a fresh normal-length session token, not the long-lived invite token.
  const sessionToken = mintGateToken()
  if (!sessionToken) {
    return NextResponse.json({ error: 'Failed to mint session token.' }, { status: 500 })
  }

  const origin = request.headers.get('origin') || ''
  const response = NextResponse.json({ ok: true })
  response.cookies.set(CLARA_GATE_COOKIE, sessionToken, {
    httpOnly: true,
    secure: origin.startsWith('https'),
    sameSite: 'lax',
    path: '/',
    maxAge: CLARA_GATE_TTL_SECONDS,
  })
  return response
}
