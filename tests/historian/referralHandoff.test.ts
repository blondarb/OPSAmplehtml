import { describe, expect, it } from 'vitest'

import {
  HISTORIAN_REFERRAL_HANDOFF_KEY,
  readHistorianHandoff,
  writeHistorianHandoff,
  type HandoffStorage,
} from '@/lib/historian/referralHandoff'
import type { HistorianReferralInput } from '@/lib/historian/referralContext'

/**
 * In-memory stand-in for sessionStorage — the vitest environment here is
 * 'node', not jsdom, so there is no real Storage global. writeHistorianHandoff
 * / readHistorianHandoff take an injectable storage for exactly this reason.
 */
function fakeStorage(initial: Record<string, string> = {}): HandoffStorage {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

const REFERRAL: HistorianReferralInput = {
  steer: 'directive',
  noteText: 'SYNTHETIC — 62yo with three months of progressive gait imbalance.',
  triage: {
    tierDisplay: 'URGENT',
    urgency: 'urgent',
    subspecialty: 'Movement Disorders',
    clinicalReasons: ['Progressive gait imbalance'],
    redFlags: [],
  },
}

describe('writeHistorianHandoff / readHistorianHandoff round trip', () => {
  it('reads back exactly what was written', () => {
    const storage = fakeStorage()
    const ok = writeHistorianHandoff(REFERRAL, { tierDisplay: 'URGENT', focusHint: 'Movement Disorders' }, storage)
    expect(ok).toBe(true)

    const payload = readHistorianHandoff(storage)
    expect(payload).not.toBeNull()
    expect(payload?.referral).toEqual(REFERRAL)
    expect(payload?.display).toEqual({ tierDisplay: 'URGENT', focusHint: 'Movement Disorders' })
    expect(payload?.version).toBe(1)
  })

  it('is one-shot — a second read after a write returns null', () => {
    const storage = fakeStorage()
    writeHistorianHandoff(REFERRAL, {}, storage)

    const first = readHistorianHandoff(storage)
    expect(first).not.toBeNull()

    const second = readHistorianHandoff(storage)
    expect(second).toBeNull()
  })

  it('removes the storage key on read, even for a payload it goes on to reject', () => {
    const storage = fakeStorage({
      [HISTORIAN_REFERRAL_HANDOFF_KEY]: JSON.stringify({ version: 99, createdAt: Date.now(), referral: {}, display: {} }),
    })
    expect(storage.getItem(HISTORIAN_REFERRAL_HANDOFF_KEY)).not.toBeNull()
    const result = readHistorianHandoff(storage)
    expect(result).toBeNull()
    expect(storage.getItem(HISTORIAN_REFERRAL_HANDOFF_KEY)).toBeNull()
  })

  it('returns null and does not throw when there is nothing stored', () => {
    const storage = fakeStorage()
    expect(readHistorianHandoff(storage)).toBeNull()
  })
})

describe('readHistorianHandoff — malformed input', () => {
  it('rejects corrupt JSON', () => {
    const storage = fakeStorage({ [HISTORIAN_REFERRAL_HANDOFF_KEY]: '{not json' })
    expect(readHistorianHandoff(storage)).toBeNull()
  })

  it('rejects a version mismatch', () => {
    const storage = fakeStorage({
      [HISTORIAN_REFERRAL_HANDOFF_KEY]: JSON.stringify({
        version: 2,
        createdAt: Date.now(),
        referral: REFERRAL,
        display: {},
      }),
    })
    expect(readHistorianHandoff(storage)).toBeNull()
  })

  it('rejects a payload missing required fields', () => {
    const storage = fakeStorage({
      [HISTORIAN_REFERRAL_HANDOFF_KEY]: JSON.stringify({ version: 1 }),
    })
    expect(readHistorianHandoff(storage)).toBeNull()
  })

  it('rejects a bare array or primitive stored under the key', () => {
    const storage = fakeStorage({ [HISTORIAN_REFERRAL_HANDOFF_KEY]: JSON.stringify([1, 2, 3]) })
    expect(readHistorianHandoff(storage)).toBeNull()
  })
})

describe('readHistorianHandoff — staleness', () => {
  const THIRTY_MIN = 30 * 60 * 1000

  it('accepts a payload written just under 30 minutes ago', () => {
    const storage = fakeStorage()
    const writtenAt = 1_000_000
    writeHistorianHandoff(REFERRAL, {}, storage, writtenAt)
    const payload = readHistorianHandoff(storage, writtenAt + THIRTY_MIN - 1)
    expect(payload).not.toBeNull()
  })

  it('rejects a payload written more than 30 minutes ago', () => {
    const storage = fakeStorage()
    const writtenAt = 1_000_000
    writeHistorianHandoff(REFERRAL, {}, storage, writtenAt)
    const payload = readHistorianHandoff(storage, writtenAt + THIRTY_MIN + 1)
    expect(payload).toBeNull()
  })

  it('staleness is evaluated against createdAt at write time, not time-since-mount', () => {
    const storage = fakeStorage()
    // Written "long ago" relative to `now` passed at read time.
    const writtenAt = 0
    writeHistorianHandoff(REFERRAL, {}, storage, writtenAt)
    expect(readHistorianHandoff(storage, THIRTY_MIN + 1)).toBeNull()
  })
})

describe('writeHistorianHandoff — failure handling', () => {
  it('returns false and does not throw when storage.setItem throws (e.g. private-mode Safari)', () => {
    const storage: HandoffStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    }
    expect(() => writeHistorianHandoff(REFERRAL, {}, storage)).not.toThrow()
    expect(writeHistorianHandoff(REFERRAL, {}, storage)).toBe(false)
  })

  it('returns false when no storage is available at all', () => {
    expect(writeHistorianHandoff(REFERRAL, {}, null)).toBe(false)
  })
})
