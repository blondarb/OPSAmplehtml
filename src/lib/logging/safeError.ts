/**
 * PHI-safe error description for server logs.
 *
 * Audit 2026-08-04 asked for the caught error to be logged on triage paths that
 * previously discarded it. Logging the raw error object is NOT automatically
 * safe here: node-postgres errors carry `detail` / `where` / `internalQuery`,
 * and for a constraint violation `detail` echoes the failing row values
 * ("Key (col)=(value) already exists"). On triage tables those values are
 * referral-derived, so a raw dump could put clinical content into CloudWatch —
 * which is exactly what the no-PHI-in-logs rule exists to prevent.
 *
 * This keeps the fields that make an incident diagnosable (name, message, and
 * the Postgres SQLSTATE `code`) and drops the ones that carry data. Bedrock's
 * ClinicalModelOutputError is safe by construction (its messages state a stop
 * reason, never the model output) and its `code`/`stopReason` are preserved.
 */

export interface SafeErrorDescription {
  name: string
  message: string
  /** Postgres SQLSTATE, or ClinicalModelOutputError's 'incomplete' | 'malformed'. */
  code?: string
  /** ClinicalModelOutputError only — why the model stopped. */
  stopReason?: string
}

export function describeError(error: unknown): SafeErrorDescription {
  if (!(error instanceof Error)) {
    return { name: 'NonError', message: typeof error === 'string' ? error : 'unknown error value' }
  }

  const described: SafeErrorDescription = {
    name: error.name,
    message: error.message,
  }

  const candidate = error as Error & { code?: unknown; stopReason?: unknown }
  if (typeof candidate.code === 'string') described.code = candidate.code
  if (typeof candidate.stopReason === 'string') described.stopReason = candidate.stopReason

  return described
}
