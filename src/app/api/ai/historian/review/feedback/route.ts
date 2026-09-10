/**
 * Human-in-the-loop review feedback for the /rnd/historian dashboard.
 *
 * POST — upsert this reviewer's agree/disagree + notes for one section of a
 *   real interview's review. Body: { sessionId, section, verdict, notes? }.
 *   One verdict per (session, reviewer, section): re-submitting overwrites.
 * GET  — return all feedback rows for ?sessionId=<id> (every reviewer).
 *
 * Cognito-gated; reviewer identity comes from the id token, never the body.
 * Stored in historian_review_feedback (migration 065). Until that migration is
 * applied the table is absent (42P01) — treated as benign: GET returns [] and
 * POST reports storage-not-ready so the UI can degrade instead of hard-erroring.
 */

import { NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'

const SECTIONS = new Set(['differential', 'physician_summary', 'thoroughness'])
const VERDICTS = new Set(['agree', 'disagree'])

export async function GET(request: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const sessionId = (searchParams.get('sessionId') || '').trim()
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })

  try {
    const { getPool } = await import('@/lib/db')
    const pool = await getPool()
    const { rows } = await pool.query(
      `SELECT section, verdict, notes, reviewer, updated_at
       FROM historian_review_feedback
       WHERE session_id = $1
       ORDER BY updated_at DESC`,
      [sessionId],
    )
    return NextResponse.json({ feedback: rows })
  } catch (err: any) {
    if (err?.code === '42P01') return NextResponse.json({ feedback: [] })
    console.error('Historian review/feedback GET error:', err?.message || err)
    return NextResponse.json({ error: 'Failed to load feedback' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const body = await request.json().catch(() => null)
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
    const section = typeof body?.section === 'string' ? body.section.trim() : ''
    const verdict = typeof body?.verdict === 'string' ? body.verdict.trim() : ''
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : null

    if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    if (!SECTIONS.has(section)) return NextResponse.json({ error: 'invalid section' }, { status: 400 })
    if (!VERDICTS.has(verdict)) return NextResponse.json({ error: 'invalid verdict' }, { status: 400 })

    const { getPool } = await import('@/lib/db')
    const pool = await getPool()
    await pool.query(
      `INSERT INTO historian_review_feedback (session_id, reviewer, section, verdict, notes, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (session_id, reviewer, section)
       DO UPDATE SET verdict = EXCLUDED.verdict, notes = EXCLUDED.notes, updated_at = now()`,
      [sessionId, user.email, section, verdict, notes],
    )
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    if (err?.code === '42P01') {
      return NextResponse.json(
        { error: 'feedback storage not ready (migration 065 not applied)' },
        { status: 503 },
      )
    }
    console.error('Historian review/feedback POST error:', err?.message || err)
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
  }
}
