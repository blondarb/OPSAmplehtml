import type { PoolClient } from 'pg'
import { getPool } from '@/lib/db'
import type {
  HistorianInterviewMode,
  HistorianSessionType,
} from '@/lib/historianTypes'
import {
  HISTORIAN_GRANT_COOKIE,
  HISTORIAN_GRANT_TTL_SECONDS,
  HISTORIAN_INVITE_TTL_SECONDS,
  hashHistorianToken,
  mintHistorianToken,
  readCookieValue,
} from './invitationTokens'

export interface HistorianInvitationBinding {
  inviteId: string
  tenantId: string
  consultId: string
  patientId: string | null
  sessionId: string
  patientName: string
  referralReason: string | null
  sessionType: HistorianSessionType
  provider: 'nova'
  interviewMode: 'comprehensive'
  interviewPromptVersion: 'comprehensive-v1' | 'comprehensive-v2' | 'comprehensive-v3' | 'comprehensive-v4'
  status: 'redeemed' | 'in_progress' | 'completed'
  startupAttemptId?: string | null
  grantExpiresAt: string
}

export interface HistorianInvitationPublicContext {
  patientName: string
  referralReason: string | null
  sessionType: HistorianSessionType
  interviewMode: HistorianInterviewMode
  interviewPromptVersion: 'standard-v1' | 'comprehensive-v1' | 'comprehensive-v2' | 'comprehensive-v3' | 'comprehensive-v4'
  interviewStatus: 'redeemed' | 'in_progress' | 'completed'
}

export type CreateHistorianInvitationResult =
  | {
      ok: true
      inviteId: string
      sessionId: string
      rawToken: string
      expiresAt: string
      patientName: string
      referralReason: string | null
      interviewPromptVersion: 'comprehensive-v1' | 'comprehensive-v2' | 'comprehensive-v3' | 'comprehensive-v4'
    }
  | { ok: false; reason: 'consult_not_found' | 'patient_identity_unavailable' | 'interview_in_progress' | 'database_error' }

interface ConsultRow {
  id: string
  tenant_id: string
  patient_id: string | null
  status: string
  triage_chief_complaint: string | null
  patient_name: string | null
  patient_date_of_birth: Date | string | null
}

const MAX_IDENTITY_ATTEMPTS = 5

function normalizedDateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (match) return match[1]
  }
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK')
  } catch {
    // The original failure remains authoritative.
  }
}

export async function createHistorianInvitation(input: {
  tenantId: string
  consultId: string
  invitedByUserId: string
  replaceActive?: boolean
  /** Default remains v1 until the application-owned controller is explicitly enabled. */
  promptVersion?: 'comprehensive-v1' | 'comprehensive-v2' | 'comprehensive-v3' | 'comprehensive-v4'
  now?: Date
}): Promise<CreateHistorianInvitationResult> {
  const now = input.now ?? new Date()
  const expiresAt = new Date(now.getTime() + HISTORIAN_INVITE_TTL_SECONDS * 1000)
  const promptVersion = input.promptVersion ?? 'comprehensive-v1'
  const inviteToken = mintHistorianToken()
  const pool = await getPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const consultResult = await client.query<ConsultRow>(
      `SELECT consult.id,
              consult.tenant_id,
              consult.patient_id,
              consult.status,
              consult.triage_chief_complaint,
              NULLIF(trim(concat_ws(' ', patient.first_name, patient.last_name)), '') AS patient_name,
              patient.date_of_birth AS patient_date_of_birth
         FROM neurology_consults consult
         LEFT JOIN patients patient ON patient.id = consult.patient_id
        WHERE consult.id = $1
          AND consult.tenant_id = $2
        FOR UPDATE OF consult`,
      [input.consultId, input.tenantId],
    )
    const consult = consultResult.rows[0]
    if (!consult) {
      await rollbackQuietly(client)
      return { ok: false, reason: 'consult_not_found' }
    }
    if (!consult.patient_id || !normalizedDateOnly(consult.patient_date_of_birth)) {
      await rollbackQuietly(client)
      return { ok: false, reason: 'patient_identity_unavailable' }
    }

    const activeResult = await client.query<{
      id: string
      status: string
      session_id: string
      grant_expires_at: Date | string | null
    }>(
      `SELECT id, status, session_id, grant_expires_at
         FROM historian_invites
        WHERE tenant_id = $1
          AND consult_id = $2
          AND status IN ('pending', 'redeemed', 'in_progress')
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [input.tenantId, input.consultId],
    )
    const active = activeResult.rows[0]
    const activeGrantExpiryMs = active?.grant_expires_at
      ? new Date(active.grant_expires_at).getTime()
      : Number.NaN
    const activeGrantExpired =
      !!active &&
      (active.status === 'redeemed' || active.status === 'in_progress') &&
      (!Number.isFinite(activeGrantExpiryMs) || activeGrantExpiryMs <= now.getTime())

    if (
      active &&
      (active.status === 'redeemed' || active.status === 'in_progress') &&
      !activeGrantExpired &&
      input.replaceActive !== true
    ) {
      await rollbackQuietly(client)
      return { ok: false, reason: 'interview_in_progress' }
    }
    if (active) {
      const replacementStatus = activeGrantExpired ? 'expired' : 'revoked'
      await client.query(
        `UPDATE historian_invites
            SET status = $2,
                revoked_at = CASE WHEN $2 = 'revoked' THEN $3 ELSE revoked_at END,
                updated_at = $3
          WHERE id = $1`,
        [active.id, replacementStatus, now],
      )
      await client.query(
        `UPDATE historian_sessions
            SET status = 'abandoned', updated_at = $2
          WHERE id = $1 AND status = 'in_progress'`,
        [active.session_id, now],
      )
    }

    const patientName = consult.patient_name || 'Patient'
    const referralReason = consult.triage_chief_complaint?.trim() || 'Neurology referral'
    const sessionResult = await client.query<{ id: string }>(
      `INSERT INTO historian_sessions
        (tenant_id, patient_id, session_type, patient_name, referral_reason,
         status, reviewed, imported_to_note, consult_id, interview_mode,
         interview_prompt_version, authorized_by_user_id, created_at, updated_at)
       VALUES ($1, $2, 'new_patient', $3, $4,
               'in_progress', false, false, $5, 'comprehensive',
               $6, $7, $8, $8)
       RETURNING id`,
      [
        input.tenantId,
        consult.patient_id,
        patientName,
        referralReason,
        consult.id,
        promptVersion,
        input.invitedByUserId,
        now,
      ],
    )
    const sessionId = sessionResult.rows[0]?.id
    if (!sessionId) throw new Error('Historian session pre-creation returned no id.')

    const inviteResult = await client.query<{ id: string }>(
      `INSERT INTO historian_invites
        (tenant_id, consult_id, patient_id, session_id, invited_by_user_id,
         provider, interview_mode, interview_prompt_version, token_hash,
         status, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5,
               'nova', 'comprehensive', $6, $7,
               'pending', $8, $9, $9)
       RETURNING id`,
      [
        input.tenantId,
        consult.id,
        consult.patient_id,
        sessionId,
        input.invitedByUserId,
        promptVersion,
        inviteToken.hash,
        expiresAt,
        now,
      ],
    )
    const inviteId = inviteResult.rows[0]?.id
    if (!inviteId) throw new Error('Historian invitation creation returned no id.')

    await client.query(
      `UPDATE neurology_consults
          SET status = CASE
                WHEN status IN ('triage_complete', 'intake_complete', 'historian_pending')
                  THEN 'historian_pending'
                ELSE status
              END,
              updated_at = $3
        WHERE id = $1 AND tenant_id = $2`,
      [consult.id, input.tenantId, now],
    )
    await client.query('COMMIT')

    return {
      ok: true,
      inviteId,
      sessionId,
      rawToken: inviteToken.raw,
      expiresAt: expiresAt.toISOString(),
      patientName,
      referralReason,
      interviewPromptVersion: promptVersion,
    }
  } catch (error) {
    await rollbackQuietly(client)
    console.error('[historian/invite] failed to create invitation', {
      consultId: input.consultId,
      error,
    })
    return { ok: false, reason: 'database_error' }
  } finally {
    client.release()
  }
}

export type RedeemHistorianInvitationResult =
  | {
      ok: true
      grantToken: string
      grantExpiresAt: string
      context: HistorianInvitationPublicContext
    }
  | { ok: false; reason: 'invalid_or_expired' | 'identity_verification_failed' | 'database_error' }

export async function redeemHistorianInvitation(
  rawInviteToken: string,
  dateOfBirth: string,
  now: Date = new Date(),
): Promise<RedeemHistorianInvitationResult> {
  const suppliedDateOfBirth = normalizedDateOnly(dateOfBirth)
  if (!suppliedDateOfBirth || suppliedDateOfBirth !== dateOfBirth) {
    return { ok: false, reason: 'identity_verification_failed' }
  }
  const tokenHash = hashHistorianToken(rawInviteToken)
  const grant = mintHistorianToken()
  const grantExpiresAt = new Date(now.getTime() + HISTORIAN_GRANT_TTL_SECONDS * 1000)
  const pool = await getPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const result = await client.query<{
      id: string
      session_id: string
      expires_at: Date | string
      patient_name: string
      referral_reason: string | null
      session_type: HistorianSessionType
      interview_prompt_version: 'comprehensive-v1' | 'comprehensive-v2' | 'comprehensive-v3' | 'comprehensive-v4'
      patient_date_of_birth: Date | string | null
      verification_attempts: number
    }>(
      `SELECT invite.id,
              invite.session_id,
              invite.expires_at,
              session.patient_name,
              session.referral_reason,
              session.session_type,
              invite.interview_prompt_version,
              patient.date_of_birth AS patient_date_of_birth,
              invite.verification_attempts
         FROM historian_invites invite
         JOIN historian_sessions session ON session.id = invite.session_id
         JOIN patients patient ON patient.id = invite.patient_id
        WHERE invite.token_hash = $1
          AND invite.status = 'pending'
        FOR UPDATE OF invite`,
      [tokenHash],
    )
    const invite = result.rows[0]
    const expiresAtMs = invite ? new Date(invite.expires_at).getTime() : 0
    if (!invite || !Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) {
      if (invite) {
        await client.query(
          `UPDATE historian_invites
              SET status = 'expired', updated_at = $2
            WHERE id = $1`,
          [invite.id, now],
        )
        await client.query('COMMIT')
      } else {
        await rollbackQuietly(client)
      }
      return { ok: false, reason: 'invalid_or_expired' }
    }

    const expectedDateOfBirth = normalizedDateOnly(invite.patient_date_of_birth)
    if (!expectedDateOfBirth || suppliedDateOfBirth !== expectedDateOfBirth) {
      const attempts = Math.min(MAX_IDENTITY_ATTEMPTS, (invite.verification_attempts || 0) + 1)
      await client.query(
        `UPDATE historian_invites
            SET verification_attempts = $2::integer,
                status = CASE
                  WHEN $2::integer >= $3::integer THEN 'revoked'
                  ELSE status
                END,
                revoked_at = CASE
                  WHEN $2::integer >= $3::integer THEN $4::timestamptz
                  ELSE revoked_at
                END,
                updated_at = $4::timestamptz
          WHERE id = $1`,
        [invite.id, attempts, MAX_IDENTITY_ATTEMPTS, now],
      )
      await client.query('COMMIT')
      return { ok: false, reason: 'identity_verification_failed' }
    }

    await client.query(
      `UPDATE historian_invites
          SET status = 'redeemed',
              redeemed_at = $2,
              grant_token_hash = $3,
              grant_expires_at = $4,
              identity_verified_at = $2,
              updated_at = $2
        WHERE id = $1`,
      [invite.id, now, grant.hash, grantExpiresAt],
    )
    await client.query('COMMIT')

    return {
      ok: true,
      grantToken: grant.raw,
      grantExpiresAt: grantExpiresAt.toISOString(),
      context: {
        patientName: invite.patient_name || 'Patient',
        referralReason: invite.referral_reason,
        sessionType: invite.session_type,
        interviewMode: 'comprehensive',
        interviewPromptVersion: invite.interview_prompt_version,
        interviewStatus: 'redeemed',
      },
    }
  } catch (error) {
    await rollbackQuietly(client)
    console.error('[historian/invite] failed to redeem invitation', { error })
    return { ok: false, reason: 'database_error' }
  } finally {
    client.release()
  }
}

export async function resolveHistorianPatientGrant(
  request: Request,
): Promise<HistorianInvitationBinding | null> {
  const rawGrant = readCookieValue(request, HISTORIAN_GRANT_COOKIE)
  if (!rawGrant) return null
  const grantHash = hashHistorianToken(rawGrant)
  try {
    const pool = await getPool()
    const { rows } = await pool.query<{
      invite_id: string
      tenant_id: string
      consult_id: string
      patient_id: string | null
      session_id: string
      patient_name: string
      referral_reason: string | null
      session_type: HistorianSessionType
      provider: 'nova'
      interview_mode: 'comprehensive'
      interview_prompt_version: 'comprehensive-v1' | 'comprehensive-v2' | 'comprehensive-v3' | 'comprehensive-v4'
      status: 'redeemed' | 'in_progress' | 'completed'
      startup_attempt_id: string | null
      grant_expires_at: Date | string
    }>(
      `SELECT invite.id AS invite_id,
              invite.tenant_id,
              invite.consult_id,
              invite.patient_id,
              invite.session_id,
              session.patient_name,
              session.referral_reason,
              session.session_type,
              invite.provider,
              invite.interview_mode,
              invite.interview_prompt_version,
              invite.status,
              invite.startup_attempt_id,
              invite.grant_expires_at
         FROM historian_invites invite
         JOIN historian_sessions session
           ON session.id = invite.session_id
          AND session.tenant_id = invite.tenant_id
        WHERE invite.grant_token_hash = $1
          AND invite.status IN ('redeemed', 'in_progress', 'completed')
          AND invite.grant_expires_at > now()
        LIMIT 1`,
      [grantHash],
    )
    const row = rows[0]
    if (!row) return null
    return {
      inviteId: row.invite_id,
      tenantId: row.tenant_id,
      consultId: row.consult_id,
      patientId: row.patient_id,
      sessionId: row.session_id,
      patientName: row.patient_name || 'Patient',
      referralReason: row.referral_reason,
      sessionType: row.session_type,
      provider: row.provider,
      interviewMode: row.interview_mode,
      interviewPromptVersion: row.interview_prompt_version,
      status: row.status,
      startupAttemptId: row.startup_attempt_id,
      grantExpiresAt: new Date(row.grant_expires_at).toISOString(),
    }
  } catch (error) {
    console.error('[historian/invite] grant lookup failed', { error })
    return null
  }
}

export async function markHistorianInvitationStarted(
  binding: HistorianInvitationBinding,
  startupAttemptId: string,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const pool = await getPool()
    const result = await pool.query(
      `UPDATE historian_invites
          SET status = 'in_progress',
              startup_attempt_id = $3::uuid,
              started_at = COALESCE(started_at, $4),
              updated_at = $4
        WHERE id = $1
          AND session_id = $2
          AND status = 'redeemed'
          AND grant_expires_at > $4`,
      [binding.inviteId, binding.sessionId, startupAttemptId, now],
    )
    return result.rowCount === 1
  } catch (error) {
    console.error('[historian/invite] failed to mark invitation started', {
      inviteId: binding.inviteId,
      error,
    })
    return false
  }
}

export type HistorianStartupRecoveryReason = 'provider_error' | 'transport_lost'

export type RecoverHistorianStartupResult =
  | { ok: true; recovered: true; replayed: boolean }
  | { ok: false; reason: 'not_retryable' | 'database_error' }

// Recovery is deliberately narrow: only a newly-started Comprehensive v2
// invitation with no durable or finalized interview content can return to the
// already identity-verified `redeemed` state. This lets the same browser grant
// retry a microphone/relay startup failure without making an interrupted real
// conversation restartable.
const STARTUP_RECOVERY_WINDOW_MS = 2 * 60 * 1000

export async function recoverHistorianInvitationStartup(
  sessionId: string,
  startupAttemptId: string,
  _reason: HistorianStartupRecoveryReason,
  now: Date = new Date(),
): Promise<RecoverHistorianStartupResult> {
  const pool = await getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const locked = await client.query<{
      invite_id: string
      invite_status: string
      grant_expires_at: Date | string
      invite_updated_at: Date | string
      session_status: string
      interview_prompt_version: string | null
      transcript_count: number | string
      question_count: number | string
      interview_completion_status: string | null
      interview_termination_reason: string | null
      startup_attempt_id: string | null
    }>(
      `SELECT invite.id AS invite_id,
              invite.status AS invite_status,
              invite.grant_expires_at,
              invite.updated_at AS invite_updated_at,
              session.status AS session_status,
              session.interview_prompt_version,
              jsonb_array_length(COALESCE(session.transcript, '[]'::jsonb)) AS transcript_count,
              COALESCE(session.question_count, 0) AS question_count,
              session.interview_completion_status,
              session.interview_termination_reason
              , invite.startup_attempt_id
         FROM historian_invites invite
         JOIN historian_sessions session
           ON session.id = invite.session_id
          AND session.tenant_id = invite.tenant_id
        WHERE invite.session_id = $1
          AND invite.status = 'in_progress'
        FOR UPDATE OF invite, session`,
      [sessionId],
    )
    const row = locked.rows[0]
    const grantExpiryMs = row ? new Date(row.grant_expires_at).getTime() : Number.NaN
    const lastTransitionMs = row ? new Date(row.invite_updated_at).getTime() : Number.NaN
    const structurallyRetryable =
      !!row &&
      Number.isFinite(grantExpiryMs) &&
      grantExpiryMs > now.getTime() &&
      Number.isFinite(lastTransitionMs) &&
      now.getTime() - lastTransitionMs >= 0 &&
      now.getTime() - lastTransitionMs <= STARTUP_RECOVERY_WINDOW_MS &&
      row.session_status === 'in_progress' &&
      row.startup_attempt_id === startupAttemptId &&
      (row.interview_prompt_version === 'comprehensive-v2' ||
        row.interview_prompt_version === 'comprehensive-v3' ||
        row.interview_prompt_version === 'comprehensive-v4') &&
      Number(row.transcript_count) === 0 &&
      Number(row.question_count) === 0 &&
      row.interview_completion_status == null &&
      row.interview_termination_reason == null

    if (!structurallyRetryable) {
      await rollbackQuietly(client)
      return { ok: false, reason: 'not_retryable' }
    }

    const eventResult = await client.query<{ has_events: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM historian_transcript_events
          WHERE session_id = $1
       ) AS has_events`,
      [sessionId],
    )
    if (eventResult.rows[0]?.has_events !== false) {
      await rollbackQuietly(client)
      return { ok: false, reason: 'not_retryable' }
    }

    const updated = await client.query(
      `UPDATE historian_invites
          SET status = 'redeemed',
              startup_attempt_id = NULL,
              updated_at = $2
        WHERE id = $1
          AND status = 'in_progress'
          AND startup_attempt_id = $3::uuid`,
      [row.invite_id, now, startupAttemptId],
    )
    if (updated.rowCount !== 1) {
      await rollbackQuietly(client)
      return { ok: false, reason: 'not_retryable' }
    }

    await client.query('COMMIT')
    return { ok: true, recovered: true, replayed: false }
  } catch (error) {
    await rollbackQuietly(client)
    // Metadata-only. Session/invitation/patient identifiers are intentionally
    // omitted from logs.
    console.error('[historian/startup-recovery] database error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { ok: false, reason: 'database_error' }
  } finally {
    client.release()
  }
}

export function publicHistorianInvitationContext(
  binding: HistorianInvitationBinding,
): HistorianInvitationPublicContext {
  return {
    patientName: binding.patientName,
    referralReason: binding.referralReason,
    sessionType: binding.sessionType,
    interviewMode: binding.interviewMode,
    interviewPromptVersion: binding.interviewPromptVersion,
    interviewStatus: binding.status,
  }
}
