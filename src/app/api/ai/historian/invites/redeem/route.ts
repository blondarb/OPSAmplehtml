import { NextResponse } from 'next/server'
import { allowedAppOrigins, checkPublicRouteAbuse } from '@/lib/api/publicRouteGuard'
import {
  HISTORIAN_GRANT_COOKIE,
  HISTORIAN_GRANT_TTL_SECONDS,
} from '@/lib/historian/invitationTokens'
import { redeemHistorianInvitation } from '@/lib/historian/invitationStore'

const MAX_TOKEN_LENGTH = 256

export async function POST(request: Request) {
  const guard = checkPublicRouteAbuse(request, 'historian-invite-redeem', {
    limit: 12,
    windowMs: 5 * 60 * 1000,
    allowedOrigins: allowedAppOrigins(),
  })
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.error },
      {
        status: guard.status,
        ...(guard.retryAfterSeconds
          ? { headers: { 'Retry-After': String(guard.retryAfterSeconds) } }
          : {}),
      },
    )
  }

  const body = await request.json().catch(() => ({}))
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const dateOfBirth = typeof body?.dateOfBirth === 'string' ? body.dateOfBirth.trim() : ''
  if (!token || token.length > MAX_TOKEN_LENGTH || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    return NextResponse.json(
      { error: 'This interview link is invalid or has expired.' },
      { status: 401 },
    )
  }

  const result = await redeemHistorianInvitation(token, dateOfBirth)
  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          result.reason === 'database_error'
            ? 'The interview link cannot be verified right now. Please try again.'
            : 'This interview link is invalid, expired, or has already been used.',
      },
      { status: result.reason === 'database_error' ? 503 : 401 },
    )
  }

  const response = NextResponse.json({ context: result.context })
  response.cookies.set(HISTORIAN_GRANT_COOKIE, result.grantToken, {
    httpOnly: true,
    secure: new URL(request.url).protocol === 'https:' || process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: HISTORIAN_GRANT_TTL_SECONDS,
  })
  return response
}
