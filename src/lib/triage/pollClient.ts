/**
 * Client helper for the async + polling triage flow.
 *
 * POST /api/triage and POST /api/triage/extract return 202 + an id.
 * The client then polls GET /api/triage/[id] (or .../extract/[id])
 * until the response includes a terminal status. This helper wraps that
 * pattern so call sites stay simple.
 *
 * Each polled response carries a `status` field:
 *   - 'pending'  — still working; helper waits and re-polls
 *   - 'complete' — terminal success; helper resolves with the full payload
 *   - 'error'    — terminal failure; helper rejects with the error message
 *
 * 4xx responses (input validation) come back as plain JSON without a
 * `status` field — helper rejects with the response's `error` string.
 */

import {
  asSafetyWorkflowIdentitySuppressionReason,
  initialPollSafetyState,
  isPollSafetyConflict,
  reducePollSafetyState,
  SAFETY_PATHWAY_PROJECTION_CONFLICT_REASON,
  SAFETY_WORKFLOW_IDENTITY_CONFLICT_REASON,
  type GovernedTriageStartSafetyPathway,
  type PollSafetyNotice,
  type StrictPollSafetyState,
} from './pollSafetyState'

export type {
  GovernedTriageStartSafetyPathway,
  PollSafetyNotice,
} from './pollSafetyState'

export interface PollStartResponse {
  status: 'pending' | 'complete'
  session_id?: string
  extraction_id?: string
  ingestion_mode?: string
  safety_pathway?: GovernedTriageStartSafetyPathway
  immediate_review_required?: boolean
  safety_triage_session_id?: string | null
  processing_mode?: 'durable_distributed'
  durable_run_id?: string
}

export interface TriageStartErrorFields {
  reason?: string
  safetyPathway?: GovernedTriageStartSafetyPathway
  immediateActionRequired: boolean
  outpatientScoringBlocked: boolean
  safetyWorkflowId?: string
  humanReviewRequired?: boolean
  schedulingLocked?: boolean
  safetyWorkflowIdentityConflict?: boolean
}

export class TriageStartError extends Error {
  declare readonly reason?: string
  declare readonly safetyPathway?: GovernedTriageStartSafetyPathway
  readonly immediateActionRequired: boolean
  readonly outpatientScoringBlocked: boolean
  declare readonly safetyWorkflowId?: string
  readonly humanReviewRequired: boolean
  readonly schedulingLocked: boolean
  declare readonly safetyWorkflowIdentityConflict?: boolean

  constructor(message: string, fields: TriageStartErrorFields) {
    super(message)
    this.name = 'TriageStartError'
    this.immediateActionRequired = fields.immediateActionRequired
    this.outpatientScoringBlocked = fields.outpatientScoringBlocked
    this.humanReviewRequired = fields.humanReviewRequired ?? false
    this.schedulingLocked = fields.schedulingLocked ?? false
    if (fields.reason !== undefined) this.reason = fields.reason
    if (fields.safetyPathway !== undefined) {
      this.safetyPathway = fields.safetyPathway
    }
    if (fields.safetyWorkflowId !== undefined) {
      this.safetyWorkflowId = fields.safetyWorkflowId
    }
    if (fields.safetyWorkflowIdentityConflict === true) {
      this.safetyWorkflowIdentityConflict = true
    }
  }
}

export interface LongPacketProgress {
  readonly run_status: 'pending' | 'running' | 'complete' | 'failed'
  readonly expected_chunks: number
  readonly mapper: Readonly<{
    completed: number
    failed: number
    leased: number
  }>
  readonly safety: Readonly<{
    completed: number
    failed: number
    leased: number
  }>
  readonly finalizer_status:
    | 'pending'
    | 'leased'
    | 'complete'
    | 'failed'
    | null
}

export interface PollOptions {
  /** Milliseconds between polls. Default 1000. */
  intervalMs?: number
  /** Maximum number of polls before giving up. Default 120 (~2min at 1s). */
  maxAttempts?: number
  /** Called once with the accepted POST response, before the first poll. */
  onStart?: (start: Readonly<PollStartResponse>) => void
  /** Called on each pending poll; null clears absent or invalid progress. */
  onProgress?: (progress: Readonly<LongPacketProgress> | null) => void
  /** Called with validated packet safety before any terminal result is handled. */
  onSafety?: (safety: Readonly<PollSafetyNotice>) => void
}

type StartResponse = PollStartResponse
type PrimaryIdentityField = 'session_id' | 'extraction_id'

interface AcceptedStart {
  readonly start: StartResponse
  readonly safetyState: StrictPollSafetyState
}

interface PollIdentityContract {
  id: string
  field: PrimaryIdentityField
  foreignField: PrimaryIdentityField
}

const ACCEPTED_POLL_TARGET_UNAVAILABLE_REASON =
  'accepted_poll_target_unavailable'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized && normalized.length <= maxLength ? normalized : undefined
}

function boundedUntrustedFailureReason(
  value: unknown,
  fallback: string,
): string {
  const reason = boundedString(value, 200)
  return reason === SAFETY_PATHWAY_PROJECTION_CONFLICT_REASON ||
    reason === SAFETY_WORKFLOW_IDENTITY_CONFLICT_REASON ||
    asSafetyWorkflowIdentitySuppressionReason(reason)
    ? fallback
    : (reason ?? fallback)
}

function exactIdentifier(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim()
    ? value
    : undefined
}

function primaryIdentifier(value: unknown): string | undefined {
  const parsed = exactIdentifier(value, 200)
  return parsed && /^[A-Za-z0-9][A-Za-z0-9_:-]*$/.test(parsed)
    ? parsed
    : undefined
}

function hasOwn(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field)
}

function invalidStartResponse(): never {
  throw new TriageStartError('Server returned an invalid start response.', {
    reason: 'invalid_start_response',
    immediateActionRequired: false,
    outpatientScoringBlocked: true,
  })
}

function validateStartErrorIdentity(
  payload: unknown,
  identityField: PrimaryIdentityField,
  foreignIdentityField: PrimaryIdentityField,
): void {
  if (!isRecord(payload)) return
  if (
    hasOwn(payload, foreignIdentityField) ||
    (hasOwn(payload, identityField) &&
      !primaryIdentifier(payload[identityField]))
  ) {
    invalidStartResponse()
  }
}

function transitionPollSafetyState(
  previous: StrictPollSafetyState,
  payload: unknown,
  trustRemoteSafety: boolean,
  options: PollOptions,
  localFailureReason?: string,
  signal?: AbortSignal,
): StrictPollSafetyState {
  throwIfAborted(signal)
  const next = reducePollSafetyState(previous, {
    payload,
    trustRemoteSafety,
    ...(localFailureReason ? { localFailureReason } : {}),
  })
  if (next !== previous && next.notice) {
    throwIfAborted(signal)
    options.onSafety?.(next.notice)
    throwIfAborted(signal)
  }
  return next
}

function triageStartErrorFromSafetyState(
  message: string,
  fallbackReason: string,
  state: StrictPollSafetyState,
): TriageStartError {
  const safety = state.notice
  return new TriageStartError(message, {
    reason: safety?.holdReason ?? fallbackReason,
    ...(safety?.safetyPathway
      ? { safetyPathway: safety.safetyPathway }
      : {}),
    immediateActionRequired: safety?.immediateActionRequired ?? false,
    outpatientScoringBlocked: safety?.outpatientScoringBlocked ?? true,
    humanReviewRequired: safety?.humanReviewRequired ?? true,
    schedulingLocked: safety?.schedulingLocked ?? true,
    ...(safety?.safetyWorkflowId
      ? { safetyWorkflowId: safety.safetyWorkflowId }
      : {}),
    ...(safety?.safetyWorkflowIdentityConflict
      ? { safetyWorkflowIdentityConflict: true }
      : {}),
  })
}

function safetyConflictMessage(
  payload: unknown,
  status: number,
  state: StrictPollSafetyState,
): string {
  const record = isRecord(payload) ? payload : null
  const supplied = record ? boundedString(record.error, 2_000) : undefined
  if (supplied) return supplied
  return state.outcome === 'identity_conflict'
    ? `Safety workflow identity conflict (${status}). Route this referral for human review before scheduling.`
    : `Safety pathway projection conflict (${status}). Route this referral for human review before scheduling.`
}

function parseStartResponse(
  payload: unknown,
  identityField: PrimaryIdentityField,
  foreignIdentityField: PrimaryIdentityField,
  options: PollOptions,
  signal?: AbortSignal,
): AcceptedStart {
  throwIfAborted(signal)
  if (!isRecord(payload)) {
    invalidStartResponse()
  }

  const status = payload.status
  const id = primaryIdentifier(payload[identityField])
  if (
    (status !== 'pending' && status !== 'complete') ||
    !id ||
    hasOwn(payload, foreignIdentityField)
  ) {
    invalidStartResponse()
  }

  const initialState = initialPollSafetyState()
  const safetyState = transitionPollSafetyState(
    initialState,
    payload,
    true,
    options,
    undefined,
    signal,
  )
  if (isPollSafetyConflict(safetyState)) {
    throwIfAborted(signal)
    throw triageStartErrorFromSafetyState(
      safetyConflictMessage(payload, 200, safetyState),
      safetyState.notice?.holdReason ?? 'invalid_start_response',
      safetyState,
    )
  }

  const ingestionMode = boundedString(payload.ingestion_mode, 100)
  const durableRunId = boundedString(payload.durable_run_id, 200)

  throwIfAborted(signal)
  return Object.freeze({
    start: Object.freeze({
      status,
      [identityField]: id,
      ...(ingestionMode ? { ingestion_mode: ingestionMode } : {}),
      ...(safetyState.notice?.safetyPathway
        ? { safety_pathway: safetyState.notice.safetyPathway }
        : {}),
      ...(typeof payload.immediate_review_required === 'boolean'
        ? { immediate_review_required: payload.immediate_review_required }
        : {}),
      ...(safetyState.workflowId
        ? { safety_triage_session_id: safetyState.workflowId }
        : {}),
      ...(payload.processing_mode === 'durable_distributed'
        ? { processing_mode: payload.processing_mode }
        : {}),
      ...(durableRunId ? { durable_run_id: durableRunId } : {}),
    }),
    safetyState,
  })
}

function isAcceptedPollTargetUnavailableStatus(status: number): boolean {
  return status === 404 || status === 408 || status === 410 || status >= 500
}

function triageStartErrorFromPayload(
  payload: unknown,
  status: number,
): TriageStartError {
  const record = isRecord(payload) ? payload : {}
  const message =
    boundedString(record.error, 2_000) ?? `Request failed (${status})`
  const reason = boundedString(record.reason, 200)
  const safetyState = reducePollSafetyState(initialPollSafetyState(), {
    payload,
    trustRemoteSafety: true,
  })
  if (safetyState.outcome !== 'none') {
    return triageStartErrorFromSafetyState(
      message,
      reason ?? `start_http_${status}`,
      safetyState,
    )
  }

  const immediateActionRequired = record.immediate_action_required === true
  const outpatientScoringBlocked = record.outpatient_scoring_blocked === true
  const humanReviewRequired = Boolean(
    record.human_review_required === true ||
      immediateActionRequired ||
      outpatientScoringBlocked,
  )

  return new TriageStartError(message, {
    immediateActionRequired,
    outpatientScoringBlocked,
    humanReviewRequired,
    schedulingLocked: humanReviewRequired,
    ...(reason ? { reason } : {}),
    ...(safetyState.workflowId
      ? { safetyWorkflowId: safetyState.workflowId }
      : {}),
  })
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

function abortError(): Error {
  return Object.assign(new Error('Aborted'), { name: 'AbortError' })
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError()
}

async function readResponsePayload(
  response: Response,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    if (isAbortError(error)) throw error
    throwIfAborted(signal)
    return null
  }
  throwIfAborted(signal)
  return payload
}

function waitForPollInterval(
  intervalMs: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError())
  if (intervalMs <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    const abort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(abortError())
    }
    const timer = setTimeout(finish, intervalMs)
    signal?.addEventListener('abort', abort, { once: true })
  })
}

function isStrictRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  )
}

function progressCount(value: unknown, expectedChunks: number): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= expectedChunks
    ? value
    : null
}

function parseBranchProgress(
  value: unknown,
  expectedChunks: number,
): LongPacketProgress['mapper'] | null {
  if (!isStrictRecord(value, ['completed', 'failed', 'leased'])) return null
  const completed = progressCount(value.completed, expectedChunks)
  const failed = progressCount(value.failed, expectedChunks)
  const leased = progressCount(value.leased, expectedChunks)
  if (
    completed === null ||
    failed === null ||
    leased === null ||
    completed + failed + leased > expectedChunks
  ) {
    return null
  }
  return Object.freeze({ completed, failed, leased })
}

export function parseLongPacketProgress(
  value: unknown,
): LongPacketProgress | null {
  if (
    !isStrictRecord(value, [
      'run_status',
      'expected_chunks',
      'mapper',
      'safety',
      'finalizer_status',
    ]) ||
    !['pending', 'running', 'complete', 'failed'].includes(
      value.run_status as string,
    ) ||
    typeof value.expected_chunks !== 'number' ||
    !Number.isSafeInteger(value.expected_chunks) ||
    value.expected_chunks < 1
  ) {
    return null
  }
  const expectedChunks = value.expected_chunks
  const mapper = parseBranchProgress(value.mapper, expectedChunks)
  const safety = parseBranchProgress(value.safety, expectedChunks)
  const finalizerStatuses = ['pending', 'leased', 'complete', 'failed']
  if (
    !mapper ||
    !safety ||
    (value.finalizer_status !== null &&
      (typeof value.finalizer_status !== 'string' ||
        !finalizerStatuses.includes(value.finalizer_status)))
  ) {
    return null
  }
  const chunksComplete =
    mapper.completed === expectedChunks &&
    mapper.failed === 0 &&
    mapper.leased === 0 &&
    safety.completed === expectedChunks &&
    safety.failed === 0 &&
    safety.leased === 0
  if (
    (value.run_status === 'complete' &&
      (!chunksComplete || value.finalizer_status !== 'complete')) ||
    (value.finalizer_status === 'complete' &&
      (value.run_status !== 'complete' || !chunksComplete)) ||
    (value.finalizer_status === 'leased' && !chunksComplete)
  ) {
    return null
  }
  return Object.freeze({
    run_status: value.run_status as LongPacketProgress['run_status'],
    expected_chunks: expectedChunks,
    mapper,
    safety,
    finalizer_status:
      value.finalizer_status as LongPacketProgress['finalizer_status'],
  })
}

function requiredStartId(
  start: StartResponse,
  field: PrimaryIdentityField,
): string {
  const id = primaryIdentifier(start[field])
  if (!id) invalidStartResponse()
  return id
}

async function postStart(
  url: string,
  body: BodyInit | null,
  contentType: string | undefined,
  identityField: PrimaryIdentityField,
  foreignIdentityField: PrimaryIdentityField,
  options: PollOptions,
  signal?: AbortSignal,
): Promise<AcceptedStart> {
  const headers: Record<string, string> = {}
  if (contentType) headers['Content-Type'] = contentType

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal,
  })
  throwIfAborted(signal)

  if (!res.ok) {
    const data = await readResponsePayload(res, signal)
    throwIfAborted(signal)
    validateStartErrorIdentity(data, identityField, foreignIdentityField)
    const record = isRecord(data) ? data : null
    if (record && primaryIdentifier(record[identityField])) {
      const reason =
        boundedString(record.reason, 200) ?? `start_http_${res.status}`
      const safetyState = transitionPollSafetyState(
        initialPollSafetyState(),
        data,
        true,
        options,
        reason,
        signal,
      )
      throwIfAborted(signal)
      throw triageStartErrorFromSafetyState(
        boundedString(record.error, 2_000) ?? `Request failed (${res.status})`,
        reason,
        safetyState,
      )
    }
    if ([401, 403].includes(res.status)) {
      const reason = boundedUntrustedFailureReason(
        record?.reason,
        `start_http_${res.status}`,
      )
      throwIfAborted(signal)
      throw new TriageStartError(
        boundedString(record?.error, 2_000) ?? `Request failed (${res.status})`,
        {
          reason,
          immediateActionRequired: false,
          outpatientScoringBlocked: false,
        },
      )
    }
    throwIfAborted(signal)
    throw triageStartErrorFromPayload(data, res.status)
  }

  const data = await readResponsePayload(res, signal)
  throwIfAborted(signal)
  const accepted = parseStartResponse(
    data,
    identityField,
    foreignIdentityField,
    options,
    signal,
  )
  throwIfAborted(signal)
  return accepted
}

async function pollUntilDone<T>(
  pollUrl: string,
  identity: PollIdentityContract,
  initialSafetyState: StrictPollSafetyState,
  signal: AbortSignal | undefined,
  options: PollOptions,
): Promise<T> {
  const intervalMs = options.intervalMs ?? 1000
  const maxAttempts = options.maxAttempts ?? 120
  let safetyState = initialSafetyState

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    throwIfAborted(signal)

    let res: Response
    try {
      res = await fetch(pollUrl, { signal, cache: 'no-store' })
    } catch (error) {
      if (isAbortError(error)) throw error
      throwIfAborted(signal)
      safetyState = transitionPollSafetyState(
        safetyState,
        null,
        false,
        options,
        ACCEPTED_POLL_TARGET_UNAVAILABLE_REASON,
        signal,
      )
      throwIfAborted(signal)
      throw triageStartErrorFromSafetyState(
        'The accepted processing target is unavailable. No result was produced. Route this referral for human review before scheduling.',
        ACCEPTED_POLL_TARGET_UNAVAILABLE_REASON,
        safetyState,
      )
    }
    throwIfAborted(signal)
    const payload = await readResponsePayload(res, signal)
    throwIfAborted(signal)
    const record = isRecord(payload) ? payload : null
    const hasForeignIdentity = Boolean(
      record && hasOwn(record, identity.foreignField),
    )
    const trustedRemoteSafety = Boolean(
      record &&
        !hasForeignIdentity &&
        primaryIdentifier(record[identity.field]) === identity.id,
    )

    if (!res.ok) {
      const hasAnyIdentity = Boolean(
        record &&
          (hasOwn(record, identity.field) ||
            hasOwn(record, identity.foreignField)),
      )
      const idlessAuth = !hasAnyIdentity && [401, 403].includes(res.status)
      const trustedReason = record
        ? boundedString(record.reason, 200)
        : undefined
      const trustedMessage = record
        ? boundedString(record.error, 2_000)
        : undefined
      const reason = trustedRemoteSafety
        ? (trustedReason ?? `poll_http_${res.status}`)
        : idlessAuth
          ? boundedUntrustedFailureReason(
              trustedReason,
              `poll_http_${res.status}`,
            )
          : !hasAnyIdentity && isAcceptedPollTargetUnavailableStatus(res.status)
            ? ACCEPTED_POLL_TARGET_UNAVAILABLE_REASON
            : 'invalid_poll_response'
      const message =
        trustedRemoteSafety || idlessAuth
          ? (trustedMessage ?? `Request failed (${res.status})`)
          : reason === ACCEPTED_POLL_TARGET_UNAVAILABLE_REASON
            ? 'The accepted processing target is unavailable. No result was produced. Route this referral for human review before scheduling.'
            : 'Server returned an invalid processing response. Route this referral for human review before scheduling.'
      safetyState = transitionPollSafetyState(
        safetyState,
        payload,
        trustedRemoteSafety,
        options,
        reason,
        signal,
      )
      throwIfAborted(signal)
      throw triageStartErrorFromSafetyState(
        isPollSafetyConflict(safetyState)
          ? safetyConflictMessage(payload, res.status, safetyState)
          : message,
        reason,
        safetyState,
      )
    }

    const status = record?.status
    if (
      !trustedRemoteSafety ||
      (status !== 'pending' && status !== 'complete' && status !== 'error')
    ) {
      const reason = 'invalid_poll_response'
      safetyState = transitionPollSafetyState(
        safetyState,
        payload,
        trustedRemoteSafety,
        options,
        reason,
        signal,
      )
      throwIfAborted(signal)
      throw triageStartErrorFromSafetyState(
        isPollSafetyConflict(safetyState)
          ? safetyConflictMessage(payload, res.status, safetyState)
          : 'Server returned an invalid processing response. Route this referral for human review before scheduling.',
        reason,
        safetyState,
      )
    }

    const data = record as {
      status?: string
      error?: string
      reason?: string
      long_packet_progress?: unknown
    } & T

    if (data.status === 'error') {
      const reason =
        boundedString(data.reason, 200) ?? 'terminal_processing_failed'
      safetyState = transitionPollSafetyState(
        safetyState,
        data,
        true,
        options,
        reason,
        signal,
      )
      throwIfAborted(signal)
      throw triageStartErrorFromSafetyState(
        boundedString(data.error, 2_000) ?? 'Processing failed.',
        reason,
        safetyState,
      )
    }

    if (data.status === 'complete') {
      safetyState = transitionPollSafetyState(
        safetyState,
        data,
        true,
        options,
        undefined,
        signal,
      )
      if (isPollSafetyConflict(safetyState)) {
        throwIfAborted(signal)
        throw triageStartErrorFromSafetyState(
          safetyConflictMessage(data, 200, safetyState),
          safetyState.notice?.holdReason ?? 'invalid_poll_response',
          safetyState,
        )
      }
      throwIfAborted(signal)
      return data
    }

    // Pending responses may carry both advisory progress and safety state. The
    // reducer runs before either a terminal progress failure or the next wait.
    const progress = parseLongPacketProgress(data.long_packet_progress)
    const longPacketFailed = Boolean(
      progress?.run_status === 'failed' ||
        progress?.finalizer_status === 'failed',
    )
    safetyState = transitionPollSafetyState(
      safetyState,
      data,
      true,
      options,
      longPacketFailed ? 'long_packet_processing_failed' : undefined,
      signal,
    )
    if (isPollSafetyConflict(safetyState)) {
      throwIfAborted(signal)
      throw triageStartErrorFromSafetyState(
        safetyConflictMessage(data, 200, safetyState),
        safetyState.notice?.holdReason ?? 'invalid_poll_response',
        safetyState,
      )
    }
    throwIfAborted(signal)
    options.onProgress?.(progress)
    throwIfAborted(signal)
    if (longPacketFailed) {
      throwIfAborted(signal)
      throw triageStartErrorFromSafetyState(
        'Packet processing failed. No triage result was produced. Route this referral for human review.',
        'long_packet_processing_failed',
        safetyState,
      )
    }
    await waitForPollInterval(intervalMs, signal)
  }

  safetyState = transitionPollSafetyState(
    safetyState,
    null,
    false,
    options,
    'polling_timeout',
    signal,
  )
  throwIfAborted(signal)
  throw triageStartErrorFromSafetyState(
    'Processing did not finish. No triage result was produced. Route this referral for human review before scheduling.',
    'polling_timeout',
    safetyState,
  )
}

export async function postTriage<T>(
  body: unknown,
  signal?: AbortSignal,
  options: PollOptions = {},
): Promise<T> {
  const accepted = await postStart(
    '/api/triage',
    JSON.stringify(body),
    'application/json',
    'session_id',
    'extraction_id',
    options,
    signal,
  )
  throwIfAborted(signal)
  const { start, safetyState } = accepted
  const id = requiredStartId(start, 'session_id')
  throwIfAborted(signal)
  options.onStart?.({ ...start })
  throwIfAborted(signal)
  return pollUntilDone<T>(
    `/api/triage/${encodeURIComponent(id)}`,
    { id, field: 'session_id', foreignField: 'extraction_id' },
    safetyState,
    signal,
    {
      maxAttempts: 300,
      ...options,
    },
  )
}

export async function postExtractJSON<T>(
  body: unknown,
  signal?: AbortSignal,
  options: PollOptions = {},
): Promise<T> {
  const accepted = await postStart(
    '/api/triage/extract',
    JSON.stringify(body),
    'application/json',
    'extraction_id',
    'session_id',
    options,
    signal,
  )
  throwIfAborted(signal)
  const { start, safetyState } = accepted
  const id = requiredStartId(start, 'extraction_id')
  throwIfAborted(signal)
  options.onStart?.({ ...start })
  throwIfAborted(signal)
  return pollUntilDone<T>(
    `/api/triage/extract/${encodeURIComponent(id)}`,
    { id, field: 'extraction_id', foreignField: 'session_id' },
    safetyState,
    signal,
    {
      maxAttempts: 900,
      ...options,
    },
  )
}

export async function postExtractFormData<T>(
  formData: FormData,
  signal?: AbortSignal,
  options: PollOptions = {},
): Promise<T> {
  const accepted = await postStart(
    '/api/triage/extract',
    formData,
    undefined,
    'extraction_id',
    'session_id',
    options,
    signal,
  )
  throwIfAborted(signal)
  const { start, safetyState } = accepted
  const id = requiredStartId(start, 'extraction_id')
  throwIfAborted(signal)
  options.onStart?.({ ...start })
  throwIfAborted(signal)
  return pollUntilDone<T>(
    `/api/triage/extract/${encodeURIComponent(id)}`,
    { id, field: 'extraction_id', foreignField: 'session_id' },
    safetyState,
    signal,
    {
      maxAttempts: 900,
      ...options,
    },
  )
}
