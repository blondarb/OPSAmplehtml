import crypto from 'crypto'

import type { RelayStartConfig } from './wsProtocol.js'

export interface RelayTokenPayload {
  exp: number
  configDigest: string
  jti: string
}

const JTI_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJson(value[key])]),
    )
  }
  return value
}

function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) {
    throw new TypeError('Nova relay start config must be JSON serializable')
  }
  return JSON.stringify(sortJson(JSON.parse(serialized) as JsonValue))
}

export function computeStartConfigDigest(config: RelayStartConfig): string {
  return crypto.createHash('sha256').update(canonicalJson(config)).digest('base64url')
}

export function mintRelayToken(
  config: RelayStartConfig,
  secret: string,
  exp: number,
  jti = crypto.randomUUID(),
): string {
  if (!secret) throw new Error('Nova relay shared secret is required')
  if (!JTI_PATTERN.test(jti)) {
    throw new Error('Nova relay token jti must be a UUIDv4')
  }
  const payloadB64 = Buffer.from(
    JSON.stringify({
      exp,
      configDigest: computeStartConfigDigest(config),
      jti: jti.toLowerCase(),
    }),
  ).toString('base64url')
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url')
  return `${payloadB64}.${signature}`
}

function decodeCanonicalBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  const decoded = Buffer.from(value, 'base64url')
  return decoded.toString('base64url') === value ? decoded : null
}

function decodeSha256Digest(value: string): Buffer | null {
  if (value.length !== 43) return null
  const decoded = decodeCanonicalBase64Url(value)
  return decoded?.length === 32 ? decoded : null
}

/** Verify the HMAC, expiry, and presence of a well-formed SHA-256 config digest. */
export function verifyRelayToken(
  token: string,
  secret: string,
  nowSeconds = Date.now() / 1000,
): RelayTokenPayload | null {
  if (!secret) return null
  const pieces = token.split('.')
  if (pieces.length !== 2 || !pieces[0] || !pieces[1]) return null
  const [payloadB64, suppliedSignature] = pieces

  const suppliedSignatureBytes = decodeSha256Digest(suppliedSignature)
  if (!suppliedSignatureBytes) return null
  const expectedSignatureBytes = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest()
  if (!crypto.timingSafeEqual(suppliedSignatureBytes, expectedSignatureBytes)) return null

  const payloadBytes = decodeCanonicalBase64Url(payloadB64)
  if (!payloadBytes) return null

  let payload: unknown
  let payloadJson: string
  try {
    payloadJson = payloadBytes.toString('utf8')
    payload = JSON.parse(payloadJson)
  } catch {
    return null
  }

  if (
    payload === null ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    Object.keys(payload).sort().join(',') !== 'configDigest,exp,jti' ||
    !Number.isFinite((payload as { exp?: unknown }).exp) ||
    typeof (payload as { exp?: unknown }).exp !== 'number' ||
    !Number.isSafeInteger((payload as { exp: number }).exp) ||
    (payload as { exp: number }).exp <= nowSeconds ||
    (payload as { exp: number }).exp > nowSeconds + 180 ||
    typeof (payload as { configDigest?: unknown }).configDigest !== 'string' ||
    !decodeSha256Digest((payload as { configDigest: string }).configDigest) ||
    typeof (payload as { jti?: unknown }).jti !== 'string' ||
    !JTI_PATTERN.test((payload as { jti: string }).jti)
  ) {
    return null
  }

  const strictPayload = payload as RelayTokenPayload
  if (
    payloadJson !==
    JSON.stringify({
      exp: strictPayload.exp,
      configDigest: strictPayload.configDigest,
      jti: strictPayload.jti.toLowerCase(),
    })
  ) {
    return null
  }

  return {
    exp: strictPayload.exp,
    configDigest: strictPayload.configDigest,
    jti: strictPayload.jti.toLowerCase(),
  }
}

/** Recompute and timing-safe-compare the browser's start config to the signed digest. */
export function matchesSignedStartConfig(
  config: RelayStartConfig,
  expectedDigest: string,
): boolean {
  const expected = decodeSha256Digest(expectedDigest)
  if (!expected) return false
  try {
    const actual = decodeSha256Digest(computeStartConfigDigest(config))
    return actual !== null && crypto.timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
