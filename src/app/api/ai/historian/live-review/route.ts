import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { verifyFlushToken } from '@/lib/historian/flushToken'
import { generateLiveInterviewReview } from '@/lib/historian/liveReview'
import { attestLiveInterviewReview } from '@/lib/historian/liveReviewAttestation'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

const MAX_TRANSCRIPT_ENTRIES = 120
const MAX_TRANSCRIPT_CHARS = 100_000

function bearerToken(request: Request): string {
  const value = request.headers.get('authorization') ?? ''
  return value.startsWith('Bearer ') ? value.slice(7).trim() : ''
}

function parseTranscript(value: unknown): HistorianTranscriptEntry[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_TRANSCRIPT_ENTRIES) return null
  const entries: HistorianTranscriptEntry[] = []
  let totalChars = 0
  let precedingSeq = 0
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const entry = raw as Record<string, unknown>
    if (
      (entry.role !== 'assistant' && entry.role !== 'user') ||
      typeof entry.text !== 'string' ||
      !entry.text.trim() ||
      !Number.isInteger(entry.seq) ||
      (entry.seq as number) !== precedingSeq + 1
    ) return null
    totalChars += entry.text.length
    if (totalChars > MAX_TRANSCRIPT_CHARS) return null
    precedingSeq = entry.seq as number
    entries.push({
      role: entry.role,
      text: entry.text.trim(),
      seq: entry.seq as number,
      timestamp: typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp)
        ? Math.max(0, entry.timestamp)
        : 0,
    })
  }
  return entries.at(-1)?.role === 'user' ? entries : null
}

async function attemptAuthorityIsCurrent(
  sessionId: string,
  startupAttemptId?: string,
): Promise<{ current: boolean; promptVersion: string | null }> {
  const pool = await getPool()
  const result = await pool.query<{
    status: string
    startup_attempt_id: string | null
    interview_prompt_version: string
  }>(
    `SELECT status, startup_attempt_id, interview_prompt_version
       FROM historian_invites
      WHERE session_id = $1`,
    [sessionId],
  )
  const invitation = result.rows[0]
  if (!invitation) return { current: true, promptVersion: null }
  return {
    current: invitation.status === 'in_progress' &&
      !!startupAttemptId &&
      invitation.startup_attempt_id === startupAttemptId,
    promptVersion: invitation.interview_prompt_version,
  }
}

/**
 * Silent in-session review.  The response is returned only to the active
 * patient session and is never logged or displayed.  It may advise the
 * conductor and block premature closure, but it cannot speak, diagnose, or
 * lower deterministic safety handling.
 */
export async function POST(request: Request) {
  const verified = await verifyFlushToken(bearerToken(request))
  if (!verified) {
    return NextResponse.json({ error: 'Invalid or missing review authority.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || body.sessionId !== verified.sessionId) {
    return NextResponse.json({ error: 'Review authority does not match the session.' }, { status: 403 })
  }
  const transcript = parseTranscript(body.transcript)
  if (!transcript) {
    return NextResponse.json({ error: 'Transcript is malformed or outside the review bounds.' }, { status: 400 })
  }

  try {
    const authority = await attemptAuthorityIsCurrent(
      verified.sessionId,
      verified.startupAttemptId,
    )
    if (!authority.current) {
      return NextResponse.json({ error: 'Review authority is stale.' }, { status: 403 })
    }
    const requestedPromptVersion = typeof body.interviewPromptVersion === 'string'
      ? body.interviewPromptVersion
      : null
    const diagnosticDepth = (authority.promptVersion ?? requestedPromptVersion) === 'comprehensive-v4'
    const unsignedArtifact = await generateLiveInterviewReview(transcript, { diagnosticDepth })
    const artifact = await attestLiveInterviewReview(
      verified.sessionId,
      transcript,
      unsignedArtifact,
      verified.startupAttemptId,
    )
    return NextResponse.json(artifact, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch {
    // Never log the model result, transcript, or patient-derived error text.
    console.error('[historian/live-review] review generation failed')
    return NextResponse.json({ error: 'The silent interview review is temporarily unavailable.' }, { status: 503 })
  }
}
