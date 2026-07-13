import type {
  CarePathway,
  TriageResult,
  TriageTier,
} from '@/lib/triage/types'

export const OUTPATIENT_REVIEW_NOTE_MAX_LENGTH = 2_000

export type FinalizableOutpatientCarePathway = Extract<
  CarePathway,
  'expedited_outpatient' | 'routine_outpatient'
>

export type FinalizableOutpatientTriageTier = Extract<
  TriageTier,
  'urgent' | 'semi_urgent' | 'routine_priority' | 'routine' | 'non_urgent'
>

export interface OutpatientFinalizationCommand {
  triageSessionId: string
  carePathway: FinalizableOutpatientCarePathway
  triageTier: FinalizableOutpatientTriageTier
  reviewNote: string
}

export interface FinalizedOutpatientDispositionView {
  triageSessionId: string
  carePathway: FinalizableOutpatientCarePathway
  triageTier: FinalizableOutpatientTriageTier
  reviewedBy: string
}

const PATHWAY_TIERS: Readonly<
  Record<
    FinalizableOutpatientCarePathway,
    ReadonlySet<FinalizableOutpatientTriageTier>
  >
> = {
  expedited_outpatient: new Set(['urgent', 'semi_urgent']),
  routine_outpatient: new Set([
    'routine_priority',
    'routine',
    'non_urgent',
  ]),
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFinalizablePathway(
  value: unknown,
): value is FinalizableOutpatientCarePathway {
  return value === 'expedited_outpatient' || value === 'routine_outpatient'
}

function isFinalizableTier(
  value: unknown,
): value is FinalizableOutpatientTriageTier {
  return (
    value === 'urgent' ||
    value === 'semi_urgent' ||
    value === 'routine_priority' ||
    value === 'routine' ||
    value === 'non_urgent'
  )
}

function pathwayAllowsTier(
  pathway: unknown,
  tier: unknown,
): pathway is FinalizableOutpatientCarePathway {
  return (
    isFinalizablePathway(pathway) &&
    isFinalizableTier(tier) &&
    PATHWAY_TIERS[pathway].has(tier)
  )
}

/**
 * Client-side visibility is deliberately stricter than a convenience check.
 * The endpoint repeats every durable authorization and safety invariant and
 * remains the final authority for open actions or clarification questions that
 * are not included in the result payload.
 */
export function isEligibleForOutpatientFinalization(
  result: TriageResult,
): boolean {
  if (
    result.emergent_override ||
    result.insufficient_data ||
    result.redirect_to_non_neuro
  ) {
    return false
  }
  if (
    result.data_quality !== 'sufficient' ||
    result.coverage_status !== 'complete' ||
    result.review_requirement !== 'clinician_confirmation' ||
    result.workflow_status !== 'clinician_review' ||
    result.scheduling_locked !== true ||
    result.outpatient_finalization_allowed !== true
  ) {
    return false
  }
  return pathwayAllowsTier(result.care_pathway, result.triage_tier)
}

export function buildOutpatientFinalizationCommand(
  result: TriageResult,
  reviewNote: string,
): OutpatientFinalizationCommand | null {
  const normalizedNote = reviewNote.trim()
  if (
    !isEligibleForOutpatientFinalization(result) ||
    !normalizedNote ||
    normalizedNote.length > OUTPATIENT_REVIEW_NOTE_MAX_LENGTH ||
    !isFinalizablePathway(result.care_pathway) ||
    !isFinalizableTier(result.triage_tier) ||
    !PATHWAY_TIERS[result.care_pathway].has(result.triage_tier)
  ) {
    return null
  }
  return {
    triageSessionId: result.session_id,
    carePathway: result.care_pathway,
    triageTier: result.triage_tier,
    reviewNote: normalizedNote,
  }
}

function fingerprintSegment(value: string): string {
  return `${value.length}:${value}`
}

export function outpatientFinalDispositionFingerprint(
  command: OutpatientFinalizationCommand,
): string {
  return [
    command.triageSessionId,
    command.carePathway,
    command.triageTier,
    command.reviewNote,
  ]
    .map(fingerprintSegment)
    .join('|')
}

export function createOutpatientDispositionKey(): string {
  const suffix =
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `finalize:${suffix}`
}

export function getOrCreateOutpatientDispositionKey(
  cache: Map<string, string>,
  fingerprint: string,
  createKey: () => string = createOutpatientDispositionKey,
): string {
  const existing = cache.get(fingerprint)
  if (existing) return existing
  const created = createKey()
  cache.set(fingerprint, created)
  return created
}

/**
 * Never infer lock release from a merely successful HTTP status. The returned
 * record and exact disposition must match the command the clinician confirmed.
 */
export function parseFinalizedOutpatientDisposition(
  value: unknown,
  command: OutpatientFinalizationCommand,
): FinalizedOutpatientDispositionView | null {
  if (!isRecord(value) || value.success !== true) return null
  const disposition = value.disposition
  if (!isRecord(disposition)) return null
  const reviewedBy = disposition.reviewed_by
  if (
    disposition.triage_session_id !== command.triageSessionId ||
    disposition.care_pathway !== command.carePathway ||
    disposition.triage_tier !== command.triageTier ||
    typeof reviewedBy !== 'string' ||
    !reviewedBy.trim()
  ) {
    return null
  }
  return {
    triageSessionId: command.triageSessionId,
    carePathway: command.carePathway,
    triageTier: command.triageTier,
    reviewedBy: reviewedBy.trim(),
  }
}

function failedRequestMessage(value: unknown): string {
  const body = isRecord(value) ? value : null
  const reason =
    body && typeof body.reason === 'string'
      ? ` (${body.reason.replace(/_/g, ' ')})`
      : ''
  return `Disposition was not finalized${reason}. Scheduling remains locked. Refresh the record and resolve any changed authorization, open safety action, or clarification before retrying.`
}

export async function submitOutpatientFinalization(
  command: OutpatientFinalizationCommand,
  idempotencyKey: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<FinalizedOutpatientDispositionView> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)) {
    throw new Error(
      'Disposition was not finalized because the retry key was invalid. Scheduling remains locked; refresh before retrying.',
    )
  }

  let response: Response
  try {
    response = await fetcher(
      `/api/triage/${encodeURIComponent(command.triageSessionId)}/final-disposition`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          final_care_pathway: command.carePathway,
          final_triage_tier: command.triageTier,
          review_note: command.reviewNote,
        }),
      },
    )
  } catch {
    throw new Error(
      'Disposition was not finalized because the server could not be reached. Scheduling remains locked; retry with the same review evidence after connectivity is restored.',
    )
  }

  const responseBody: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new Error(failedRequestMessage(responseBody))

  const disposition = parseFinalizedOutpatientDisposition(
    responseBody,
    command,
  )
  if (!disposition) {
    throw new Error(
      'The finalization response could not be verified against the confirmed record. Scheduling remains locked; refresh before taking any scheduling action.',
    )
  }
  return disposition
}

export function finalizedDispositionMatchesResult(
  result: TriageResult,
  disposition: FinalizedOutpatientDispositionView,
): boolean {
  const exactDisposition =
    disposition.triageSessionId === result.session_id &&
    disposition.carePathway === result.care_pathway &&
    disposition.triageTier === result.triage_tier
  if (!exactDisposition) return false

  const durableDecisionReady =
    !result.emergent_override &&
    !result.insufficient_data &&
    !result.redirect_to_non_neuro &&
    result.data_quality === 'sufficient' &&
    result.coverage_status === 'complete' &&
    result.review_requirement === 'none' &&
    result.workflow_status === 'decision_ready' &&
    result.scheduling_locked === false &&
    result.outpatient_finalization_allowed === true

  return (
    isEligibleForOutpatientFinalization(result) || durableDecisionReady
  )
}

/**
 * Reflect a verified server transition in the current UI without mutating the
 * polled result. A response for another or mismatched record cannot release the
 * visible lock.
 */
export function applyFinalizedOutpatientDisposition(
  result: TriageResult,
  disposition: FinalizedOutpatientDispositionView,
): TriageResult {
  if (!finalizedDispositionMatchesResult(result, disposition)) return result
  return {
    ...result,
    care_pathway: disposition.carePathway,
    triage_tier: disposition.triageTier,
    review_requirement: 'none',
    workflow_status: 'decision_ready',
    scheduling_locked: false,
  }
}
