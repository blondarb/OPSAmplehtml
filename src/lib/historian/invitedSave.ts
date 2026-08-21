import type { PoolClient } from 'pg'
import { getPool } from '@/lib/db'
import type {
  HistorianRedFlag,
  HistorianStructuredOutput,
  HistorianTranscriptEntry,
} from '@/lib/historianTypes'
import { validateTranscript } from './transcriptIntegrity'
import type { HistorianInvitationBinding } from './invitationStore'
import { ensureInvitedHistorianAlert } from './safetyNotification'
import { validateComprehensiveCoverage } from './comprehensiveCoverage'
import {
  completionStatusForTermination,
  parseHistorianTerminationReason,
  terminationMatchesCompletionStatus,
} from './terminationPolicy'

const MAX_TRANSCRIPT_ENTRIES = 500
const MAX_TRANSCRIPT_CHARS = 180_000
const MAX_SUMMARY_CHARS = 30_000
const MAX_RED_FLAGS = 25

export type InvitedHistorianSaveResult =
  | {
      ok: true
      sessionId: string
      consultId: string
      replayed: boolean
      evaluationStatus: 'pending' | 'already_queued'
      redFlags: HistorianRedFlag[]
      patientName: string
      patientId: string | null
      tenantId: string
    }
  | {
      ok: false
      status: 400 | 409 | 413 | 503
      error: string
    }

function integerInRange(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function sanitizeRedFlags(value: unknown): HistorianRedFlag[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_RED_FLAGS).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Record<string, unknown>
    const flag = typeof candidate.flag === 'string' ? candidate.flag.trim().slice(0, 500) : ''
    const context = typeof candidate.context === 'string' ? candidate.context.trim().slice(0, 2_000) : ''
    const severity =
      candidate.severity === 'high' || candidate.severity === 'medium' || candidate.severity === 'low'
        ? candidate.severity
        : null
    return flag && severity ? [{ flag, severity, context }] : []
  })
}

function parseTranscript(value: unknown): HistorianTranscriptEntry[] | null {
  if (!Array.isArray(value) || value.length > MAX_TRANSCRIPT_ENTRIES) return null
  const transcript: HistorianTranscriptEntry[] = []
  for (const [index, entry] of value.entries()) {
    if (!entry || typeof entry !== 'object') return null
    const candidate = entry as Record<string, unknown>
    if (candidate.role !== 'assistant' && candidate.role !== 'user') return null
    if (typeof candidate.text !== 'string' || !candidate.text.trim()) return null
    if (candidate.text.length > 20_000) return null
    if (typeof candidate.timestamp !== 'number' || !Number.isFinite(candidate.timestamp)) return null
    if (
      typeof candidate.seq !== 'number' ||
      !Number.isInteger(candidate.seq) ||
      // useRealtimeSession increments from zero before assigning, so the
      // production transcript contract is contiguous and one-based.
      candidate.seq !== index + 1
    ) {
      return null
    }
    transcript.push({
      role: candidate.role,
      text: candidate.text,
      timestamp: candidate.timestamp,
      seq: candidate.seq,
    })
  }
  return transcript
}

function structuredOutput(value: unknown): HistorianStructuredOutput {
  const base = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as HistorianStructuredOutput)
    : {}
  return {
    ...base,
    interview_mode: 'comprehensive',
    interview_prompt_version: 'comprehensive-v1',
  }
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK')
  } catch {
    // Preserve the original error.
  }
}

export async function saveInvitedHistorianSession(
  binding: HistorianInvitationBinding,
  body: Record<string, unknown>,
  now: Date = new Date(),
): Promise<InvitedHistorianSaveResult> {
  if (body.sessionId !== binding.sessionId) {
    return { ok: false, status: 409, error: 'Session binding mismatch.' }
  }

  const transcript = parseTranscript(body.transcript)
  if (!transcript) {
    return { ok: false, status: 400, error: 'Transcript is malformed.' }
  }
  if (JSON.stringify(transcript).length > MAX_TRANSCRIPT_CHARS) {
    return { ok: false, status: 413, error: 'Transcript exceeds the supported session size.' }
  }
  const integrity = validateTranscript(transcript)
  if (!integrity.valid) {
    return { ok: false, status: 409, error: 'Transcript sequence is incomplete or inconsistent.' }
  }

  const output = structuredOutput(body.structured_output)
  const narrativeSummary =
    typeof body.narrative_summary === 'string'
      ? body.narrative_summary.trim().slice(0, MAX_SUMMARY_CHARS)
      : ''
  const redFlags = sanitizeRedFlags(body.red_flags)
  const requestedCompletionStatus =
    body.interview_completion_status === 'ended_early' ? 'ended_early' : 'complete'
  const durationSeconds = integerInRange(body.duration_seconds, 0, 8 * 60 * 60)
  const questionCount = integerInRange(body.question_count, 0, 500)
  const safetyEscalated = body.safety_escalated === true
  const explicitTerminationReason = parseHistorianTerminationReason(
    body.interview_termination_reason,
  )
  if (body.interview_termination_reason != null && !explicitTerminationReason) {
    return { ok: false, status: 400, error: 'Invalid interview termination reason.' }
  }
  const terminationReason =
    explicitTerminationReason ??
    (requestedCompletionStatus === 'complete'
      ? 'coverage_complete'
      : safetyEscalated
        ? 'safety_escalated'
        : 'manual_end')
  if (!terminationMatchesCompletionStatus(terminationReason, requestedCompletionStatus)) {
    return {
      ok: false,
      status: 409,
      error: 'Interview completion status conflicts with its termination reason.',
    }
  }
  if (safetyEscalated !== (terminationReason === 'safety_escalated')) {
    return {
      ok: false,
      status: 409,
      error: 'Safety escalation status conflicts with its termination reason.',
    }
  }
  if (terminationReason === 'hard_stop' && questionCount < 60) {
    return { ok: false, status: 409, error: 'Hard-stop reason is invalid before exchange 60.' }
  }
  const completionStatus = completionStatusForTermination(terminationReason)
  if (terminationReason === 'coverage_complete') {
    const coverage = validateComprehensiveCoverage(output)
    if (!coverage.complete) {
      return {
        ok: false,
        status: 409,
        error: 'The comprehensive history coverage audit is incomplete. Please continue or end the interview early.',
      }
    }
  }

  const pool = await getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const locked = await client.query<{
      invite_status: string
      session_status: string
      grant_expires_at: Date | string
    }>(
      `SELECT invite.status AS invite_status,
              session.status AS session_status,
              invite.grant_expires_at
         FROM historian_invites invite
         JOIN historian_sessions session ON session.id = invite.session_id
        WHERE invite.id = $1
          AND invite.session_id = $2
          AND invite.tenant_id = $3
        FOR UPDATE OF invite, session`,
      [binding.inviteId, binding.sessionId, binding.tenantId],
    )
    const row = locked.rows[0]
    if (!row || new Date(row.grant_expires_at).getTime() <= now.getTime()) {
      await rollbackQuietly(client)
      return { ok: false, status: 409, error: 'This interview session has expired.' }
    }

    if (row.session_status === 'completed' && row.invite_status === 'completed') {
      await rollbackQuietly(client)
      return {
        ok: true,
        sessionId: binding.sessionId,
        consultId: binding.consultId,
        replayed: true,
        evaluationStatus: 'already_queued',
        redFlags: [],
        patientName: binding.patientName,
        patientId: binding.patientId,
        tenantId: binding.tenantId,
      }
    }
    if (!['redeemed', 'in_progress'].includes(row.invite_status) || row.session_status !== 'in_progress') {
      await rollbackQuietly(client)
      return { ok: false, status: 409, error: 'This interview is no longer writable.' }
    }

    // Consolidate the browser's final batch into the append-only event log in
    // the same transaction, then verify the complete ordered log matches the
    // final transcript exactly. A retry is safe (ON CONFLICT DO NOTHING); a
    // conflicting duplicate or missing turn fails closed before the clinical
    // report and DDx job are written.
    const transcriptEvents = transcript.map((entry) => ({
      seq: entry.seq,
      role: entry.role,
      text: entry.text,
      ts_offset_s: Math.round(entry.timestamp),
    }))
    await client.query(
      `INSERT INTO historian_transcript_events (session_id, seq, role, text, ts_offset_s)
       SELECT $1, event.seq, event.role, event.text, event.ts_offset_s
         FROM jsonb_to_recordset($2::jsonb)
              AS event(seq integer, role text, text text, ts_offset_s integer)
       ON CONFLICT (session_id, seq) DO NOTHING`,
      [binding.sessionId, JSON.stringify(transcriptEvents)],
    )
    const eventResult = await client.query<{
      seq: number
      role: 'assistant' | 'user'
      text: string
    }>(
      `SELECT seq, role, text
         FROM historian_transcript_events
        WHERE session_id = $1
        ORDER BY seq`,
      [binding.sessionId],
    )
    const eventLogMatches =
      eventResult.rows.length === transcript.length &&
      eventResult.rows.every((event, index) => {
        const entry = transcript[index]
        return event.seq === entry.seq && event.role === entry.role && event.text === entry.text
      })
    if (!eventLogMatches) {
      await rollbackQuietly(client)
      return { ok: false, status: 409, error: 'Transcript durability check did not complete. Please retry.' }
    }

    const sessionUpdate = await client.query(
      `UPDATE historian_sessions
          SET structured_output = $1::jsonb,
              narrative_summary = $2,
              transcript = $3::jsonb,
              red_flags = $4::jsonb,
              safety_escalated = $5,
              duration_seconds = $6,
              question_count = $7,
              status = 'completed',
              interview_completion_status = $8,
              interview_termination_reason = $9,
              interview_mode = 'comprehensive',
              interview_prompt_version = 'comprehensive-v1',
              updated_at = $10
        WHERE id = $11
          AND tenant_id = $12
          AND consult_id = $13`,
      [
        JSON.stringify(output),
        narrativeSummary || null,
        JSON.stringify(transcript),
        JSON.stringify(redFlags),
        safetyEscalated,
        durationSeconds,
        questionCount,
        completionStatus,
        terminationReason,
        now,
        binding.sessionId,
        binding.tenantId,
        binding.consultId,
      ],
    )

    const inviteUpdate = await client.query(
      `UPDATE historian_invites
          SET status = 'completed', completed_at = $2, updated_at = $2
        WHERE id = $1`,
      [binding.inviteId, now],
    )

    const consultUpdate = await client.query(
      `UPDATE neurology_consults
          SET historian_session_id = $3,
              historian_summary = $4,
              historian_structured_output = $5::jsonb,
              historian_red_flags = $6::jsonb,
              historian_safety_escalated = $7,
              historian_completed_at = $8,
              interview_completion_status = $9,
              interview_termination_reason = $10,
              status = 'historian_complete',
              updated_at = $8
        WHERE id = $1
          AND tenant_id = $2`,
      [
        binding.consultId,
        binding.tenantId,
        binding.sessionId,
        narrativeSummary,
        JSON.stringify(output),
        JSON.stringify(redFlags),
        safetyEscalated,
        now,
        completionStatus,
        terminationReason,
      ],
    )

    if (
      sessionUpdate.rowCount !== 1 ||
      inviteUpdate.rowCount !== 1 ||
      consultUpdate.rowCount !== 1
    ) {
      await rollbackQuietly(client)
      return { ok: false, status: 409, error: 'The bound interview record changed. Please retry.' }
    }

    await ensureInvitedHistorianAlert(client, binding, redFlags, safetyEscalated)

    const jobInsert = await client.query(
      `INSERT INTO historian_eval_jobs (tenant_id, session_id, status, next_attempt_at, created_at, updated_at)
       VALUES ($1, $2, 'pending', $3, $3, $3)
       ON CONFLICT (session_id) DO NOTHING`,
      [binding.tenantId, binding.sessionId, now],
    )
    await client.query('COMMIT')

    return {
      ok: true,
      sessionId: binding.sessionId,
      consultId: binding.consultId,
      replayed: false,
      evaluationStatus: jobInsert.rowCount === 1 ? 'pending' : 'already_queued',
      redFlags,
      patientName: binding.patientName,
      patientId: binding.patientId,
      tenantId: binding.tenantId,
    }
  } catch (error) {
    await rollbackQuietly(client)
    console.error('[historian/save] invited save transaction failed', {
      sessionId: binding.sessionId,
      error,
    })
    return { ok: false, status: 503, error: 'The interview could not be saved. Please retry.' }
  } finally {
    client.release()
  }
}
