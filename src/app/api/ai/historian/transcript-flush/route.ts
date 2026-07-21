import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { verifyFlushToken } from '@/lib/historian/flushToken'

const MAX_ENTRIES_PER_REQUEST = 50
const MAX_SEQ_PER_SESSION = 500
const KNOWN_ROLES = new Set(['assistant', 'user'])

interface FlushEntryInput {
  seq: number
  role: 'assistant' | 'user'
  text: string
  tsOffsetS?: number | null
}

/**
 * Durable transcript-event flush endpoint. Client (useRealtimeSession)
 * calls this every few turns, on a provider transport error, and once more
 * via a keepalive fetch on pagehide — so a crashed tab or dropped
 * transport loses at most a couple of unflushed entries instead of the
 * whole interview.
 *
 * No auth beyond the bearer token (same "patient-portal" bar as /save and
 * /session — no Cognito auth on this surface today). The token binds the
 * request to the sessionId the server minted at /session; a request for
 * any other sessionId is rejected. Idempotent by design (ON CONFLICT DO
 * NOTHING) since retries and the keepalive send can both legitimately
 * resend an already-flushed batch.
 *
 * SAFETY: never echo request entry text back in any response or log —
 * patient utterance text must never be logged server-side (errors
 * included). Only structural facts (counts, session id, seq numbers) are
 * ever included below.
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    const verified = token ? verifyFlushToken(token) : null
    if (!verified) {
      return NextResponse.json({ error: 'Invalid or missing flush token' }, { status: 403 })
    }

    let body: { sessionId?: unknown; entries?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const sessionId = body.sessionId
    if (typeof sessionId !== 'string' || !sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }
    if (sessionId !== verified.sessionId) {
      return NextResponse.json({ error: 'Token/sessionId mismatch' }, { status: 403 })
    }

    const rawEntries = body.entries
    if (!Array.isArray(rawEntries)) {
      return NextResponse.json({ error: 'entries must be an array' }, { status: 400 })
    }
    if (rawEntries.length === 0) {
      return NextResponse.json({ accepted: 0 })
    }
    if (rawEntries.length > MAX_ENTRIES_PER_REQUEST) {
      return NextResponse.json(
        { error: `Too many entries in one request (max ${MAX_ENTRIES_PER_REQUEST})` },
        { status: 413 },
      )
    }

    const entries: FlushEntryInput[] = []
    for (const raw of rawEntries) {
      if (!raw || typeof raw !== 'object') {
        return NextResponse.json({ error: 'Malformed entry' }, { status: 400 })
      }
      const e = raw as Record<string, unknown>
      if (typeof e.seq !== 'number' || !Number.isInteger(e.seq) || e.seq < 0) {
        return NextResponse.json({ error: 'Malformed entry: seq' }, { status: 400 })
      }
      if (typeof e.role !== 'string' || !KNOWN_ROLES.has(e.role)) {
        return NextResponse.json({ error: 'Malformed entry: role' }, { status: 400 })
      }
      if (typeof e.text !== 'string' || !e.text.trim()) {
        // Do not echo the (empty/whitespace) value — just name the field.
        return NextResponse.json({ error: 'Malformed entry: text' }, { status: 400 })
      }
      const tsOffsetS =
        typeof e.tsOffsetS === 'number' && Number.isFinite(e.tsOffsetS) ? e.tsOffsetS : null
      if (e.seq > MAX_SEQ_PER_SESSION) {
        return NextResponse.json(
          { error: `seq exceeds per-session cap (${MAX_SEQ_PER_SESSION})` },
          { status: 413 },
        )
      }
      entries.push({ seq: e.seq, role: e.role as 'assistant' | 'user', text: e.text, tsOffsetS })
    }

    const pool = await getPool()
    const values: unknown[] = []
    const valueRows = entries.map((entry) => {
      values.push(sessionId, entry.seq, entry.role, entry.text, entry.tsOffsetS)
      const base = values.length - 5
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`
    })
    const sql = `
      INSERT INTO historian_transcript_events (session_id, seq, role, text, ts_offset_s)
      VALUES ${valueRows.join(', ')}
      ON CONFLICT (session_id, seq) DO NOTHING
      RETURNING id
    `
    const { rowCount } = await pool.query(sql, values)

    return NextResponse.json({ accepted: rowCount ?? 0 })
  } catch (error: unknown) {
    const pgCode = (error as { code?: string } | undefined)?.code
    if (pgCode === '42P01') {
      // historian_transcript_events doesn't exist yet — expected and benign
      // until the rollout task applies migration 056, same precedent as
      // every other new write path this sprint (save/route.ts's integrity
      // cross-check and GET handler, finalDifferential.ts's
      // runFinalDifferential, persistEvaluation.ts). Quiet informational
      // line only — this is NOT a DB failure and must not read as one in
      // logs. The client (useRealtimeSession's flushTranscript) already
      // treats any non-ok response as retry-later and leaves the batch
      // pending for the next flush trigger, so the response is unchanged.
      console.info(
        '[historian/transcript-flush] historian_transcript_events table not present yet (migration 056 not applied) — skipping flush',
      )
    } else {
      // Structural/DB error only — never include request body content.
      console.error(
        '[historian/transcript-flush] error:',
        error instanceof Error ? error.message : String(error),
      )
    }
    return NextResponse.json({ error: 'Failed to flush transcript entries' }, { status: 500 })
  }
}
