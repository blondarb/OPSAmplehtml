import { createHash } from 'node:crypto'

export const LONG_PACKET_CANONICAL_HASH_VERSION =
  'neurology-long-packet-canonical-json-sha256-v1'

export type LongPacketResultHashKind =
  | 'mapper'
  | 'safety'
  | 'finalization'

const MAX_CANONICAL_DEPTH = 100

function canonicalize(
  value: unknown,
  ancestors: WeakSet<object>,
  depth: number,
): unknown {
  if (depth > MAX_CANONICAL_DEPTH) {
    throw new Error('Canonical JSON exceeds the supported nesting depth.')
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Canonical JSON requires finite numbers.')
    }
    return Object.is(value, -0) ? 0 : value
  }
  if (typeof value !== 'object') {
    throw new Error('Canonical JSON contains an unsupported value.')
  }
  if (ancestors.has(value)) {
    throw new Error('Canonical JSON cannot contain cyclic structures.')
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) {
        throw new Error('Canonical JSON arrays cannot be sparse or extended.')
      }
      return value.map((item) => canonicalize(item, ancestors, depth + 1))
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Canonical JSON requires plain objects.')
    }
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [
          key,
          canonicalize(record[key], ancestors, depth + 1),
        ]),
    )
  } finally {
    ancestors.delete(value)
  }
}

export function canonicalLongPacketJSONStringify(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value, new WeakSet(), 0))
  if (typeof serialized !== 'string') {
    throw new Error('Canonical JSON could not be serialized.')
  }
  return serialized
}

function domainHash(domain: string, payload: unknown): string {
  return createHash('sha256')
    .update(
      canonicalLongPacketJSONStringify({
        domain,
        hashVersion: LONG_PACKET_CANONICAL_HASH_VERSION,
        payload,
      }),
      'utf8',
    )
    .digest('hex')
}

export function hashLongPacketPlan(plan: unknown): string {
  return domainHash('long_packet_plan', plan)
}

export function hashLongPacketConfiguration(configuration: unknown): string {
  return domainHash('long_packet_run_configuration', configuration)
}

export function hashLongPacketEmergency(emergency: unknown): string {
  return domainHash('long_packet_deterministic_emergency', emergency)
}

export function hashLongPacketResult(
  kind: LongPacketResultHashKind,
  result: unknown,
): string {
  return domainHash(`long_packet_${kind}_result`, result)
}
