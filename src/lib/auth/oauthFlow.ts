import { randomBytes, timingSafeEqual } from 'node:crypto'

export const OAUTH_STATE_COOKIE = 'sevaro_oauth_state'
export const OAUTH_RETURN_TO_COOKIE = 'sevaro_oauth_return_to'
export const OAUTH_FLOW_MAX_AGE_SECONDS = 10 * 60

export function createOAuthState(): string {
  return randomBytes(32).toString('base64url')
}

export function constantTimeStateMatch(
  received: string | null,
  expected: string | null,
): boolean {
  if (
    !received ||
    !expected ||
    received.length > 128 ||
    expected.length > 128
  ) {
    return false
  }
  const receivedBytes = Buffer.from(received, 'utf8')
  const expectedBytes = Buffer.from(expected, 'utf8')
  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  )
}

export function sanitizeOAuthReturnTo(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.length > 2_048 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return '/'
  }
  try {
    const base = new URL('https://app.invalid')
    const resolved = new URL(value, base)
    if (resolved.origin !== base.origin) return '/'
    return `${resolved.pathname}${resolved.search}`
  } catch {
    return '/'
  }
}

export function resolveTrustedAppOrigin(input: {
  configuredAppUrl: string | undefined
  requestUrl: string
  nodeEnv: string | undefined
}): string | null {
  const configured = input.configuredAppUrl?.trim()
  if (configured) {
    try {
      const url = new URL(configured)
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        (input.nodeEnv === 'production' && url.protocol !== 'https:')
      ) {
        return null
      }
      return url.origin
    } catch {
      return null
    }
  }

  if (input.nodeEnv === 'production') return null
  try {
    const requestUrl = new URL(input.requestUrl)
    if (!['http:', 'https:'].includes(requestUrl.protocol)) return null
    return requestUrl.origin
  } catch {
    return null
  }
}
