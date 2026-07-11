/**
 * POST /api/ai/clara/invite — mint a shareable invite link.
 *
 * AUTH-GATED: the caller must already hold a valid Clara session cookie (i.e.
 * they got in via the password or a prior invite). Returns a long-lived signed
 * token and the full share URL; anyone who opens that URL is auto-admitted via
 * /api/ai/clara/redeem without a password. Body: { days?: number } (default 14,
 * capped at 90). Revoke all outstanding invites (and the password) by rotating
 * CLARA_TEST_PASSWORD. Synthetic/internal R&D surface only — no PHI.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { CLARA_GATE_COOKIE, isGateConfigured, mintGateToken, verifyGateToken } from '@/lib/clara/testGate'

const DEFAULT_DAYS = 14
const MAX_DAYS = 90

export async function POST(request: Request) {
  if (!isGateConfigured()) {
    return NextResponse.json({ error: 'Clara test gate is not configured.' }, { status: 503 })
  }

  const cookieStore = await cookies()
  if (!verifyGateToken(cookieStore.get(CLARA_GATE_COOKIE)?.value)) {
    return NextResponse.json({ error: 'Not authorized to mint invite links.' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  let days = Number(body?.days)
  if (!Number.isFinite(days) || days <= 0) days = DEFAULT_DAYS
  days = Math.min(days, MAX_DAYS)

  const token = mintGateToken(Math.floor(days * 24 * 60 * 60))
  if (!token) {
    return NextResponse.json({ error: 'Failed to mint invite token.' }, { status: 500 })
  }

  const origin = request.headers.get('origin') || ''
  const path = `/rnd/clara?invite=${encodeURIComponent(token)}`
  return NextResponse.json({
    token,
    path,
    url: origin ? `${origin}${path}` : path,
    expiresInDays: days,
  })
}
