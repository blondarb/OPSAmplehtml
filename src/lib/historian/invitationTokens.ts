import crypto from 'crypto'

export const HISTORIAN_GRANT_COOKIE = 'historian_patient_grant'
export const HISTORIAN_INVITE_TTL_SECONDS = 48 * 60 * 60
export const HISTORIAN_GRANT_TTL_SECONDS = 4 * 60 * 60

const TOKEN_BYTES = 32

export interface OpaqueToken {
  raw: string
  hash: string
}

export function hashHistorianToken(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex')
}

export function mintHistorianToken(): OpaqueToken {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString('base64url')
  return { raw, hash: hashHistorianToken(raw) }
}

export function readCookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const key = part.slice(0, separator).trim()
    if (key !== name) continue
    const value = part.slice(separator + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return null
    }
  }
  return null
}
