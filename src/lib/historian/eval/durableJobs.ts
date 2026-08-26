import crypto from 'crypto'
import type { Pool } from 'pg'
import type {
  HistorianInterviewPromptVersion,
  HistorianStructuredOutput,
  HistorianTerminationReason,
  HistorianTranscriptEntry,
} from '@/lib/historianTypes'
import type { DiagnosticSufficiencyV1 } from '@/lib/historian/diagnosticSufficiency'
import type { ClinicianHistoryReportV1 } from './clinicianHistoryReport'

export const HISTORIAN_EVAL_JOB_KIND = 'historian_eval' as const
export const HISTORIAN_EVAL_JOB_VERSION = 1 as const
export const HISTORIAN_EVAL_MAX_ATTEMPTS = 5

export interface HistorianEvalMessage {
  v: typeof HISTORIAN_EVAL_JOB_VERSION
  kind: typeof HISTORIAN_EVAL_JOB_KIND
  job_id: string
}

export interface ClaimedHistorianEvalJob {
  jobId: string
  sessionId: string
  tenantId: string
  leaseToken: string
  attemptCount: number
  pipelineVersion: number
  currentStage: string
  transcript: HistorianTranscriptEntry[]
  chiefComplaint?: string
  structuredOutput: HistorianStructuredOutput | null
  narrativeSummary?: string
  promptVersion: HistorianInterviewPromptVersion | null
  completionStatus: 'complete' | 'ended_early' | null
  terminationReason: HistorianTerminationReason | null
  diagnosticSufficiency: DiagnosticSufficiencyV1 | null
  clinicianHistoryReport: ClinicianHistoryReportV1 | null
  finalDifferential: unknown | null
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function buildHistorianEvalMessage(jobId: string): HistorianEvalMessage {
  if (!UUID_PATTERN.test(jobId)) throw new Error('Historian evaluation job id is invalid.')
  return { v: HISTORIAN_EVAL_JOB_VERSION, kind: HISTORIAN_EVAL_JOB_KIND, job_id: jobId.toLowerCase() }
}

export function parseHistorianEvalMessage(raw: string): HistorianEvalMessage {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('Historian evaluation message is invalid JSON.')
  }
  if (!value || typeof value !== 'object') throw new Error('Historian evaluation message is invalid.')
  const candidate = value as Record<string, unknown>
  const keys = Object.keys(candidate).sort()
  if (
    keys.length !== 3 ||
    keys[0] !== 'job_id' ||
    keys[1] !== 'kind' ||
    keys[2] !== 'v' ||
    candidate.v !== HISTORIAN_EVAL_JOB_VERSION ||
    candidate.kind !== HISTORIAN_EVAL_JOB_KIND ||
    typeof candidate.job_id !== 'string' ||
    !UUID_PATTERN.test(candidate.job_id)
  ) {
    throw new Error('Historian evaluation message binding is invalid.')
  }
  return buildHistorianEvalMessage(candidate.job_id)
}

function parseTranscript(value: unknown): HistorianTranscriptEntry[] {
  if (!Array.isArray(value)) throw new Error('Historian evaluation transcript is unavailable.')
  return value as HistorianTranscriptEntry[]
}

export class HistorianEvalJobService {
  constructor(private readonly pool: Pool) {}

  async listDispatchableJobIds(limit = 500): Promise<string[]> {
    const boundedLimit = Math.min(1_000, Math.max(1, Math.floor(limit)))
    // A Lambda can be terminated by the platform before our catch block runs.
    // After the final permitted attempt that would otherwise leave the row in
    // `leased` forever: it is no longer claimable, while the clinician UI
    // would keep describing the differential as pending. The recovery sweep
    // terminalizes those expired final leases before selecting more work.
    await this.pool.query(
      `UPDATE historian_eval_jobs
          SET status = 'failed',
              lease_token = NULL,
              lease_expires_at = NULL,
              last_error_code = COALESCE(last_error_code, 'LeaseExpired'),
              updated_at = now()
        WHERE status = 'leased'
          AND lease_expires_at <= now()
          AND attempt_count >= $1`,
      [HISTORIAN_EVAL_MAX_ATTEMPTS],
    )
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT id
         FROM historian_eval_jobs
        WHERE attempt_count < $1
          AND (
            (status IN ('pending', 'retry_wait') AND next_attempt_at <= now())
            OR (status = 'leased' AND lease_expires_at <= now())
          )
        ORDER BY next_attempt_at, created_at
        LIMIT $2`,
      [HISTORIAN_EVAL_MAX_ATTEMPTS, boundedLimit],
    )
    return rows.map((row) => row.id)
  }

  async claim(jobId: string, leaseSeconds = 360): Promise<ClaimedHistorianEvalJob | null> {
    if (!UUID_PATTERN.test(jobId)) return null
    const leaseToken = crypto.randomUUID()
    const boundedLeaseSeconds = Math.min(900, Math.max(60, Math.floor(leaseSeconds)))
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const claimed = await client.query<{
        id: string
        session_id: string
        tenant_id: string
        attempt_count: number
        pipeline_version: number
        current_stage: string
      }>(
        `UPDATE historian_eval_jobs
            SET status = 'leased',
                attempt_count = attempt_count + 1,
                lease_token = $2,
                lease_expires_at = now() + ($3 * interval '1 second'),
                updated_at = now()
          WHERE id = $1
            AND attempt_count < $4
            AND (
              (status IN ('pending', 'retry_wait') AND next_attempt_at <= now())
              OR (status = 'leased' AND lease_expires_at <= now())
            )
        RETURNING id, session_id, tenant_id, attempt_count, pipeline_version, current_stage`,
        [jobId, leaseToken, boundedLeaseSeconds, HISTORIAN_EVAL_MAX_ATTEMPTS],
      )
      const job = claimed.rows[0]
      if (!job) {
        await client.query('ROLLBACK')
        return null
      }

      const sessionResult = await client.query<{
        transcript: unknown
        referral_reason: string | null
        structured_output: HistorianStructuredOutput | null
        narrative_summary: string | null
        interview_prompt_version: HistorianInterviewPromptVersion | null
        interview_completion_status: 'complete' | 'ended_early' | null
        interview_termination_reason: HistorianTerminationReason | null
        diagnostic_sufficiency: DiagnosticSufficiencyV1 | null
        clinician_history_report: ClinicianHistoryReportV1 | null
        final_differential: unknown | null
      }>(
        `SELECT transcript,
                referral_reason,
                structured_output,
                narrative_summary,
                interview_prompt_version,
                interview_completion_status,
                interview_termination_reason,
                diagnostic_sufficiency,
                clinician_history_report,
                final_differential
           FROM historian_sessions
          WHERE id = $1
            AND tenant_id = $2
            AND status = 'completed'
          FOR SHARE`,
        [job.session_id, job.tenant_id],
      )
      const session = sessionResult.rows[0]
      if (!session) throw new Error('Completed historian session is unavailable for evaluation.')
      const transcript = parseTranscript(session.transcript)
      const chiefComplaint =
        session.structured_output?.chief_complaint?.trim() ||
        session.referral_reason?.trim() ||
        undefined

      await client.query('COMMIT')
      return {
        jobId: job.id,
        sessionId: job.session_id,
        tenantId: job.tenant_id,
        leaseToken,
        attemptCount: job.attempt_count,
        pipelineVersion: job.pipeline_version,
        currentStage: job.current_stage,
        transcript,
        chiefComplaint,
        structuredOutput: session.structured_output,
        narrativeSummary: session.narrative_summary?.trim() || undefined,
        promptVersion: session.interview_prompt_version,
        completionStatus: session.interview_completion_status,
        terminationReason: session.interview_termination_reason,
        diagnosticSufficiency: session.diagnostic_sufficiency,
        clinicianHistoryReport: session.clinician_history_report,
        finalDifferential: session.final_differential,
      }
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // Preserve the original error.
      }
      throw error
    } finally {
      client.release()
    }
  }

  async persistDiagnosticSufficiency(
    claim: ClaimedHistorianEvalJob,
    sufficiency: DiagnosticSufficiencyV1,
  ): Promise<void> {
    const updated = await this.pool.query(
      `UPDATE historian_sessions session
          SET diagnostic_sufficiency = $1::jsonb,
              updated_at = now()
         FROM historian_eval_jobs job
        WHERE session.id = $2
          AND session.tenant_id = $3
          AND job.id = $4
          AND job.session_id = session.id
          AND job.status = 'leased'
          AND job.lease_token = $5
          AND job.lease_expires_at > now()
          AND (
            session.diagnostic_sufficiency IS NULL
            OR session.diagnostic_sufficiency->>'input_digest' = $6
          )`,
      [
        JSON.stringify(sufficiency),
        claim.sessionId,
        claim.tenantId,
        claim.jobId,
        claim.leaseToken,
        sufficiency.input_digest,
      ],
    )
    if (updated.rowCount !== 1) {
      throw new Error('Historian diagnostic sufficiency lost its lease or input digest binding.')
    }
  }

  async persistClinicianHistoryReport(
    claim: ClaimedHistorianEvalJob,
    report: ClinicianHistoryReportV1,
  ): Promise<void> {
    const updated = await this.pool.query(
      `WITH updated_session AS (
         UPDATE historian_sessions session
            SET clinician_history_report = $1::jsonb,
                updated_at = now()
           FROM historian_eval_jobs lease
          WHERE session.id = $2
            AND session.tenant_id = $3
            AND lease.id = $4
            AND lease.session_id = session.id
            AND lease.status = 'leased'
            AND lease.lease_token = $5
            AND lease.lease_expires_at > now()
            AND (
              session.clinician_history_report IS NULL
              OR session.clinician_history_report->>'input_digest' = $6
            )
         RETURNING session.id
       )
       UPDATE historian_eval_jobs job
          SET current_stage = 'report_ready',
              updated_at = now()
         FROM updated_session
        WHERE job.id = $4
          AND job.session_id = updated_session.id
          AND job.status = 'leased'
          AND job.lease_token = $5`,
      [
        JSON.stringify(report),
        claim.sessionId,
        claim.tenantId,
        claim.jobId,
        claim.leaseToken,
        report.input_digest,
      ],
    )
    if (updated.rowCount !== 1) {
      throw new Error('Historian report persistence lost its lease or input digest binding.')
    }
  }

  async persistFinalDifferential(
    claim: ClaimedHistorianEvalJob,
    result: unknown,
    options: { inputDigest?: string; withheld?: boolean } = {},
  ): Promise<void> {
    const persisted = options.inputDigest && result && typeof result === 'object'
      ? { ...(result as Record<string, unknown>), input_digest: options.inputDigest }
      : result
    const updated = await this.pool.query(
      `WITH updated_session AS (
         UPDATE historian_sessions session
            SET final_differential = $1::jsonb,
                updated_at = now()
           FROM historian_eval_jobs lease
          WHERE session.id = $2
            AND session.tenant_id = $3
            AND lease.id = $4
            AND lease.session_id = session.id
            AND lease.status = 'leased'
            AND lease.lease_token = $5
            AND lease.lease_expires_at > now()
            AND (
              $6::text IS NULL
              OR session.final_differential IS NULL
              OR session.final_differential->>'input_digest' = $6
            )
         RETURNING session.id
       )
       UPDATE historian_eval_jobs job
          SET current_stage = $7,
              updated_at = now()
         FROM updated_session
        WHERE job.id = $4
          AND job.session_id = updated_session.id
          AND job.status = 'leased'
          AND job.lease_token = $5`,
      [
        JSON.stringify(persisted),
        claim.sessionId,
        claim.tenantId,
        claim.jobId,
        claim.leaseToken,
        options.inputDigest ?? null,
        options.withheld ? 'ddx_withheld' : 'ddx_ready',
      ],
    )
    if (updated.rowCount !== 1) throw new Error('Historian evaluation lease lost before persistence.')
  }

  async complete(claim: ClaimedHistorianEvalJob): Promise<void> {
    const result = await this.pool.query(
      `UPDATE historian_eval_jobs
          SET status = 'completed',
              current_stage = 'completed',
              completed_at = now(),
              lease_token = NULL,
              lease_expires_at = NULL,
              last_error_code = NULL,
              updated_at = now()
        WHERE id = $1
          AND session_id = $2
          AND tenant_id = $3
          AND status = 'leased'
          AND lease_token = $4`,
      [claim.jobId, claim.sessionId, claim.tenantId, claim.leaseToken],
    )
    if (result.rowCount !== 1) throw new Error('Historian evaluation completion lease mismatch.')
  }

  async fail(claim: ClaimedHistorianEvalJob, errorCode: string, now = new Date()): Promise<void> {
    const terminal = claim.attemptCount >= HISTORIAN_EVAL_MAX_ATTEMPTS
    const delaySeconds = Math.min(15 * 60, 30 * 2 ** Math.max(0, claim.attemptCount - 1))
    const nextAttemptAt = new Date(now.getTime() + delaySeconds * 1000)
    const result = await this.pool.query(
      `UPDATE historian_eval_jobs
          SET status = $5,
              next_attempt_at = $6,
              lease_token = NULL,
              lease_expires_at = NULL,
              last_error_code = $7,
              updated_at = $8
        WHERE id = $1
          AND session_id = $2
          AND tenant_id = $3
          AND status = 'leased'
          AND lease_token = $4`,
      [
        claim.jobId,
        claim.sessionId,
        claim.tenantId,
        claim.leaseToken,
        terminal ? 'failed' : 'retry_wait',
        nextAttemptAt,
        errorCode.slice(0, 100),
        now,
      ],
    )
    if (result.rowCount !== 1) throw new Error('Historian evaluation failure lease mismatch.')
  }
}

export function safeHistorianEvalErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && typeof error.name === 'string') {
    return error.name.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 100) || 'EvaluationError'
  }
  return 'EvaluationError'
}
