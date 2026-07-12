import { describe, expect, it } from 'vitest'

import {
  canonicalLongPacketJSONStringify,
  hashLongPacketConfiguration,
  hashLongPacketEmergency,
  hashLongPacketPlan,
  hashLongPacketResult,
} from '@/lib/triage/longPacketCanonicalHash'

describe('long-packet canonical hashes', () => {
  it('is stable across object insertion order while preserving array order', () => {
    const left = { z: 1, nested: { b: true, a: 'value' }, items: [1, 2] }
    const right = { items: [1, 2], nested: { a: 'value', b: true }, z: 1 }

    expect(canonicalLongPacketJSONStringify(left)).toBe(
      canonicalLongPacketJSONStringify(right),
    )
    expect(hashLongPacketPlan(left)).toBe(hashLongPacketPlan(right))
    expect(hashLongPacketPlan({ ...right, items: [2, 1] })).not.toBe(
      hashLongPacketPlan(left),
    )
  })

  it('domain-separates plan, configuration, and branch result hashes', () => {
    const payload = { version: 'synthetic-v1', value: 7 }

    expect(hashLongPacketPlan(payload)).not.toBe(
      hashLongPacketConfiguration(payload),
    )
    expect(hashLongPacketResult('mapper', payload)).not.toBe(
      hashLongPacketResult('safety', payload),
    )
    expect(hashLongPacketResult('safety', payload)).not.toBe(
      hashLongPacketResult('finalization', payload),
    )
    expect(hashLongPacketEmergency(payload)).not.toBe(
      hashLongPacketResult('safety', payload),
    )
  })

  it.each([
    { name: 'undefined', value: { value: undefined } },
    { name: 'non-finite number', value: { value: Number.NaN } },
    { name: 'bigint', value: { value: BigInt(1) } },
    { name: 'non-plain object', value: new Date() },
  ])('rejects $name rather than hashing ambiguous JSON', ({ value }) => {
    expect(() => canonicalLongPacketJSONStringify(value)).toThrow(
      /canonical json/i,
    )
  })

  it('rejects cyclic structures', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => canonicalLongPacketJSONStringify(cyclic)).toThrow(/cyclic/i)
  })
})
