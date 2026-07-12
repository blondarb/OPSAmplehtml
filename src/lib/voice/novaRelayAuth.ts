import crypto from 'crypto'

/**
 * The exact Nova configuration authorized by the application server and
 * replayed by the browser in its first relay frame.
 */
export interface NovaRelayStartConfig {
  instructions: string
  tools: unknown[]
  voiceId?: string
  sessionType: string
}

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

/** Canonicalize the JSON representation that will cross the WebSocket. */
function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) {
    throw new TypeError('Nova relay start config must be JSON serializable')
  }
  return JSON.stringify(sortJson(JSON.parse(serialized) as JsonValue))
}

export function computeNovaRelayConfigDigest(config: NovaRelayStartConfig): string {
  return crypto
    .createHash('sha256')
    .update(canonicalJson(config))
    .digest('base64url')
}

/**
 * Mint a short-lived HMAC authorization bound to the exact Nova start
 * configuration. `nowSeconds` is injectable so the pure contract is testable.
 */
export function mintNovaRelayToken(
  config: NovaRelayStartConfig,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  jti = crypto.randomUUID(),
): string {
  if (!secret) throw new Error('Nova relay shared secret is required')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jti)) {
    throw new Error('Nova relay token jti must be a UUIDv4')
  }

  const payloadB64 = Buffer.from(
    JSON.stringify({
      exp: nowSeconds + 120,
      configDigest: computeNovaRelayConfigDigest(config),
      jti: jti.toLowerCase(),
    }),
  ).toString('base64url')
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url')
  return `${payloadB64}.${signature}`
}
