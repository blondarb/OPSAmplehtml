import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * In-memory stand-in for historian_transcript_events that faithfully
 * reproduces the one behavior this gate cares about: `ON CONFLICT
 * (session_id, seq) DO NOTHING` — a row already present for a
 * (session_id, seq) pair is silently skipped (not counted in rowCount),
 * exactly like the real UNIQUE constraint from migration 056.
 */
const { queryMock, table, getPoolMock } = vi.hoisted(() => {
  const table = new Map<
    string,
    { id: number; session_id: string; seq: number; role: string; text: string; ts_offset_s: number | null }
  >()
  let nextId = 1
  const queryMock = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (!sql.includes('INSERT INTO historian_transcript_events')) {
      return { rows: [], rowCount: 0 }
    }
    const inserted: { id: number }[] = []
    for (let i = 0; i < values.length; i += 5) {
      const [sessionId, seq, role, text, tsOffsetS] = values.slice(i, i + 5) as [
        string,
        number,
        string,
        string,
        number | null,
      ]
      const key = `${sessionId}:${seq}`
      if (table.has(key)) continue // ON CONFLICT (session_id, seq) DO NOTHING
      const row = { id: nextId++, session_id: sessionId, seq, role, text, ts_offset_s: tsOffsetS }
      table.set(key, row)
      inserted.push({ id: row.id })
    }
    return { rows: inserted, rowCount: inserted.length }
  })
  const getPoolMock = vi.fn(async () => ({ query: queryMock }))
  return { queryMock, table, getPoolMock }
})

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { POST } from '@/app/api/ai/historian/transcript-flush/route'
import { mintFlushToken } from '@/lib/historian/flushToken'

const SESSION_ID = 'session-crash-sim'

interface SyntheticEntry {
  seq: number
  role: 'assistant' | 'user'
  text: string
  tsOffsetS: number
}

function buildEntries(n: number): SyntheticEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    seq: i + 1,
    role: i % 2 === 0 ? 'assistant' : 'user',
    text: `Synthetic turn ${i + 1}`,
    tsOffsetS: i * 4,
  }))
}

async function flushBatch(token: string, entries: SyntheticEntry[], sessionId = SESSION_ID) {
  const request = new Request('http://historian.test/api/ai/historian/transcript-flush', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sessionId, entries }),
  })
  return POST(request)
}

describe('transcript-flush route', () => {
  beforeEach(() => {
    table.clear()
    queryMock.mockClear()
    process.env.HISTORIAN_FLUSH_SECRET = 'crash-sim-secret'
  })

  describe('crash-sim durability gate', () => {
    it('retains events 1-9 and consolidates them in order when the client dies before flushing seq 10', async () => {
      const token = mintFlushToken(SESSION_ID)
      const all = buildEntries(10)

      // Flush in batches of 3 — mirrors the client's real "flush every 3
      // unflushed entries" trigger (useRealtimeSession.ts).
      const batch1 = all.slice(0, 3) // seq 1-3
      const batch2 = all.slice(3, 6) // seq 4-6
      const batch3 = all.slice(6, 9) // seq 7-9
      // seq 10 is NEVER sent — the client "dies" right after seq 9 lands,
      // before a 4th flush (threshold or pagehide) could ever fire.

      const res1 = await flushBatch(token, batch1)
      expect(res1.status).toBe(200)
      expect((await res1.json()).accepted).toBe(3)

      const res2 = await flushBatch(token, batch2)
      expect(res2.status).toBe(200)
      expect((await res2.json()).accepted).toBe(3)

      const res3 = await flushBatch(token, batch3)
      expect(res3.status).toBe(200)
      expect((await res3.json()).accepted).toBe(3)

      // Retry batch3 — simulates a client that never saw the ack (e.g. the
      // keepalive fetch on pagehide) and resends on the next trigger. Must
      // be a no-op, not a duplicate: fail-open retries are expected.
      const res3Retry = await flushBatch(token, batch3)
      expect(res3Retry.status).toBe(200)
      expect((await res3Retry.json()).accepted).toBe(0)

      expect(table.size).toBe(9)

      // Consolidation: reconstruct the transcript from durable events and
      // confirm it exactly matches what was actually flushed, in seq order.
      const consolidated = Array.from(table.values())
        .sort((a, b) => a.seq - b.seq)
        .map((row) => ({ seq: row.seq, role: row.role, text: row.text, tsOffsetS: row.ts_offset_s }))

      expect(consolidated).toEqual(all.slice(0, 9))
      expect(consolidated.some((e) => e.seq === 10)).toBe(false)
    })
  })

  describe('auth + validation', () => {
    it('rejects a request whose bearer token sessionId does not match the body sessionId', async () => {
      const token = mintFlushToken('some-other-session')
      const res = await flushBatch(token, buildEntries(1))
      expect(res.status).toBe(403)
      expect(table.size).toBe(0)
    })

    it('rejects a missing token', async () => {
      const request = new Request('http://historian.test/api/ai/historian/transcript-flush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: SESSION_ID, entries: buildEntries(1) }),
      })
      const res = await POST(request)
      expect(res.status).toBe(403)
    })

    it('rejects a tampered token', async () => {
      const token = mintFlushToken(SESSION_ID)
      const tampered = token.slice(0, -1) + (token.at(-1) === 'A' ? 'B' : 'A')
      const res = await flushBatch(tampered, buildEntries(1))
      expect(res.status).toBe(403)
    })

    it('rejects more than 50 entries in one request', async () => {
      const token = mintFlushToken(SESSION_ID)
      const res = await flushBatch(token, buildEntries(51))
      expect(res.status).toBe(413)
      expect(table.size).toBe(0)
    })

    it('rejects a seq beyond the 500/session cap', async () => {
      const token = mintFlushToken(SESSION_ID)
      const res = await flushBatch(token, [{ seq: 501, role: 'user', text: 'x', tsOffsetS: 0 }])
      expect(res.status).toBe(413)
    })

    it('rejects a malformed entry (empty text) with a 400 that does not echo it', async () => {
      const token = mintFlushToken(SESSION_ID)
      const res = await flushBatch(token, [{ seq: 1, role: 'user', text: '   ', tsOffsetS: 0 }])
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(JSON.stringify(body)).not.toContain('   ')
    })

    it('is a no-op 200 for an empty entries array', async () => {
      const token = mintFlushToken(SESSION_ID)
      const res = await flushBatch(token, [])
      expect(res.status).toBe(200)
      expect((await res.json()).accepted).toBe(0)
    })
  })
})
