import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCognitoClientSecret } from '@/lib/secrets'
import {
  constantTimeStateMatch,
  OAUTH_RETURN_TO_COOKIE,
  OAUTH_STATE_COOKIE,
  resolveTrustedAppOrigin,
  sanitizeOAuthReturnTo,
} from '@/lib/auth/oauthFlow'

const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || 'auth.neuroplans.app'
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || ''

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || ''

function redirectWithError(
  origin: string,
  error: string,
  description?: string | null,
) {
  const params = new URLSearchParams({ error })
  if (description) params.set('error_description', description)
  return NextResponse.redirect(new URL(`/login?${params}`, origin))
}

function clearOAuthFlowCookies(response: NextResponse, secure: boolean) {
  const options = {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  }
  response.cookies.set(OAUTH_STATE_COOKIE, '', options)
  response.cookies.set(OAUTH_RETURN_TO_COOKIE, '', options)
  return response
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const cognitoError = request.nextUrl.searchParams.get('error')
  const cognitoErrorDescription = request.nextUrl.searchParams.get('error_description')

  const origin = resolveTrustedAppOrigin({
    configuredAppUrl: APP_URL,
    requestUrl: request.url,
    nodeEnv: process.env.NODE_ENV,
  })
  if (!origin) {
    return NextResponse.json(
      { error: 'OAuth server configuration is unavailable' },
      { status: 503 },
    )
  }
  const isSecure = origin.startsWith('https://')
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value ?? null
  if (!constantTimeStateMatch(state, expectedState)) {
    return clearOAuthFlowCookies(
      redirectWithError(origin, 'invalid_oauth_state'),
      isSecure,
    )
  }
  const returnTo = sanitizeOAuthReturnTo(
    request.cookies.get(OAUTH_RETURN_TO_COOKIE)?.value,
  )

  if (cognitoError) {
    console.error('Cognito returned error on callback:', cognitoError, cognitoErrorDescription)
    return clearOAuthFlowCookies(
      redirectWithError(origin, cognitoError, cognitoErrorDescription),
      isSecure,
    )
  }

  if (!code) {
    return clearOAuthFlowCookies(
      redirectWithError(origin, 'no_code'),
      isSecure,
    )
  }

  const redirectUri = `${origin}/api/auth/callback`
  const clientSecret = await getCognitoClientSecret()
  if (!CLIENT_ID || !clientSecret) {
    return clearOAuthFlowCookies(
      redirectWithError(origin, 'oauth_server_configuration_unavailable'),
      isSecure,
    )
  }

  // Exchange authorization code for tokens (confidential client — includes client_secret)
  let tokenRes: Response
  try {
    tokenRes = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })
  } catch {
    return clearOAuthFlowCookies(
      redirectWithError(origin, 'token_exchange_unavailable'),
      isSecure,
    )
  }

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text()
    console.error('Cognito token exchange failed:', tokenRes.status, errBody)
    let description: string | null = null
    try {
      const parsed = JSON.parse(errBody)
      description = parsed.error_description || parsed.error || null
    } catch {
      description = errBody ? errBody.slice(0, 200) : null
    }
    return clearOAuthFlowCookies(
      redirectWithError(origin, 'token_exchange', description),
      isSecure,
    )
  }

  const tokens: unknown = await tokenRes.json().catch(() => null)
  if (
    typeof tokens !== 'object' ||
    tokens === null ||
    typeof (tokens as Record<string, unknown>).id_token !== 'string' ||
    !(tokens as Record<string, unknown>).id_token ||
    typeof (tokens as Record<string, unknown>).access_token !== 'string' ||
    !(tokens as Record<string, unknown>).access_token
  ) {
    return clearOAuthFlowCookies(
      redirectWithError(origin, 'invalid_token_response'),
      isSecure,
    )
  }
  const id_token = (tokens as Record<string, string>).id_token
  const access_token = (tokens as Record<string, string>).access_token
  const refresh_token = (tokens as Record<string, unknown>).refresh_token

  const response = NextResponse.redirect(new URL(returnTo, origin))
  const cookieOpts = {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax' as const,
    path: '/',
  }

  response.cookies.set('id_token', id_token, { ...cookieOpts, maxAge: 60 * 60 })
  response.cookies.set('access_token', access_token, { ...cookieOpts, maxAge: 60 * 60 })
  if (typeof refresh_token === 'string' && refresh_token) {
    response.cookies.set('refresh_token', refresh_token, { ...cookieOpts, maxAge: 60 * 60 * 24 * 30 })
  }

  // Clear legacy cookie names if present
  response.cookies.set('cognito-id-token', '', { ...cookieOpts, maxAge: 0 })
  response.cookies.set('cognito-access-token', '', { ...cookieOpts, maxAge: 0 })
  response.cookies.set('cognito-refresh-token', '', { ...cookieOpts, maxAge: 0 })

  return clearOAuthFlowCookies(response, isSecure)
}
