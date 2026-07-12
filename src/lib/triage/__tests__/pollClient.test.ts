import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  isAbortError,
  postExtractFormData,
  postExtractJSON,
  postTriage,
  TriageStartError,
  type LongPacketProgress,
  type PollStartResponse,
  type PollSafetyNotice,
} from '../pollClient'
import {
  initialPollSafetyState,
  reducePollSafetyState,
} from '../pollSafetyState'
import { retainExtractionIngressSafetyNotice } from '@/components/triage/ExtractionIngressSafetyAlert'

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function deferredJsonResponse(status: number) {
  const started = deferred<void>()
  const body = deferred<unknown>()
  return {
    started,
    body,
    response: {
      ok: status >= 200 && status < 300,
      status,
      json: () => {
        started.resolve()
        return body.promise
      },
    } as Response,
  }
}

function resolveJsonThenAbortBeforeCaller(
  deferredResponse: ReturnType<typeof deferredJsonResponse>,
  payload: unknown,
  controller: AbortController,
) {
  deferredResponse.body.resolve(payload)
  queueMicrotask(() => controller.abort())
}

async function settle<T>(promise: Promise<T>) {
  try {
    return { ok: true as const, value: await promise }
  } catch (error) {
    return { ok: false as const, error }
  }
}

function expectAbortWithoutClinicalOutcome(
  outcome: Awaited<ReturnType<typeof settle>>,
) {
  expect(outcome.ok).toBe(false)
  if (outcome.ok) throw new Error('Expected request to abort')
  expect(isAbortError(outcome.error)).toBe(true)
  expect(outcome.error).not.toBeInstanceOf(TriageStartError)
}

function expectNonclinicalAbort(
  outcome: Awaited<ReturnType<typeof settle>>,
  onSafety: ReturnType<typeof vi.fn>,
) {
  expectAbortWithoutClinicalOutcome(outcome)
  expect(onSafety).not.toHaveBeenCalled()
}

describe('triage polling client start metadata', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it.each([
    ['JSON extraction', () => postExtractJSON],
    ['file extraction', () => postExtractFormData],
  ] as const)('delivers the %s safety response before the first poll', async (_label, getClient) => {
    const order: string[] = []
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => {
        order.push('post')
        return response(
          {
            extraction_id: 'extract-1',
            status: 'pending',
            immediate_review_required: true,
            safety_triage_session_id: 'triage-safety-1',
            safety_pathway: 'same_day_clinician_review',
            ingestion_mode: 'long_packet',
          },
          202,
        )
      })
      .mockImplementationOnce(async () => {
        order.push('poll')
        return response({
          extraction_id: 'extract-1',
          status: 'complete',
          extracted_summary: 'Synthetic summary',
        })
      })
    vi.stubGlobal('fetch', fetchMock)
    const onStart = vi.fn((start: PollStartResponse) => {
      order.push('start-callback')
      expect(start).toMatchObject({
        immediate_review_required: true,
        safety_triage_session_id: 'triage-safety-1',
      })
    })
    const client = getClient()
    const input = client === postExtractJSON ? { text: 'Synthetic source' } : new FormData()

    const result = await client<{ status: string; extracted_summary: string }>(
      input as never,
      undefined,
      { intervalMs: 0, maxAttempts: 1, onStart },
    )

    expect(result.extracted_summary).toBe('Synthetic summary')
    expect(onStart).toHaveBeenCalledOnce()
    expect(order).toEqual(['post', 'start-callback', 'poll'])
  })

  it('does not change existing callers that omit the start callback', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-2', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({
            extraction_id: 'extract-2',
            status: 'complete',
            extracted_summary: 'Existing result shape',
          }),
        ),
    )

    await expect(
      postExtractJSON<{ extracted_summary: string }>(
        { text: 'Synthetic source' },
        undefined,
        { intervalMs: 0, maxAttempts: 1 },
      ),
    ).resolves.toMatchObject({ extracted_summary: 'Existing result shape' })
  })

  it('rejects conflicting explicit safety ids from a successful start', async () => {
    const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          response(
            {
              extraction_id: 'extract-conflict',
              status: 'pending',
              safety_pathway: 'emergency_now',
              immediate_review_required: true,
              safety_triage_session_id: 'safety-a',
              safety_workflow_id: 'safety-b',
            },
            202,
          ),
        )
        .mockResolvedValueOnce(
          response({
            extraction_id: 'extract-conflict',
            status: 'complete',
            extracted_summary: 'Synthetic result',
          }),
        )
    vi.stubGlobal('fetch', fetchMock)
    const onStart = vi.fn()
    const onSafety = vi.fn()

    await expect(
      postExtractJSON(
        { text: 'Synthetic source' },
        undefined,
        { intervalMs: 0, maxAttempts: 1, onStart, onSafety },
      ),
    ).rejects.toMatchObject({
      name: 'TriageStartError',
      reason: 'safety_workflow_identity_conflict_manual_hold',
      safetyPathway: 'emergency_now',
      immediateActionRequired: true,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
      safetyWorkflowIdentityConflict: true,
    })
    expect(onStart).not.toHaveBeenCalled()
    expect(onSafety).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyPathway: 'emergency_now',
        safetyWorkflowIdentityConflict: true,
        holdReason: 'safety_workflow_identity_conflict_manual_hold',
      }),
    )
    expect(onSafety).not.toHaveBeenCalledWith(
      expect.objectContaining({ safetyWorkflowId: expect.any(String) }),
    )
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it.each([
    [
      'triage with extraction-only identity',
      'triage',
      { extraction_id: 'foreign-extraction', status: 'pending' },
    ],
    [
      'JSON extraction with session-only identity',
      'json',
      { session_id: 'foreign-session', status: 'pending' },
    ],
    [
      'file extraction with session-only identity',
      'form',
      { session_id: 'foreign-session', status: 'pending' },
    ],
    [
      'triage with a foreign extraction field',
      'triage',
      {
        session_id: 'triage-1',
        extraction_id: null,
        status: 'pending',
      },
    ],
    [
      'extraction with a foreign session field',
      'json',
      {
        extraction_id: 'extract-1',
        session_id: 'extract-1',
        status: 'pending',
      },
    ],
  ] as const)(
    'rejects %s before polling',
    async (_label, clientKind, startPayload) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response(startPayload, 202))
        .mockResolvedValueOnce(response({ status: 'complete' }))
      vi.stubGlobal('fetch', fetchMock)
      const onStart = vi.fn()
      const options = { intervalMs: 0, maxAttempts: 1, onStart }
      const promise =
        clientKind === 'triage'
          ? postTriage({}, undefined, options)
          : clientKind === 'json'
            ? postExtractJSON({}, undefined, options)
            : postExtractFormData(new FormData(), undefined, options)

      await expect(promise).rejects.toMatchObject({
        name: 'TriageStartError',
        reason: 'invalid_start_response',
      })
      expect(onStart).not.toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalledOnce()
    },
  )

  it.each([
    [
      'triage error with an extraction identity',
      'triage',
      { extraction_id: 'foreign-extraction' },
    ],
    [
      'JSON extraction error with a triage identity',
      'json',
      { session_id: 'foreign-session' },
    ],
    [
      'file extraction error with a triage identity',
      'form',
      { session_id: 'foreign-session' },
    ],
  ] as const)(
    'rejects a non-2xx %s without adopting its safety fields',
    async (_label, clientKind, foreignIdentity) => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        response(
          {
            ...foreignIdentity,
            error: 'Cross-kind synthetic hold.',
            reason: 'cross_kind_identity',
            safety_pathway: 'emergency_now',
            immediate_action_required: true,
            outpatient_scoring_blocked: false,
            safety_workflow_id: 'foreign-workflow',
          },
          409,
        ),
      )
      vi.stubGlobal('fetch', fetchMock)
      const onStart = vi.fn()
      const onSafety = vi.fn()
      const options = {
        intervalMs: 0,
        maxAttempts: 1,
        onStart,
        onSafety,
      }
      const promise =
        clientKind === 'triage'
          ? postTriage({}, undefined, options)
          : clientKind === 'json'
            ? postExtractJSON({}, undefined, options)
            : postExtractFormData(new FormData(), undefined, options)

      await expect(promise).rejects.toMatchObject({
        name: 'TriageStartError',
        reason: 'invalid_start_response',
        immediateActionRequired: false,
        outpatientScoringBlocked: true,
      })
      await expect(promise).rejects.not.toHaveProperty('safetyPathway')
      await expect(promise).rejects.not.toHaveProperty('safetyWorkflowId')
      expect(onStart).not.toHaveBeenCalled()
      expect(onSafety).not.toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalledOnce()
    },
  )

  it('accepts a strict triage identity and a matching terminal poll identity', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ session_id: 'triage-happy', status: 'pending' }, 202),
      )
      .mockResolvedValueOnce(
        response({
          session_id: 'triage-happy',
          status: 'complete',
          triage_tier: 'urgent',
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      postTriage<{ triage_tier: string }>(
        {},
        undefined,
        { intervalMs: 0, maxAttempts: 1 },
      ),
    ).resolves.toMatchObject({ triage_tier: 'urgent' })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/triage/triage-happy',
      expect.any(Object),
    )
  })

  it.each([
    [
      'same-tenant cross-id terminal',
      {
        extraction_id: 'extract-other',
        status: 'complete',
        extracted_summary: 'Foreign result',
      },
    ],
    [
      'missing-id pending',
      { status: 'pending' },
    ],
    [
      'missing-id terminal',
      { status: 'complete', extracted_summary: 'Unbound result' },
    ],
    [
      'foreign-field terminal',
      {
        extraction_id: 'extract-identity',
        session_id: 'foreign-session',
        status: 'complete',
        extracted_summary: 'Foreign-field result',
      },
    ],
  ] as const)(
    'rejects a %s with the accepted-job floor while retaining only trusted start safety',
    async (_label, pollPayload) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(
            response(
              {
                extraction_id: 'extract-identity',
                status: 'pending',
                safety_pathway: 'same_day_clinician_review',
                immediate_review_required: true,
                safety_workflow_id: 'workflow-start-a',
              },
              202,
            ),
          )
          .mockResolvedValueOnce(
            response({
              ...pollPayload,
              packet_safety: {
                care_pathway: 'emergency_now',
                clinician_hold: true,
              },
              safety_workflow_id: 'workflow-foreign-b',
            }),
          ),
      )
      const onStart = vi.fn()
      const onSafety = vi.fn()
      const onProgress = vi.fn()

      await expect(
        postExtractJSON(
          {},
          undefined,
          {
            intervalMs: 0,
            maxAttempts: 1,
            onStart,
            onSafety,
            onProgress,
          },
        ),
      ).rejects.toMatchObject({
        reason: 'invalid_poll_response',
        safetyPathway: 'same_day_clinician_review',
        safetyWorkflowId: 'workflow-start-a',
        immediateActionRequired: true,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
      })
      expect(onStart).toHaveBeenCalledWith(
        expect.objectContaining({
          safety_triage_session_id: 'workflow-start-a',
        }),
      )
      expect(onSafety).toHaveBeenLastCalledWith({
        safetyPathway: 'same_day_clinician_review',
        immediateActionRequired: true,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
        safetyWorkflowId: 'workflow-start-a',
        holdReason: 'invalid_poll_response',
      })
      expect(onSafety).not.toHaveBeenCalledWith(
        expect.objectContaining({ safetyWorkflowId: 'workflow-foreign-b' }),
      )
      expect(onProgress).not.toHaveBeenCalled()
    },
  )

  it('rejects a later explicit safety workflow that conflicts with the start identity', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response(
            {
              extraction_id: 'extract-safety-binding',
              status: 'pending',
              safety_workflow_id: 'workflow-start',
            },
            202,
          ),
        )
        .mockResolvedValueOnce(
          response({
            extraction_id: 'extract-safety-binding',
            status: 'complete',
            safety_workflow_id: 'workflow-later',
            packet_safety: {
              care_pathway: 'emergency_now',
              clinician_hold: true,
            },
          }),
        ),
    )
    const onSafety = vi.fn()

    await expect(
      postExtractJSON(
        {},
        undefined,
        { intervalMs: 0, maxAttempts: 1, onSafety },
      ),
    ).rejects.toMatchObject({
      reason: 'safety_workflow_identity_conflict_manual_hold',
      safetyPathway: 'emergency_now',
      safetyWorkflowIdentityConflict: true,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
    })
    expect(onSafety).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyPathway: 'emergency_now',
        safetyWorkflowIdentityConflict: true,
        holdReason: 'safety_workflow_identity_conflict_manual_hold',
      }),
    )
  })

  it('accepts identical explicit safety aliases and never uses the primary session id as safety identity', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ session_id: 'triage-primary', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({
            session_id: 'triage-primary',
            status: 'complete',
            safety_triage_session_id: 'workflow-same',
            safety_workflow_id: 'workflow-same',
            packet_safety: {
              care_pathway: 'same_day_clinician_review',
              clinician_hold: true,
            },
          }),
        ),
    )
    const onSafety = vi.fn()

    await postTriage(
      {},
      undefined,
      { intervalMs: 0, maxAttempts: 1, onSafety },
    )

    expect(onSafety).toHaveBeenCalledWith(
      expect.objectContaining({ safetyWorkflowId: 'workflow-same' }),
    )
    expect(onSafety).not.toHaveBeenCalledWith(
      expect.objectContaining({ safetyWorkflowId: 'triage-primary' }),
    )
  })

  it('does not infer a safety workflow from a generic matching session id', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ session_id: 'triage-generic', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({
            session_id: 'triage-generic',
            status: 'complete',
            packet_safety: {
              care_pathway: 'emergency_now',
              clinician_hold: true,
            },
          }),
        ),
    )
    const onSafety = vi.fn()

    await postTriage(
      {},
      undefined,
      { intervalMs: 0, maxAttempts: 1, onSafety },
    )

    expect(onSafety).toHaveBeenCalledWith(
      expect.not.objectContaining({ safetyWorkflowId: expect.any(String) }),
    )
  })

  it('surfaces terminal packet safety before resolving extraction', async () => {
    const order: string[] = []
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-late', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({
            extraction_id: 'extract-late',
            status: 'complete',
            extracted_summary: 'Synthetic complete result',
            packet_safety: {
              care_pathway: 'emergency_now',
              review_requirement: 'emergency_action',
              clinician_hold: true,
              signals: [],
            },
          }),
        ),
    )
    const onSafety = vi.fn((safety: Readonly<PollSafetyNotice>) => {
      order.push('safety')
      expect(safety).toMatchObject({
        safetyPathway: 'emergency_now',
        immediateActionRequired: true,
        humanReviewRequired: true,
        schedulingLocked: true,
      })
    })

    await postExtractJSON(
      { text: 'Synthetic source' },
      undefined,
      { intervalMs: 0, maxAttempts: 1, onSafety },
    ).then(() => order.push('resolved'))

    expect(onSafety).toHaveBeenCalledOnce()
    expect(order).toEqual(['safety', 'resolved'])
  })

  it('delivers only validated immutable long-packet progress on pending polls', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-3', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({
            extraction_id: 'extract-3',
            status: 'pending',
            long_packet_progress: {
              run_status: 'running',
              expected_chunks: 8,
              mapper: { completed: 3, failed: 0, leased: 1 },
              safety: { completed: 4, failed: 1, leased: 1 },
              finalizer_status: 'pending',
            },
          }),
        )
        .mockResolvedValueOnce(
          response({
            extraction_id: 'extract-3',
            status: 'complete',
            extracted_summary: 'Synthetic complete result',
          }),
        ),
    )
    const onProgress = vi.fn((progress: Readonly<LongPacketProgress> | null) => {
      expect(progress).toEqual({
        run_status: 'running',
        expected_chunks: 8,
        mapper: { completed: 3, failed: 0, leased: 1 },
        safety: { completed: 4, failed: 1, leased: 1 },
        finalizer_status: 'pending',
      })
      expect(Object.isFrozen(progress)).toBe(true)
      expect(Object.isFrozen(progress?.mapper)).toBe(true)
      expect(Object.isFrozen(progress?.safety)).toBe(true)
    })

    await postExtractJSON<{ extracted_summary: string }>(
      { text: 'Synthetic source' },
      undefined,
      { intervalMs: 0, maxAttempts: 2, onProgress },
    )

    expect(onProgress).toHaveBeenCalledOnce()
  })

  it.each([
    ['absent', undefined],
    [
      'inconsistent',
      {
        run_status: 'complete',
        expected_chunks: 8,
        mapper: { completed: 8, failed: 0, leased: 0 },
        safety: { completed: 7, failed: 0, leased: 0 },
        finalizer_status: 'complete',
      },
    ],
    [
      'extra field',
      {
        run_status: 'running',
        expected_chunks: 8,
        mapper: { completed: 3, failed: 0, leased: 1 },
        safety: { completed: 4, failed: 0, leased: 1 },
        finalizer_status: 'pending',
        run_id: 'must-not-cross-client-boundary',
      },
    ],
  ] as const)(
    'clears progress for %s pending data',
    async (...testCase) => {
      const longPacketProgress = testCase[1]
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(
            response({ extraction_id: 'extract-4', status: 'pending' }, 202),
          )
          .mockResolvedValueOnce(
            response({
              extraction_id: 'extract-4',
              status: 'pending',
              ...(longPacketProgress === undefined
                ? {}
                : { long_packet_progress: longPacketProgress }),
            }),
          )
          .mockResolvedValueOnce(
            response({
              extraction_id: 'extract-4',
              status: 'complete',
              extracted_summary: 'Synthetic complete result',
            }),
          ),
      )
      const onProgress = vi.fn()

      await postExtractJSON<{ extracted_summary: string }>(
        { text: 'Synthetic source' },
        undefined,
        { intervalMs: 0, maxAttempts: 2, onProgress },
      )

      expect(onProgress).toHaveBeenCalledOnce()
      expect(onProgress).toHaveBeenLastCalledWith(null)
    },
  )

  it('does not emit progress from a terminal payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-5', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({
            extraction_id: 'extract-5',
            status: 'complete',
            extracted_summary: 'Synthetic complete result',
            long_packet_progress: {
              run_status: 'complete',
              expected_chunks: 1,
              mapper: { completed: 1, failed: 0, leased: 0 },
              safety: { completed: 1, failed: 0, leased: 0 },
              finalizer_status: 'complete',
            },
          }),
        ),
    )
    const onProgress = vi.fn()

    await postExtractJSON<{ extracted_summary: string }>(
      { text: 'Synthetic source' },
      undefined,
      { intervalMs: 0, maxAttempts: 1, onProgress },
    )

    expect(onProgress).not.toHaveBeenCalled()
  })

  it.each([
    ['failed run', { run_status: 'failed', finalizer_status: 'pending' }],
    ['failed finalizer', { run_status: 'running', finalizer_status: 'failed' }],
  ] as const)(
    'stops polling and requires human review for a %s',
    async (_label, failedState) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-failed', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({
            extraction_id: 'extract-failed',
            status: 'pending',
            long_packet_progress: {
              run_status: failedState.run_status,
              expected_chunks: 8,
              mapper: { completed: 3, failed: 1, leased: 0 },
              safety: { completed: 4, failed: 0, leased: 0 },
              finalizer_status: failedState.finalizer_status,
            },
          }),
        )
      vi.stubGlobal('fetch', fetchMock)
      const onProgress = vi.fn()

      await expect(
        postExtractJSON(
          { text: 'Synthetic source' },
          undefined,
          { intervalMs: 0, maxAttempts: 10, onProgress },
        ),
      ).rejects.toThrow(
        'Packet processing failed. No triage result was produced. Route this referral for human review.',
      )

      expect(onProgress).toHaveBeenCalledOnce()
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
  )

  it('fails closed when polling stalls without a terminal result', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-stalled', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-stalled', status: 'pending' }),
        ),
    )
    const onSafety = vi.fn()
    const promise = postExtractJSON(
      { text: 'Synthetic source' },
      undefined,
      { intervalMs: 0, maxAttempts: 1, onSafety },
    )

    await expect(promise).rejects.toMatchObject({
      reason: 'polling_timeout',
      immediateActionRequired: false,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
    })
    await expect(promise).rejects.not.toHaveProperty('safetyPathway')
    await expect(promise).rejects.not.toHaveProperty('safetyWorkflowId')
    expect(onSafety).toHaveBeenCalledWith({
      immediateActionRequired: false,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
      holdReason: 'polling_timeout',
    })
  })

  it('throws a structured safety error from a terminal extraction failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-terminal', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({
            extraction_id: 'extract-terminal',
            status: 'error',
            error: 'Finalization failed after verified model safety.',
            reason: 'long_packet_finalization_failed',
            safety_pathway: 'emergency_now',
            immediate_action_required: true,
            outpatient_scoring_blocked: true,
            human_review_required: true,
            safety_workflow_id: 'triage-safety-terminal',
          }),
        ),
    )

    await expect(
      postExtractJSON(
        { text: 'Synthetic source' },
        undefined,
        { intervalMs: 0, maxAttempts: 1 },
      ),
    ).rejects.toMatchObject({
      name: 'TriageStartError',
      safetyPathway: 'emergency_now',
      immediateActionRequired: true,
      outpatientScoringBlocked: true,
      safetyWorkflowId: 'triage-safety-terminal',
    })
  })

  it.each([
    ['unknown status', response({ status: 'waiting_forever' })],
    ['array payload', response([{ status: 'pending' }])],
    ['null payload', response(null)],
    ['non-JSON payload', new Response('not-json', { status: 200 })],
  ])('fails closed with a typed error for a %s poll response', async (_label, pollResponse) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-invalid-poll', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(pollResponse),
    )

    await expect(
      postExtractJSON(
        { text: 'Synthetic source' },
        undefined,
        { intervalMs: 0, maxAttempts: 1 },
      ),
    ).rejects.toMatchObject({
      name: 'TriageStartError',
      reason: 'invalid_poll_response',
      immediateActionRequired: false,
      outpatientScoringBlocked: true,
    })
  })

  it.each([
    ['triage', 401],
    ['triage', 403],
    ['extraction', 401],
    ['extraction', 403],
  ] as const)(
    'keeps only bounded generic fields from an ID-less %s poll HTTP %i',
    async (clientKind, status) => {
      const primaryId =
        clientKind === 'triage' ? 'triage-idless' : 'extract-idless'
      const start =
        clientKind === 'triage'
          ? { session_id: primaryId, status: 'pending' as const }
          : { extraction_id: primaryId, status: 'pending' as const }
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          response(
            {
              ...start,
              safety_workflow_id: 'workflow-established-before-http-error',
            },
            202,
          ),
        )
        .mockResolvedValueOnce(
          response(
            {
              error: `Synthetic poll access failure ${status}.`,
              reason: `poll_http_${status}`,
              safety_pathway: 'emergency_now',
              immediate_action_required: true,
              outpatient_scoring_blocked: true,
              safety_workflow_id: 'forged-unbound-workflow',
            },
            status,
          ),
        )
      vi.stubGlobal('fetch', fetchMock)
      const onSafety = vi.fn()
      const onProgress = vi.fn()
      const promise =
        clientKind === 'triage'
          ? postTriage({}, undefined, {
              intervalMs: 0,
              maxAttempts: 1,
              onSafety,
              onProgress,
            })
          : postExtractJSON({}, undefined, {
              intervalMs: 0,
              maxAttempts: 1,
              onSafety,
              onProgress,
            })

      await expect(promise).rejects.toMatchObject({
        name: 'TriageStartError',
        message: `Synthetic poll access failure ${status}.`,
        reason: `poll_http_${status}`,
        immediateActionRequired: false,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
        safetyWorkflowId: 'workflow-established-before-http-error',
      })
      await expect(promise).rejects.not.toHaveProperty('safetyPathway')
      expect(onSafety).toHaveBeenCalledWith({
        immediateActionRequired: false,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
        safetyWorkflowId: 'workflow-established-before-http-error',
        holdReason: `poll_http_${status}`,
      })
      expect(onProgress).not.toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
  )

  it.each(['triage', 'extraction'] as const)(
    'accepts structured safety from a matching-ID, status-less %s poll HTTP error',
    async (clientKind) => {
      const primaryId =
        clientKind === 'triage' ? 'triage-matched-error' : 'extract-matched-error'
      const identity =
        clientKind === 'triage'
          ? { session_id: primaryId }
          : { extraction_id: primaryId }
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(
            response(
              {
                ...identity,
                status: 'pending',
                safety_workflow_id: 'workflow-matched-error',
              },
              202,
            ),
          )
          .mockResolvedValueOnce(
            response(
              {
                ...identity,
                error: 'Matched processing hold.',
                reason: 'matched_processing_hold',
                safety_pathway: 'same_day_clinician_review',
                immediate_action_required: true,
                outpatient_scoring_blocked: true,
                safety_workflow_id: 'workflow-matched-error',
              },
              409,
            ),
          ),
      )
      const promise =
        clientKind === 'triage'
          ? postTriage({}, undefined, { intervalMs: 0, maxAttempts: 1 })
          : postExtractJSON({}, undefined, { intervalMs: 0, maxAttempts: 1 })

      await expect(promise).rejects.toMatchObject({
        name: 'TriageStartError',
        message: 'Matched processing hold.',
        reason: 'matched_processing_hold',
        safetyPathway: 'same_day_clinician_review',
        safetyWorkflowId: 'workflow-matched-error',
        immediateActionRequired: true,
        outpatientScoringBlocked: true,
      })
    },
  )

  it.each([
    [
      'triage wrong primary id',
      'triage',
      { session_id: 'triage-wrong' },
    ],
    [
      'triage cross-kind id',
      'triage',
      { extraction_id: 'extract-foreign' },
    ],
    [
      'extraction wrong primary id',
      'extraction',
      { extraction_id: 'extract-wrong' },
    ],
    [
      'extraction cross-kind id',
      'extraction',
      { session_id: 'triage-foreign' },
    ],
  ] as const)(
    'fails closed with a local safety floor for a non-2xx %s',
    async (_label, clientKind, pollIdentity) => {
      const primaryId =
        clientKind === 'triage' ? 'triage-expected' : 'extract-expected'
      const start =
        clientKind === 'triage'
          ? { session_id: primaryId, status: 'pending' as const }
          : { extraction_id: primaryId, status: 'pending' as const }
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response(start, 202))
        .mockResolvedValueOnce(
          response(
            {
              ...pollIdentity,
              error: 'Unbound synthetic safety hold.',
              safety_pathway: 'emergency_now',
              immediate_action_required: true,
              outpatient_scoring_blocked: false,
              safety_workflow_id: 'unbound-workflow',
            },
            409,
          ),
        )
      vi.stubGlobal('fetch', fetchMock)
      const onSafety = vi.fn()
      const onProgress = vi.fn()
      const promise =
        clientKind === 'triage'
          ? postTriage({}, undefined, {
              intervalMs: 0,
              maxAttempts: 1,
              onSafety,
              onProgress,
            })
          : postExtractJSON({}, undefined, {
              intervalMs: 0,
              maxAttempts: 1,
              onSafety,
              onProgress,
            })

      await expect(promise).rejects.toMatchObject({
        reason: 'invalid_poll_response',
        immediateActionRequired: false,
        outpatientScoringBlocked: true,
      })
      await expect(promise).rejects.not.toHaveProperty('safetyPathway')
      await expect(promise).rejects.not.toHaveProperty('safetyWorkflowId')
      expect(onSafety).toHaveBeenCalledWith({
        immediateActionRequired: false,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
        holdReason: 'invalid_poll_response',
      })
      expect(onProgress).not.toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
  )

  it.each([
    ['triage conflicting aliases', 'triage', 'aliases'],
    ['triage conflicts with start binding', 'triage', 'start_binding'],
    ['extraction conflicting aliases', 'extraction', 'aliases'],
    ['extraction conflicts with start binding', 'extraction', 'start_binding'],
  ] as const)(
    'fails closed for non-2xx %s',
    async (_label, clientKind, conflictKind) => {
      const primaryId =
        clientKind === 'triage' ? 'triage-conflict' : 'extract-conflict'
      const identity =
        clientKind === 'triage'
          ? { session_id: primaryId }
          : { extraction_id: primaryId }
      const pollSafetyIdentity =
        conflictKind === 'aliases'
          ? {
              safety_triage_session_id: 'workflow-alias-a',
              safety_workflow_id: 'workflow-alias-b',
            }
          : { safety_workflow_id: 'workflow-conflicts-with-start' }
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          response(
            {
              ...identity,
              status: 'pending',
              safety_workflow_id: 'workflow-bound-at-start',
            },
            202,
          ),
        )
        .mockResolvedValueOnce(
          response(
            {
              ...identity,
              ...pollSafetyIdentity,
              error: 'Conflicting safety identity.',
              safety_pathway: 'emergency_now',
              immediate_action_required: true,
            },
            409,
          ),
        )
      vi.stubGlobal('fetch', fetchMock)
      const onSafety = vi.fn()
      const onProgress = vi.fn()
      const promise =
        clientKind === 'triage'
          ? postTriage({}, undefined, {
              intervalMs: 0,
              maxAttempts: 1,
              onSafety,
              onProgress,
            })
          : postExtractJSON({}, undefined, {
              intervalMs: 0,
              maxAttempts: 1,
              onSafety,
              onProgress,
            })

      await expect(promise).rejects.toMatchObject({
        reason: 'safety_workflow_identity_conflict_manual_hold',
        immediateActionRequired: true,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
        safetyWorkflowIdentityConflict: true,
        safetyPathway: 'emergency_now',
      })
      await expect(promise).rejects.not.toHaveProperty('safetyWorkflowId')
      expect(onSafety).toHaveBeenCalledWith(
        expect.objectContaining({
          safetyPathway: 'emergency_now',
          safetyWorkflowIdentityConflict: true,
          holdReason: 'safety_workflow_identity_conflict_manual_hold',
        }),
      )
      expect(onProgress).not.toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
  )

  it.each(['triage', 'extraction'] as const)(
    'creates a local hold for an ID-less %s poll HTTP 500 without trusting its fields',
    async (clientKind) => {
      const start =
        clientKind === 'triage'
          ? { session_id: 'triage-idless-500', status: 'pending' as const }
          : { extraction_id: 'extract-idless-500', status: 'pending' as const }
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(response(start, 202))
          .mockResolvedValueOnce(
            response(
              {
                error: 'Unbound server failure.',
                reason: 'unbound_server_failure',
                safety_pathway: 'emergency_now',
              },
              500,
            ),
          ),
      )
      const promise =
        clientKind === 'triage'
          ? postTriage({}, undefined, { intervalMs: 0, maxAttempts: 1 })
          : postExtractJSON({}, undefined, { intervalMs: 0, maxAttempts: 1 })

      await expect(promise).rejects.toMatchObject({
        reason: 'accepted_poll_target_unavailable',
        immediateActionRequired: false,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
      })
      await expect(promise).rejects.not.toHaveProperty('safetyPathway')
      await expect(promise).rejects.not.toHaveProperty('safetyWorkflowId')
    },
  )

  it('retains an established notice when an ID-less poll error supplies forged safety fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-retain', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response(
            {
              error: 'Extraction access expired.',
              reason: 'extraction_access_expired',
              safety_pathway: 'same_day_clinician_review',
              safety_workflow_id: 'forged-later-workflow',
            },
            403,
          ),
        ),
    )

    let error: unknown
    try {
      await postExtractJSON({}, undefined, { intervalMs: 0, maxAttempts: 1 })
    } catch (caught) {
      error = caught
    }
    expect(error).toMatchObject({
      reason: 'extraction_access_expired',
      immediateActionRequired: false,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
    })
    const retained = retainExtractionIngressSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'workflow-established',
        sourceLabel: 'established-referral.pdf',
        safetyPathway: 'emergency_now',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
      },
      error as never,
    )

    expect(retained).toMatchObject({
      safetyTriageSessionId: 'workflow-established',
      sourceLabel: 'established-referral.pdf',
      safetyPathway: 'emergency_now',
      holdReason: 'extraction_access_expired',
    })
  })

  it('aborts promptly while waiting between polls', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-abort', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-abort', status: 'pending' }),
        ),
    )

    const pending = postExtractJSON(
      { text: 'Synthetic source' },
      controller.signal,
      {
        intervalMs: 10_000,
        maxAttempts: 2,
        onProgress: () => controller.abort(),
      },
    ).catch((error) => error)
    const result = await Promise.race([
      pending,
      new Promise((resolve) => setTimeout(() => resolve('still-waiting'), 50)),
    ])

    expect(result).toMatchObject({ name: 'AbortError' })
  })

  it('recognizes name-based abort errors across runtimes', () => {
    expect(isAbortError(Object.assign(new Error('cancelled'), { name: 'AbortError' }))).toBe(
      true,
    )
    expect(isAbortError(new Error('ordinary failure'))).toBe(false)
  })
})

describe('response body abort race', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('aborts a triage start success before adopting deferred emergency safety', async () => {
    const controller = new AbortController()
    const deferredStart = deferredJsonResponse(202)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(deferredStart.response))
    const onStart = vi.fn()
    const onSafety = vi.fn()
    const pending = postTriage({}, controller.signal, { onStart, onSafety })

    await deferredStart.started.promise
    controller.abort()
    deferredStart.body.resolve({
      session_id: 'triage-deferred-start',
      status: 'pending',
      safety_pathway: 'emergency_now',
      immediate_review_required: true,
      safety_workflow_id: 'workflow-deferred-start',
    })

    expectNonclinicalAbort(await settle(pending), onSafety)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('aborts an extraction start error before adopting its deferred clinical error', async () => {
    const controller = new AbortController()
    const deferredStartError = deferredJsonResponse(409)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(deferredStartError.response),
    )
    const onSafety = vi.fn()
    const pending = postExtractJSON({}, controller.signal, { onSafety })

    await deferredStartError.started.promise
    controller.abort()
    deferredStartError.body.resolve({
      extraction_id: 'extract-deferred-start-error',
      error: 'Deferred extraction start failed.',
      reason: 'deferred_start_failed',
      safety_pathway: 'emergency_now',
      safety_workflow_id: 'workflow-deferred-start-error',
    })

    expectNonclinicalAbort(await settle(pending), onSafety)
  })

  it('aborts a triage poll success before returning its deferred complete result', async () => {
    const controller = new AbortController()
    const deferredComplete = deferredJsonResponse(200)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ session_id: 'triage-deferred-complete', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(deferredComplete.response),
    )
    const onSafety = vi.fn()
    const pending = postTriage<{ triage_tier: string }>(
      {},
      controller.signal,
      { intervalMs: 0, maxAttempts: 1, onSafety },
    )

    await deferredComplete.started.promise
    controller.abort()
    deferredComplete.body.resolve({
      session_id: 'triage-deferred-complete',
      status: 'complete',
      triage_tier: 'emergent',
      safety_pathway: 'emergency_now',
    })

    expectNonclinicalAbort(await settle(pending), onSafety)
  })

  it('aborts an extraction poll error before adopting its deferred non-2xx safety', async () => {
    const controller = new AbortController()
    const deferredPollError = deferredJsonResponse(409)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-deferred-error', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(deferredPollError.response),
    )
    const onSafety = vi.fn()
    const pending = postExtractJSON(
      {},
      controller.signal,
      { intervalMs: 0, maxAttempts: 1, onSafety },
    )

    await deferredPollError.started.promise
    controller.abort()
    deferredPollError.body.resolve({
      extraction_id: 'extract-deferred-error',
      error: 'Deferred poll failure.',
      reason: 'deferred_poll_failed',
      safety_pathway: 'emergency_now',
      safety_workflow_id: 'workflow-deferred-error',
    })

    expectNonclinicalAbort(await settle(pending), onSafety)
  })

  it('aborts triage start safety when JSON resolves just before the caller continuation', async () => {
    const controller = new AbortController()
    const deferredStart = deferredJsonResponse(202)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(deferredStart.response))
    const onStart = vi.fn()
    const onSafety = vi.fn()
    const pending = postTriage({}, controller.signal, { onStart, onSafety })

    await deferredStart.started.promise
    resolveJsonThenAbortBeforeCaller(
      deferredStart,
      {
        session_id: 'triage-resolve-before-abort',
        status: 'pending',
        safety_pathway: 'emergency_now',
        safety_workflow_id: 'workflow-resolve-before-abort',
      },
      controller,
    )

    expectNonclinicalAbort(await settle(pending), onSafety)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('aborts an extraction start error when JSON resolves just before the caller continuation', async () => {
    const controller = new AbortController()
    const deferredStartError = deferredJsonResponse(409)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(deferredStartError.response),
    )
    const onSafety = vi.fn()
    const pending = postExtractJSON({}, controller.signal, { onSafety })

    await deferredStartError.started.promise
    resolveJsonThenAbortBeforeCaller(
      deferredStartError,
      {
        extraction_id: 'extract-resolve-before-abort-error',
        error: 'Resolved extraction start failure.',
        reason: 'resolved_start_failed',
        safety_pathway: 'emergency_now',
        safety_workflow_id: 'workflow-resolved-start-error',
      },
      controller,
    )

    expectNonclinicalAbort(await settle(pending), onSafety)
  })

  it('does not return a triage result when complete JSON resolves just before abort', async () => {
    const controller = new AbortController()
    const deferredComplete = deferredJsonResponse(200)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ session_id: 'triage-resolved-complete', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(deferredComplete.response),
    )
    const onSafety = vi.fn()
    const pending = postTriage<{ triage_tier: string }>(
      {},
      controller.signal,
      { intervalMs: 0, maxAttempts: 1, onSafety },
    )

    await deferredComplete.started.promise
    resolveJsonThenAbortBeforeCaller(
      deferredComplete,
      {
        session_id: 'triage-resolved-complete',
        status: 'complete',
        triage_tier: 'emergent',
        safety_pathway: 'emergency_now',
      },
      controller,
    )

    expectNonclinicalAbort(await settle(pending), onSafety)
  })

  it('does not adopt an extraction non-2xx error when JSON resolves just before abort', async () => {
    const controller = new AbortController()
    const deferredPollError = deferredJsonResponse(409)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-resolved-error', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(deferredPollError.response),
    )
    const onSafety = vi.fn()
    const pending = postExtractJSON(
      {},
      controller.signal,
      { intervalMs: 0, maxAttempts: 1, onSafety },
    )

    await deferredPollError.started.promise
    resolveJsonThenAbortBeforeCaller(
      deferredPollError,
      {
        extraction_id: 'extract-resolved-error',
        error: 'Resolved poll failure.',
        reason: 'resolved_poll_failed',
        safety_pathway: 'emergency_now',
        safety_workflow_id: 'workflow-resolved-error',
      },
      controller,
    )

    expectNonclinicalAbort(await settle(pending), onSafety)
  })

  it('does not call onStart after start safety synchronously aborts the request', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        response(
          {
            session_id: 'triage-start-callback-abort',
            status: 'pending',
            safety_pathway: 'emergency_now',
          },
          202,
        ),
      ),
    )
    const onStart = vi.fn()
    const onSafety = vi.fn(() => controller.abort())

    const outcome = await settle(
      postTriage({}, controller.signal, { onStart, onSafety }),
    )

    expectAbortWithoutClinicalOutcome(outcome)
    expect(onSafety).toHaveBeenCalledOnce()
    expect(onStart).not.toHaveBeenCalled()
  })

  it('does not poll after onStart synchronously aborts the request', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockResolvedValueOnce(
      response(
        {
          extraction_id: 'extract-on-start-callback-abort',
          status: 'pending',
        },
        202,
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const onStart = vi.fn(() => controller.abort())

    const outcome = await settle(
      postExtractJSON({}, controller.signal, { onStart }),
    )

    expectAbortWithoutClinicalOutcome(outcome)
    expect(onStart).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('does not return complete poll data after onSafety synchronously aborts', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ session_id: 'triage-complete-callback-abort', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({
            session_id: 'triage-complete-callback-abort',
            status: 'complete',
            triage_tier: 'emergent',
            safety_pathway: 'emergency_now',
          }),
        ),
    )
    const onSafety = vi.fn(() => controller.abort())

    const outcome = await settle(
      postTriage({}, controller.signal, {
        intervalMs: 0,
        maxAttempts: 1,
        onSafety,
      }),
    )

    expectAbortWithoutClinicalOutcome(outcome)
    expect(onSafety).toHaveBeenCalledOnce()
  })

  it('does not throw a clinical poll error after onSafety synchronously aborts', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-error-callback-abort', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response(
            {
              extraction_id: 'extract-error-callback-abort',
              error: 'Synthetic accepted error.',
              safety_pathway: 'emergency_now',
            },
            409,
          ),
        ),
    )
    const onSafety = vi.fn(() => controller.abort())

    const outcome = await settle(
      postExtractJSON({}, controller.signal, {
        intervalMs: 0,
        maxAttempts: 1,
        onSafety,
      }),
    )

    expectAbortWithoutClinicalOutcome(outcome)
    expect(onSafety).toHaveBeenCalledOnce()
  })

  it('does not throw a clinical progress failure after onProgress aborts', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-progress-callback-abort', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({
            extraction_id: 'extract-progress-callback-abort',
            status: 'pending',
            long_packet_progress: {
              run_status: 'failed',
              expected_chunks: 1,
              mapper: { completed: 0, failed: 1, leased: 0 },
              safety: { completed: 0, failed: 1, leased: 0 },
              finalizer_status: 'failed',
            },
          }),
        ),
    )
    const onProgress = vi.fn(() => controller.abort())

    const outcome = await settle(
      postExtractJSON({}, controller.signal, {
        intervalMs: 0,
        maxAttempts: 1,
        onProgress,
      }),
    )

    expectAbortWithoutClinicalOutcome(outcome)
    expect(onProgress).toHaveBeenCalledOnce()
  })
})

describe('strict accepted-job poll safety state', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('ignores the real routine pending scheduling lock without creating a clinical alert', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ session_id: 'triage-routine-pending', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({
            session_id: 'triage-routine-pending',
            status: 'pending',
            care_pathway: 'undetermined',
            review_requirement: 'clinician_confirmation',
            workflow_status: 'pending_safety_screen',
            scheduling_locked: true,
            safety_review: null,
          }),
        )
        .mockResolvedValueOnce(
          response({
            session_id: 'triage-routine-pending',
            status: 'complete',
            triage_tier: 'routine',
            care_pathway: 'routine_outpatient',
            review_requirement: 'clinician_confirmation',
            workflow_status: 'decision_ready',
            scheduling_locked: true,
            safety_review: null,
          }),
        ),
    )
    const onSafety = vi.fn()

    await expect(
      postTriage({}, undefined, {
        intervalMs: 0,
        maxAttempts: 2,
        onSafety,
      }),
    ).resolves.toMatchObject({ triage_tier: 'routine' })
    expect(onSafety).not.toHaveBeenCalled()
  })

  it('does not trust clinical safety fields from an ID-less start authorization failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        response(
          {
            error: 'Synthetic start access denied.',
            reason: 'start_access_denied',
            safety_pathway: 'emergency_now',
            immediate_action_required: true,
            outpatient_scoring_blocked: true,
            safety_workflow_id: 'forged-start-auth-workflow',
          },
          401,
        ),
      ),
    )
    const onSafety = vi.fn()
    const promise = postTriage({}, undefined, { onSafety })

    await expect(promise).rejects.toMatchObject({
      message: 'Synthetic start access denied.',
      reason: 'start_access_denied',
      immediateActionRequired: false,
      outpatientScoringBlocked: false,
      humanReviewRequired: false,
      schedulingLocked: false,
    })
    await expect(promise).rejects.not.toHaveProperty('safetyPathway')
    await expect(promise).rejects.not.toHaveProperty('safetyWorkflowId')
    expect(onSafety).not.toHaveBeenCalled()
  })

  it('treats a start auth failure with a valid primary id as an accepted trusted job', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        response(
          {
            session_id: 'triage-accepted-auth',
            error: 'Accepted job access changed.',
            reason: 'accepted_job_access_changed',
            safety_pathway: 'emergency_now',
            safety_workflow_id: 'workflow-accepted-auth',
          },
          401,
        ),
      ),
    )
    const onSafety = vi.fn()
    const promise = postTriage({}, undefined, { onSafety })

    await expect(promise).rejects.toMatchObject({
      reason: 'accepted_job_access_changed',
      safetyPathway: 'emergency_now',
      safetyWorkflowId: 'workflow-accepted-auth',
      immediateActionRequired: true,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
    })
    expect(onSafety).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyPathway: 'emergency_now',
        safetyWorkflowId: 'workflow-accepted-auth',
        holdReason: 'accepted_job_access_changed',
      }),
    )
  })

  it('keeps an explicit emergency review significant in a routine complete context', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ session_id: 'triage-explicit-review', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({
            session_id: 'triage-explicit-review',
            status: 'complete',
            triage_tier: 'routine',
            care_pathway: 'routine_outpatient',
            review_requirement: 'emergency_action',
            scheduling_locked: true,
          }),
        ),
    )
    const onSafety = vi.fn()

    await expect(
      postTriage({}, undefined, {
        intervalMs: 0,
        maxAttempts: 1,
        onSafety,
      }),
    ).resolves.toMatchObject({ triage_tier: 'routine' })
    expect(onSafety).toHaveBeenCalledWith({
      immediateActionRequired: false,
      outpatientScoringBlocked: false,
      humanReviewRequired: true,
      schedulingLocked: true,
    })
  })

  it('does not turn a schedule-only ID-less start error into clinical safety', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        response(
          {
            error: 'Synthetic validation failure.',
            reason: 'synthetic_validation_failure',
            scheduling_locked: true,
          },
          400,
        ),
      ),
    )

    let caught: unknown
    try {
      await postTriage({})
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({
      reason: 'synthetic_validation_failure',
      immediateActionRequired: false,
      outpatientScoringBlocked: false,
      humanReviewRequired: false,
      schedulingLocked: false,
    })
    expect(
      retainExtractionIngressSafetyNotice(null, caught as never),
    ).toBeNull()
  })

  it('preserves abort semantics when cancellation interrupts poll body consumption', async () => {
    const bodyAbort = Object.assign(new Error('Cancelled while reading body.'), {
      name: 'AbortError',
    })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-body-abort', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockRejectedValue(bodyAbort),
        }),
    )
    const onSafety = vi.fn()

    await expect(
      postExtractJSON({}, undefined, {
        intervalMs: 0,
        maxAttempts: 1,
        onSafety,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(onSafety).not.toHaveBeenCalled()
  })

  it('does not let an ID-less auth reason declare a trusted pathway conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ session_id: 'triage-auth-reason', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response(
            {
              error: 'Synthetic access failure.',
              reason: 'safety_pathway_projection_conflict_manual_hold',
            },
            401,
          ),
        ),
    )
    const onSafety = vi.fn()
    const promise = postTriage({}, undefined, {
      intervalMs: 0,
      maxAttempts: 1,
      onSafety,
    })

    await expect(promise).rejects.toMatchObject({
      reason: 'poll_http_401',
      immediateActionRequired: false,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
    })
    expect(onSafety).toHaveBeenCalledWith({
      immediateActionRequired: false,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
      holdReason: 'poll_http_401',
    })
  })

  it.each([
    'source_safety_workflow_unavailable_manual_hold',
    'source_safety_workflow_inconsistent_manual_hold',
    'model_safety_workflow_persistence_failed',
    'model_safety_evidence_persistence_failed_manual_hold',
  ] as const)(
    'does not let an ID-less auth response forge %s and clear trusted identity',
    async (forgedReason) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(
            response(
              {
                extraction_id: 'extract-auth-suppression',
                status: 'pending',
                safety_pathway: 'same_day_clinician_review',
                safety_workflow_id: 'workflow-trusted-before-auth',
                immediate_action_required: true,
              },
              202,
            ),
          )
          .mockResolvedValueOnce(
            response(
              {
                error: 'Synthetic access failure.',
                reason: forgedReason,
              },
              401,
            ),
          ),
      )

      let caught: unknown
      try {
        await postExtractJSON({}, undefined, {
          intervalMs: 0,
          maxAttempts: 1,
        })
      } catch (error) {
        caught = error
      }

      expect(caught).toMatchObject({
        reason: 'poll_http_401',
        safetyPathway: 'same_day_clinician_review',
        safetyWorkflowId: 'workflow-trusted-before-auth',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
      })
      expect(
        retainExtractionIngressSafetyNotice(
          {
            immediateReviewRequired: true,
            safetyTriageSessionId: 'workflow-trusted-before-auth',
            sourceLabel: 'trusted-auth-referral.pdf',
            safetyPathway: 'same_day_clinician_review',
            outpatientScoringBlocked: false,
            humanReviewRequired: true,
            schedulingLocked: true,
          },
          caught as never,
        ),
      ).toMatchObject({
        safetyTriageSessionId: 'workflow-trusted-before-auth',
        safetyPathway: 'same_day_clinician_review',
        holdReason: 'poll_http_401',
      })
    },
  )

  it('surfaces an explicit pathless safety review requirement without inventing a pathway', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ session_id: 'triage-pathless-review', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({
            session_id: 'triage-pathless-review',
            status: 'pending',
            review_requirement: 'immediate_clinician_review',
          }),
        )
        .mockResolvedValueOnce(
          response({
            session_id: 'triage-pathless-review',
            status: 'complete',
            triage_tier: 'urgent',
          }),
        ),
    )
    const onSafety = vi.fn()

    await postTriage({}, undefined, {
      intervalMs: 0,
      maxAttempts: 2,
      onSafety,
    })

    expect(onSafety).toHaveBeenCalledWith({
      immediateActionRequired: false,
      outpatientScoringBlocked: false,
      humanReviewRequired: true,
      schedulingLocked: true,
    })
    expect(onSafety).not.toHaveBeenCalledWith(
      expect.objectContaining({ safetyPathway: expect.any(String) }),
    )
  })

  it('adds the accepted-job floor and merges matching-ID HTTP safety upward before throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({
            session_id: 'triage-matched-503',
            status: 'pending',
            safety_workflow_id: 'workflow-matched-503',
          }, 202),
        )
        .mockResolvedValueOnce(
          response(
            {
              session_id: 'triage-matched-503',
              error: 'Worker temporarily unavailable.',
              reason: 'worker_unavailable',
              safety_workflow_id: 'workflow-matched-503',
              packet_safety: {
                care_pathway: 'same_day_clinician_review',
                clinician_hold: true,
              },
              immediate_action_required: false,
              outpatient_scoring_blocked: false,
            },
            503,
          ),
        ),
    )
    const onSafety = vi.fn()
    const promise = postTriage({}, undefined, {
      intervalMs: 0,
      maxAttempts: 1,
      onSafety,
    })

    await expect(promise).rejects.toMatchObject({
      message: 'Worker temporarily unavailable.',
      reason: 'worker_unavailable',
      safetyPathway: 'same_day_clinician_review',
      safetyWorkflowId: 'workflow-matched-503',
      immediateActionRequired: true,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
    })
    expect(onSafety).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyPathway: 'same_day_clinician_review',
        safetyWorkflowId: 'workflow-matched-503',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
        holdReason: 'worker_unavailable',
      }),
    )
  })

  it('adds the accepted-job floor to a generic terminal processing error and emits safety first', async () => {
    const order: string[] = []
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-terminal-floor', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({
            extraction_id: 'extract-terminal-floor',
            status: 'error',
            error: 'Synthetic terminal failure.',
            reason: 'terminal_processing_failed',
            immediate_action_required: false,
            outpatient_scoring_blocked: false,
            human_review_required: false,
            scheduling_locked: false,
          }),
        ),
    )
    const onSafety = vi.fn(() => order.push('safety'))

    let caught: unknown
    try {
      await postExtractJSON({}, undefined, {
        intervalMs: 0,
        maxAttempts: 1,
        onSafety,
      })
    } catch (error) {
      order.push('throw')
      caught = error
    }

    expect(caught).toMatchObject({
      message: 'Synthetic terminal failure.',
      reason: 'terminal_processing_failed',
      immediateActionRequired: false,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
    })
    expect(caught).not.toHaveProperty('safetyPathway')
    expect(caught).not.toHaveProperty('safetyWorkflowId')
    expect(onSafety).toHaveBeenCalledWith({
      immediateActionRequired: false,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
      holdReason: 'terminal_processing_failed',
    })
    expect(order).toEqual(['safety', 'throw'])
  })

  it.each(['start', 'pending', 'complete', 'http'] as const)(
    'treats a malformed workflow alias as an identity conflict on %s',
    async (surface) => {
      const primaryId = `extract-malformed-${surface}`
      const malformedSafety = {
        safety_workflow_id: { forged: 'workflow' },
        packet_safety: {
          care_pathway: 'same_day_clinician_review',
          clinician_hold: true,
        },
      }
      const fetchMock = vi.fn()
      if (surface === 'start') {
        fetchMock.mockResolvedValueOnce(
          response(
            {
              extraction_id: primaryId,
              status: 'pending',
              ...malformedSafety,
            },
            202,
          ),
        )
      } else {
        fetchMock.mockResolvedValueOnce(
          response({
            extraction_id: primaryId,
            status: 'pending',
            safety_workflow_id: 'workflow-established',
          }, 202),
        )
        fetchMock.mockResolvedValueOnce(
          response(
            {
              extraction_id: primaryId,
              ...(surface === 'http' ? {} : { status: surface }),
              ...malformedSafety,
            },
            surface === 'http' ? 409 : 200,
          ),
        )
      }
      vi.stubGlobal('fetch', fetchMock)
      const onSafety = vi.fn()
      const promise = postExtractJSON({}, undefined, {
        intervalMs: 0,
        maxAttempts: 1,
        onSafety,
      })

      await expect(promise).rejects.toMatchObject({
        reason: 'safety_workflow_identity_conflict_manual_hold',
        safetyPathway: 'same_day_clinician_review',
        safetyWorkflowIdentityConflict: true,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
      })
      await expect(promise).rejects.not.toHaveProperty('safetyWorkflowId')
      expect(onSafety).toHaveBeenCalledWith(
        expect.objectContaining({
          safetyPathway: 'same_day_clinician_review',
          safetyWorkflowIdentityConflict: true,
          holdReason: 'safety_workflow_identity_conflict_manual_hold',
        }),
      )
    },
  )

  it('treats a workflow identity change on a matching pending response as an absorbing conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({
            session_id: 'triage-workflow-change',
            status: 'pending',
            safety_workflow_id: 'workflow-a',
          }, 202),
        )
        .mockResolvedValueOnce(
          response({
            session_id: 'triage-workflow-change',
            status: 'pending',
            safety_workflow_id: 'workflow-b',
            packet_safety: {
              care_pathway: 'emergency_now',
              clinician_hold: true,
            },
          }),
        ),
    )
    const onSafety = vi.fn()

    await expect(
      postTriage({}, undefined, {
        intervalMs: 0,
        maxAttempts: 1,
        onSafety,
      }),
    ).rejects.toMatchObject({
      reason: 'safety_workflow_identity_conflict_manual_hold',
      safetyPathway: 'emergency_now',
      safetyWorkflowIdentityConflict: true,
    })
    expect(onSafety).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyWorkflowIdentityConflict: true,
        holdReason: 'safety_workflow_identity_conflict_manual_hold',
      }),
    )
  })

  it.each([
    ['pending', 'emergency_now', 'same_day_clinician_review'],
    ['pending', 'same_day_clinician_review', 'emergency_now'],
    ['complete', 'emergency_now', 'same_day_clinician_review'],
    ['complete', 'same_day_clinician_review', 'emergency_now'],
    ['http', 'emergency_now', 'same_day_clinician_review'],
    ['http', 'same_day_clinician_review', 'emergency_now'],
  ] as const)(
    'rejects %s top=%s nested=%s pathway projection disagreement at emergency severity',
    async (surface, topPathway, nestedPathway) => {
      const primaryId = `extract-path-conflict-${surface}-${topPathway}`
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: primaryId, status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response(
            {
              extraction_id: primaryId,
              ...(surface === 'http' ? {} : { status: surface }),
              error: 'Conflicting pathway projections.',
              safety_pathway: topPathway,
              packet_safety: {
                care_pathway: nestedPathway,
                clinician_hold: true,
              },
            },
            surface === 'http' ? 409 : 200,
          ),
        )
      vi.stubGlobal('fetch', fetchMock)
      const onSafety = vi.fn()
      const promise = postExtractJSON({}, undefined, {
        intervalMs: 0,
        maxAttempts: 1,
        onSafety,
      })

      await expect(promise).rejects.toMatchObject({
        reason: 'safety_pathway_projection_conflict_manual_hold',
        safetyPathway: 'emergency_now',
        immediateActionRequired: true,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
      })
      expect(onSafety).toHaveBeenCalledWith(
        expect.objectContaining({
          safetyPathway: 'emergency_now',
          holdReason: 'safety_pathway_projection_conflict_manual_hold',
        }),
      )
    },
  )

  it.each([
    ['top-level', { safety_pathway: 'unsupported_pathway' }],
    ['nested', { packet_safety: { care_pathway: { forged: true } } }],
  ] as const)(
    'turns a malformed %s pathway projection into a pathless manual hold',
    async (_label, malformedProjection) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(
            response({ extraction_id: 'extract-malformed-path', status: 'pending' }, 202),
          )
          .mockResolvedValueOnce(
            response({
              extraction_id: 'extract-malformed-path',
              status: 'complete',
              extracted_summary: 'Must not resolve.',
              ...malformedProjection,
            }),
          ),
      )
      const onSafety = vi.fn()
      const promise = postExtractJSON({}, undefined, {
        intervalMs: 0,
        maxAttempts: 1,
        onSafety,
      })

      await expect(promise).rejects.toMatchObject({
        reason: 'safety_pathway_projection_conflict_manual_hold',
        immediateActionRequired: false,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
      })
      await expect(promise).rejects.not.toHaveProperty('safetyPathway')
      expect(onSafety).toHaveBeenCalledWith(
        expect.objectContaining({
          holdReason: 'safety_pathway_projection_conflict_manual_hold',
        }),
      )
    },
  )

  it('accepts identical top-level and nested pathway projections', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ session_id: 'triage-pathway-stable', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({
            session_id: 'triage-pathway-stable',
            status: 'complete',
            triage_tier: 'urgent',
            safety_pathway: 'same_day_clinician_review',
            packet_safety: {
              care_pathway: 'same_day_clinician_review',
              clinician_hold: true,
            },
          }),
        ),
    )
    const onSafety = vi.fn()

    await expect(
      postTriage({}, undefined, {
        intervalMs: 0,
        maxAttempts: 1,
        onSafety,
      }),
    ).resolves.toMatchObject({ triage_tier: 'urgent' })
    expect(onSafety).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyPathway: 'same_day_clinician_review',
      }),
    )
    expect(onSafety).not.toHaveBeenCalledWith(
      expect.objectContaining({
        holdReason: 'safety_pathway_projection_conflict_manual_hold',
      }),
    )
  })

  it('never binds a workflow identity after a pathless pathway conflict is established', () => {
    const conflicted = reducePollSafetyState(initialPollSafetyState(), {
      payload: { safety_pathway: 'unsupported_pathway' },
      trustRemoteSafety: true,
    })
    const laterIdentity = reducePollSafetyState(conflicted, {
      payload: { safety_workflow_id: 'workflow-must-not-bind-later' },
      trustRemoteSafety: true,
    })

    expect(conflicted).toMatchObject({
      outcome: 'pathway_conflict',
      notice: {
        holdReason: 'safety_pathway_projection_conflict_manual_hold',
      },
    })
    expect(laterIdentity).toMatchObject({
      outcome: 'pathway_conflict',
      notice: {
        holdReason: 'safety_pathway_projection_conflict_manual_hold',
      },
    })
    expect(laterIdentity).not.toHaveProperty('workflowId')
    expect(laterIdentity.notice).not.toHaveProperty('safetyWorkflowId')
  })

  it.each([
    'source_safety_workflow_unavailable_manual_hold',
    'source_safety_workflow_inconsistent_manual_hold',
    'model_safety_workflow_persistence_failed',
    'model_safety_evidence_persistence_failed_manual_hold',
  ] as const)(
    'suppresses a previously accepted workflow id for trusted %s',
    (reason) => {
      const established = reducePollSafetyState(initialPollSafetyState(), {
        payload: {
          safety_pathway: 'same_day_clinician_review',
          safety_workflow_id: 'workflow-established-same-day',
          immediate_action_required: true,
        },
        trustRemoteSafety: true,
      })
      const held = reducePollSafetyState(established, {
        payload: {
          reason,
          safety_pathway: 'emergency_now',
          packet_safety: {
            care_pathway: 'emergency_now',
            clinician_hold: true,
          },
          immediate_action_required: true,
          outpatient_scoring_blocked: true,
          human_review_required: true,
          scheduling_locked: true,
        },
        trustRemoteSafety: true,
        localFailureReason: 'long_packet_processing_failed',
      })

      expect(held).toMatchObject({
        outcome: 'local_failure_hold',
        notice: {
          safetyPathway: 'emergency_now',
          immediateActionRequired: true,
          outpatientScoringBlocked: true,
          humanReviewRequired: true,
          schedulingLocked: true,
          holdReason: reason,
        },
      })
      expect(held).not.toHaveProperty('workflowId')
      expect(held.notice).not.toHaveProperty('safetyWorkflowId')
    },
  )

  it.each([
    'source_safety_workflow_unavailable_manual_hold',
    'source_safety_workflow_inconsistent_manual_hold',
    'model_safety_workflow_persistence_failed',
    'model_safety_evidence_persistence_failed_manual_hold',
  ] as const)(
    'ignores untrusted %s without mutating established safety state',
    (reason) => {
      const established = reducePollSafetyState(initialPollSafetyState(), {
        payload: {
          safety_pathway: 'same_day_clinician_review',
          safety_workflow_id: 'workflow-established-same-day',
          immediate_action_required: true,
        },
        trustRemoteSafety: true,
      })
      const ignored = reducePollSafetyState(established, {
        payload: {
          reason,
          safety_pathway: 'emergency_now',
          outpatient_scoring_blocked: true,
        },
        trustRemoteSafety: false,
      })

      expect(ignored).toBe(established)
    },
  )

  it('keeps trusted workflow suppression primary when the same payload has conflicting pathways', () => {
    const established = reducePollSafetyState(initialPollSafetyState(), {
      payload: {
        safety_pathway: 'same_day_clinician_review',
        safety_workflow_id: 'workflow-before-combined-hold',
        immediate_action_required: true,
      },
      trustRemoteSafety: true,
    })
    const held = reducePollSafetyState(established, {
      payload: {
        reason: 'source_safety_workflow_inconsistent_manual_hold',
        safety_pathway: 'emergency_now',
        packet_safety: {
          care_pathway: 'same_day_clinician_review',
          clinician_hold: true,
        },
        immediate_action_required: true,
        outpatient_scoring_blocked: true,
      },
      trustRemoteSafety: true,
    })

    expect(held).toMatchObject({
      outcome: 'local_failure_hold',
      notice: {
        safetyPathway: 'emergency_now',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
        holdReason: 'source_safety_workflow_inconsistent_manual_hold',
      },
    })
    expect(held).not.toHaveProperty('workflowId')
    expect(held.notice).not.toHaveProperty('safetyWorkflowId')
  })

  it('carries trusted workflow suppression through an existing higher-ranked pathway conflict', () => {
    const established = reducePollSafetyState(initialPollSafetyState(), {
      payload: {
        safety_pathway: 'same_day_clinician_review',
        safety_workflow_id: 'workflow-frozen-by-pathway-conflict',
        immediate_action_required: true,
      },
      trustRemoteSafety: true,
    })
    const conflicted = reducePollSafetyState(established, {
      payload: {
        safety_pathway: 'emergency_now',
        packet_safety: {
          care_pathway: 'same_day_clinician_review',
          clinician_hold: true,
        },
      },
      trustRemoteSafety: true,
    })
    const suppressed = reducePollSafetyState(conflicted, {
      payload: {
        reason: 'source_safety_workflow_unavailable_manual_hold',
        safety_pathway: 'emergency_now',
        immediate_action_required: true,
        outpatient_scoring_blocked: true,
      },
      trustRemoteSafety: true,
    })

    expect(conflicted).toMatchObject({
      outcome: 'pathway_conflict',
      workflowId: 'workflow-frozen-by-pathway-conflict',
    })
    expect(suppressed).toMatchObject({
      outcome: 'pathway_conflict',
      notice: {
        safetyPathway: 'emergency_now',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
        holdReason: 'source_safety_workflow_unavailable_manual_hold',
      },
    })
    expect(suppressed).not.toHaveProperty('workflowId')
    expect(suppressed.notice).not.toHaveProperty('safetyWorkflowId')
  })
})

async function captureStartError(payload: unknown, status = 409) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(payload, status)))
  try {
    await postTriage({ source_extraction_id: 'synthetic-extraction-1' })
  } catch (error) {
    return error as Error & {
      reason?: string
      safetyPathway?: string
      immediateActionRequired?: boolean
      outpatientScoringBlocked?: boolean
      safetyWorkflowId?: string
    }
  }
  throw new Error('Expected triage start to reject')
}

describe('triage start structured safety errors', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('retains a governed emergency hold without reducing it to a message string', async () => {
    const error = await captureStartError({
      error: 'Persisted summary is missing.',
      reason: 'source_extraction_summary_missing',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      safety_triage_session_id: 'triage-safety-1',
    })

    expect(error).toMatchObject({
      name: 'TriageStartError',
      message: 'Persisted summary is missing.',
      reason: 'source_extraction_summary_missing',
      safetyPathway: 'emergency_now',
      immediateActionRequired: true,
      outpatientScoringBlocked: true,
      safetyWorkflowId: 'triage-safety-1',
    })
  })

  it('retains a governed same-day hold and its safety workflow identifier', async () => {
    const error = await captureStartError({
      error: 'Scoring is blocked.',
      reason: 'source_extraction_packet_safety_invalid',
      safety_pathway: 'same_day_clinician_review',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      safety_workflow_id: 'workflow-same-day-1',
    })

    expect(error).toMatchObject({
      name: 'TriageStartError',
      safetyPathway: 'same_day_clinician_review',
      immediateActionRequired: true,
      outpatientScoringBlocked: true,
      safetyWorkflowId: 'workflow-same-day-1',
    })
  })

  it('drops conflicting workflow aliases without masking an adjacent emergency', async () => {
    const error = await captureStartError({
      error: 'Conflicting safety identity.',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      safety_triage_session_id: 'triage-safety-a',
      safety_workflow_id: 'triage-safety-b',
    })

    expect(error).toMatchObject({
      name: 'TriageStartError',
      reason: 'safety_workflow_identity_conflict_manual_hold',
      safetyPathway: 'emergency_now',
      immediateActionRequired: true,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
      safetyWorkflowIdentityConflict: true,
    })
    expect(error).not.toHaveProperty('safetyWorkflowId')
  })

  it('accepts identical explicit safety workflow identifiers', async () => {
    const error = await captureStartError({
      error: 'Duplicate explicit safety identity.',
      safety_pathway: 'same_day_clinician_review',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      safety_triage_session_id: 'triage-safety-same',
      safety_workflow_id: 'triage-safety-same',
    })

    expect(error).toMatchObject({ safetyWorkflowId: 'triage-safety-same' })
  })

  it('never treats a generic triage session id as a safety workflow id', async () => {
    const error = await captureStartError({
      error: 'Generic session only.',
      safety_pathway: 'emergency_now',
      immediate_action_required: true,
      outpatient_scoring_blocked: true,
      session_id: 'ordinary-triage-session',
    })

    expect(error).not.toHaveProperty('safetyWorkflowId')
  })

  it('retains a routine scoring hold without inventing an immediate action', async () => {
    const error = await captureStartError({
      error: 'Persisted summary is missing.',
      reason: 'source_extraction_summary_missing',
      immediate_action_required: false,
      outpatient_scoring_blocked: true,
    })

    expect(error).toMatchObject({
      name: 'TriageStartError',
      immediateActionRequired: false,
      outpatientScoringBlocked: true,
    })
    expect(error).not.toHaveProperty('safetyPathway')
  })

  it.each([
    [
      'unsupported pathway',
      {
        safety_pathway: 'routine_outpatient',
        immediate_action_required: true,
        outpatient_scoring_blocked: true,
      },
    ],
    [
      'array payload',
      [
        {
          safety_pathway: 'emergency_now',
          immediate_action_required: true,
          outpatient_scoring_blocked: true,
        },
      ],
    ],
  ] as const)('does not accept a governed pathway from %s', async (_label, payload) => {
    const error = await captureStartError(payload)

    expect(error.name).toBe('TriageStartError')
    expect(error).not.toHaveProperty('safetyPathway')
    expect(error).not.toHaveProperty('safetyWorkflowId')
  })

  it('drops a malformed workflow alias without masking adjacent same-day safety', async () => {
    const error = await captureStartError({
      safety_pathway: 'same_day_clinician_review',
      immediate_action_required: 'true',
      outpatient_scoring_blocked: 'true',
      safety_triage_session_id: { forged: 'workflow' },
    })

    expect(error).toMatchObject({
      name: 'TriageStartError',
      reason: 'safety_workflow_identity_conflict_manual_hold',
      safetyPathway: 'same_day_clinician_review',
      immediateActionRequired: true,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
      safetyWorkflowIdentityConflict: true,
    })
    expect(error).not.toHaveProperty('safetyWorkflowId')
  })

  it('keeps a useful generic error when no structured safety fields exist', async () => {
    const error = await captureStartError(
      { error: 'Synthetic validation failed.' },
      400,
    )

    expect(error).toMatchObject({
      name: 'TriageStartError',
      message: 'Synthetic validation failed.',
      immediateActionRequired: false,
      outpatientScoringBlocked: false,
    })
    expect(error).not.toHaveProperty('reason')
    expect(error).not.toHaveProperty('safetyPathway')
  })

  it('falls back safely when the non-2xx response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('not json', { status: 503 })),
    )

    await expect(
      postTriage({ source_extraction_id: 'synthetic-extraction-1' }),
    ).rejects.toMatchObject({
      name: 'TriageStartError',
      message: 'Request failed (503)',
      immediateActionRequired: false,
      outpatientScoringBlocked: false,
    })
  })
})

describe('accepted poll identity recovery and opaque ids', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it.each([
    'model_safety_workflow_persistence_failed',
    'model_safety_evidence_persistence_failed_manual_hold',
  ] as const)('keeps a trusted recovered workflow reachable under %s', async (reason) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response(
            {
              extraction_id: 'extract-recovered-workflow',
              status: 'pending',
            },
            202,
          ),
        )
        .mockResolvedValueOnce(
          response({
            extraction_id: 'extract-recovered-workflow',
            status: 'error',
            error: 'A later safety checkpoint could not persist.',
            reason,
            safety_pathway: 'same_day_clinician_review',
            safety_triage_session_id: 'triage-existing-same-day',
            immediate_action_required: true,
            outpatient_scoring_blocked: true,
            human_review_required: true,
            scheduling_locked: true,
          }),
        ),
    )
    const onSafety = vi.fn()

    await expect(
      postExtractJSON({}, undefined, {
        intervalMs: 0,
        maxAttempts: 1,
        onSafety,
      }),
    ).rejects.toMatchObject({
      reason,
      safetyPathway: 'same_day_clinician_review',
      safetyWorkflowId: 'triage-existing-same-day',
      immediateActionRequired: true,
      outpatientScoringBlocked: true,
    })
    expect(onSafety).toHaveBeenCalledWith(
      expect.objectContaining({
        safetyWorkflowId: 'triage-existing-same-day',
        safetyPathway: 'same_day_clinician_review',
      }),
    )
  })

  it.each([
    'source_safety_workflow_unavailable_manual_hold',
    'source_safety_workflow_inconsistent_manual_hold',
    'model_safety_workflow_persistence_failed',
    'model_safety_evidence_persistence_failed_manual_hold',
  ] as const)(
    'does not trust an id-mismatched %s reason to clear accepted safety identity',
    async (reason) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(
            response(
              {
                extraction_id: 'extract-trusted-workflow',
                status: 'pending',
                safety_pathway: 'same_day_clinician_review',
                safety_workflow_id: 'workflow-trusted-same-day',
                immediate_action_required: true,
              },
              202,
            ),
          )
          .mockResolvedValueOnce(
            response({
              extraction_id: 'extract-attacker-controlled-mismatch',
              status: 'error',
              error: 'Untrusted mismatched response.',
              reason,
              safety_pathway: 'emergency_now',
              outpatient_scoring_blocked: true,
            }),
          ),
      )

      await expect(
        postExtractJSON({}, undefined, { intervalMs: 0, maxAttempts: 1 }),
      ).rejects.toMatchObject({
        reason: 'invalid_poll_response',
        safetyPathway: 'same_day_clinician_review',
        safetyWorkflowId: 'workflow-trusted-same-day',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
      })
    },
  )

  it.each([
    ['triage', 404],
    ['triage', 408],
    ['triage', 410],
    ['extraction', 404],
    ['extraction', 503],
  ] as const)(
    'creates a local fail-closed hold when an accepted %s poll target returns ID-less HTTP %i',
    async (clientKind, status) => {
      const start =
        clientKind === 'triage'
          ? { session_id: 'triage-accepted', status: 'pending' as const }
          : { extraction_id: 'extract-accepted', status: 'pending' as const }
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response(start, 202))
        .mockResolvedValueOnce(
          response(
            {
              error: 'Forged payload message must not define safety.',
              reason: 'forged_remote_reason',
              safety_pathway: 'emergency_now',
              safety_workflow_id: 'forged-workflow',
            },
            status,
          ),
        )
      vi.stubGlobal('fetch', fetchMock)
      const onSafety = vi.fn()
      const promise =
        clientKind === 'triage'
          ? postTriage({}, undefined, {
              intervalMs: 0,
              maxAttempts: 1,
              onSafety,
            })
          : postExtractJSON({}, undefined, {
              intervalMs: 0,
              maxAttempts: 1,
              onSafety,
            })

      await expect(promise).rejects.toMatchObject({
        name: 'TriageStartError',
        reason: 'accepted_poll_target_unavailable',
        immediateActionRequired: false,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
      })
      await expect(promise).rejects.not.toHaveProperty('safetyPathway')
      await expect(promise).rejects.not.toHaveProperty('safetyWorkflowId')
      expect(onSafety).toHaveBeenCalledWith({
        immediateActionRequired: false,
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
        holdReason: 'accepted_poll_target_unavailable',
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
  )

  it('creates the same local hold when an accepted poll request times out at the network boundary', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ session_id: 'triage-network-timeout', status: 'pending' }, 202),
      )
      .mockRejectedValueOnce(new TypeError('Synthetic network timeout'))
    vi.stubGlobal('fetch', fetchMock)
    const onSafety = vi.fn()
    const promise = postTriage({}, undefined, {
      intervalMs: 0,
      maxAttempts: 1,
      onSafety,
    })

    await expect(promise).rejects.toMatchObject({
      reason: 'accepted_poll_target_unavailable',
      immediateActionRequired: false,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
    })
    await expect(promise).rejects.not.toHaveProperty('safetyPathway')
    await expect(promise).rejects.not.toHaveProperty('safetyWorkflowId')
    expect(onSafety).toHaveBeenCalledWith({
      immediateActionRequired: false,
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      schedulingLocked: true,
      holdReason: 'accepted_poll_target_unavailable',
    })
  })

  it('keeps a prior emergency identity when the accepted poll target disappears', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-prior-emergency', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(response({ error: 'Not found' }, 404)),
    )

    let error: unknown
    try {
      await postExtractJSON({}, undefined, { intervalMs: 0, maxAttempts: 1 })
    } catch (caught) {
      error = caught
    }
    const retained = retainExtractionIngressSafetyNotice(
      {
        immediateReviewRequired: true,
        safetyTriageSessionId: 'workflow-prior-emergency',
        sourceLabel: 'prior-emergency.pdf',
        safetyPathway: 'emergency_now',
        outpatientScoringBlocked: true,
        humanReviewRequired: true,
        schedulingLocked: true,
      },
      error as never,
    )

    expect(retained).toMatchObject({
      safetyTriageSessionId: 'workflow-prior-emergency',
      sourceLabel: 'prior-emergency.pdf',
      safetyPathway: 'emergency_now',
      outpatientScoringBlocked: true,
      humanReviewRequired: true,
      holdReason: 'accepted_poll_target_unavailable',
    })
  })

  it.each(['pending', 'complete'] as const)(
    'retains governed safety and nulls workflow identity for matching-primary %s alias conflicts',
    async (pollStatus) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          response({ extraction_id: 'extract-alias-conflict', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response({
            extraction_id: 'extract-alias-conflict',
            status: pollStatus,
            safety_triage_session_id: 'workflow-alias-a',
            safety_workflow_id: 'workflow-alias-b',
            packet_safety: {
              care_pathway: 'emergency_now',
              clinician_hold: true,
            },
            safety_pathway: 'emergency_now',
            immediate_action_required: true,
            outpatient_scoring_blocked: true,
            scheduling_locked: true,
          }),
        )
      if (pollStatus === 'pending') {
        fetchMock.mockResolvedValueOnce(
          response({
            extraction_id: 'extract-alias-conflict',
            status: 'complete',
            extracted_summary: 'Must not be adopted after identity conflict.',
          }),
        )
      }
      vi.stubGlobal('fetch', fetchMock)
      const onSafety = vi.fn()

      await expect(
        postExtractJSON({}, undefined, {
          intervalMs: 0,
          maxAttempts: 2,
          onSafety,
        }),
      ).rejects.toMatchObject({
        reason: 'safety_workflow_identity_conflict_manual_hold',
        safetyPathway: 'emergency_now',
        immediateActionRequired: true,
        outpatientScoringBlocked: true,
        safetyWorkflowIdentityConflict: true,
        humanReviewRequired: true,
        schedulingLocked: true,
      })
      expect(onSafety).toHaveBeenCalledWith(
        expect.objectContaining({
          safetyPathway: 'emergency_now',
          immediateActionRequired: true,
          outpatientScoringBlocked: true,
          humanReviewRequired: true,
          schedulingLocked: true,
          safetyWorkflowIdentityConflict: true,
          holdReason: 'safety_workflow_identity_conflict_manual_hold',
        }),
      )
      expect(onSafety).not.toHaveBeenCalledWith(
        expect.objectContaining({ safetyWorkflowId: expect.any(String) }),
      )
    },
  )

  it('retains same-day safety from a matching-primary non-2xx alias conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ session_id: 'triage-alias-http', status: 'pending' }, 202),
        )
        .mockResolvedValueOnce(
          response(
            {
              session_id: 'triage-alias-http',
              error: 'Conflicting workflow aliases.',
              safety_triage_session_id: 'workflow-http-a',
              safety_workflow_id: 'workflow-http-b',
              safety_pathway: 'same_day_clinician_review',
              immediate_action_required: true,
              outpatient_scoring_blocked: true,
            },
            409,
          ),
        ),
    )

    await expect(
      postTriage({}, undefined, { intervalMs: 0, maxAttempts: 1 }),
    ).rejects.toMatchObject({
      reason: 'safety_workflow_identity_conflict_manual_hold',
      safetyPathway: 'same_day_clinician_review',
      immediateActionRequired: true,
      outpatientScoringBlocked: true,
      safetyWorkflowIdentityConflict: true,
      humanReviewRequired: true,
      schedulingLocked: true,
    })
  })

  it.each([
    '../foreign?x=1',
    '%2f',
    'unsafe id',
    'unsafe\u0001id',
    'a'.repeat(201),
  ])('rejects an unsafe start primary id before polling: %j', async (unsafeId) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      response({ session_id: unsafeId, status: 'pending' }, 202),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(postTriage({})).rejects.toMatchObject({
      reason: 'invalid_start_response',
      outpatientScoringBlocked: true,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it.each([
    {
      label: 'triage',
      start: { session_id: 'triage:opaque-1', status: 'pending' },
      complete: {
        session_id: 'triage:opaque-1',
        status: 'complete',
        triage_tier: 'urgent',
      },
      run: () => postTriage({}, undefined, { intervalMs: 0, maxAttempts: 1 }),
      url: '/api/triage/triage%3Aopaque-1',
    },
    {
      label: 'JSON extraction',
      start: { extraction_id: 'extract:opaque-1', status: 'pending' },
      complete: {
        extraction_id: 'extract:opaque-1',
        status: 'complete',
        extracted_summary: 'Synthetic summary',
      },
      run: () =>
        postExtractJSON({}, undefined, { intervalMs: 0, maxAttempts: 1 }),
      url: '/api/triage/extract/extract%3Aopaque-1',
    },
    {
      label: 'form extraction',
      start: { extraction_id: 'form:opaque-1', status: 'pending' },
      complete: {
        extraction_id: 'form:opaque-1',
        status: 'complete',
        extracted_summary: 'Synthetic summary',
      },
      run: () =>
        postExtractFormData(new FormData(), undefined, {
          intervalMs: 0,
          maxAttempts: 1,
        }),
      url: '/api/triage/extract/form%3Aopaque-1',
    },
  ])('encodes a valid opaque primary id in the $label poll URL', async ({
    start,
    complete,
    run,
    url,
  }) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(start, 202))
      .mockResolvedValueOnce(response(complete))
    vi.stubGlobal('fetch', fetchMock)

    await run()

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      url,
      expect.any(Object),
    )
  })
})
