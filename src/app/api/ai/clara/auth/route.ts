import { NextResponse } from 'next/server'
import {
  checkPassword,
  mintGateToken,
  isGateConfigured,
  CLARA_GATE_COOKIE,
  CLARA_GATE_TTL_SECONDS,
} from '@/lib/clara/testGate'

/**
 * POST /api/ai/clara/auth — password check for the Clara voice test page.
 * See src/lib/clara/testGate.ts for the mechanism.
 */
export async function POST(request: Request) {
  if (!isGateConfigured()) {
    return NextResponse.json(
      { error: 'Clara test gate is not configured (CLARA_TEST_PASSWORD unset).' },
      { status: 503 },
    )
  }

  const body = await request.json().catch(() => ({}))
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!checkPassword(password)) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
  }

  const token = mintGateToken()
  if (!token) {
    return NextResponse.json({ error: 'Failed to mint gate token.' }, { status: 500 })
  }

  const origin = request.headers.get('origin') || ''
  const response = NextResponse.json({ ok: true })
  response.cookies.set(CLARA_GATE_COOKIE, token, {
    httpOnly: true,
    secure: origin.startsWith('https'),
    sameSite: 'lax',
    // Scoped to '/' (not just /rnd/clara) so the cookie also rides along on
    // the /api/ai/clara/* fetches the page makes — those routes independently
    // re-verify the same token (defense-in-depth: they mint relay tokens and
    // invoke Bedrock, so they must not be reachable by an unauthenticated
    // client just because they sit outside middleware's Cognito check).
    path: '/',
    maxAge: CLARA_GATE_TTL_SECONDS,
  })
  return response
}
