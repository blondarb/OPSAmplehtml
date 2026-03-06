/**
 * Auth Session Cookie Management
 *
 * POST: Stores Cognito tokens in httpOnly cookies after client-side auth.
 * DELETE: Clears auth cookies on logout.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

export async function POST(request: Request) {
  try {
    const { idToken, accessToken, refreshToken } = await request.json()

    if (!idToken) {
      return NextResponse.json({ error: 'Missing tokens' }, { status: 400 })
    }

    const cookieStore = await cookies()

    // ID token — used for auth verification (contains sub + email claims)
    // Cognito ID tokens expire in 1 hour
    cookieStore.set('cognito-id-token', idToken, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60, // 1 hour
    })

    if (accessToken) {
      cookieStore.set('cognito-access-token', accessToken, {
        ...COOKIE_OPTIONS,
        maxAge: 60 * 60,
      })
    }

    if (refreshToken) {
      // Refresh token lasts 30 days
      cookieStore.set('cognito-refresh-token', refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: 60 * 60 * 24 * 30,
      })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete('cognito-id-token')
  cookieStore.delete('cognito-access-token')
  cookieStore.delete('cognito-refresh-token')

  return NextResponse.json({ ok: true })
}
