import crypto from 'crypto'

const PKCE_COOKIE = 'cognito_pkce'
const PKCE_TTL_SECONDS = 10 * 60

interface PkceCookie {
  state: string
  verifier: string
  returnTo: string
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64url')
}

function safeReturnTo(value: string | null): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return '/'
  }
  return value
}

export function createPkceLogin(returnTo: string | null) {
  const verifier = base64url(crypto.randomBytes(32))
  const state = base64url(crypto.randomBytes(32))
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const cookie: PkceCookie = { state, verifier, returnTo: safeReturnTo(returnTo) }
  return {
    state,
    verifier,
    challenge,
    cookie: Buffer.from(JSON.stringify(cookie)).toString('base64url'),
  }
}

export function readPkceCallback(cookieValue: string | undefined, state: string | null): PkceCookie | null {
  if (!cookieValue || !state) return null
  try {
    const parsed = JSON.parse(Buffer.from(cookieValue, 'base64url').toString('utf8')) as Partial<PkceCookie>
    if (!parsed || typeof parsed.state !== 'string' || typeof parsed.verifier !== 'string' || typeof parsed.returnTo !== 'string') {
      return null
    }
    const expected = Buffer.from(parsed.state)
    const received = Buffer.from(state)
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null
    return { state: parsed.state, verifier: parsed.verifier, returnTo: safeReturnTo(parsed.returnTo) }
  } catch {
    return null
  }
}

export const cognitoPkceCookie = {
  name: PKCE_COOKIE,
  maxAge: PKCE_TTL_SECONDS,
}
