import { describe, expect, it, vi } from 'vitest'

import {
  applyFinalizedOutpatientDisposition,
  buildOutpatientFinalizationCommand,
  getOrCreateOutpatientDispositionKey,
  finalizedDispositionMatchesResult,
  isEligibleForOutpatientFinalization,
  outpatientFinalDispositionFingerprint,
  parseFinalizedOutpatientDisposition,
  submitOutpatientFinalization,
} from '@/lib/triage/outpatientFinalDispositionClient'
import type { TriageResult } from '@/lib/triage/types'

function safeResult(overrides: Partial<TriageResult> = {}): TriageResult {
  return {
    session_id: 'triage-safe-1',
    triage_tier: 'routine',
    triage_tier_display: 'Routine',
    confidence: 'high',
    dimension_scores: {
      symptom_acuity: { score: 2, rationale: 'Synthetic stable symptoms.' },
      diagnostic_concern: { score: 2, rationale: 'No time-critical concern.' },
      rate_of_progression: { score: 1, rationale: 'Not progressing.' },
      functional_impairment: { score: 2, rationale: 'Mild impairment.' },
      red_flag_presence: { score: 1, rationale: 'No red flags.' },
    },
    weighted_score: 1.85,
    red_flag_override: false,
    emergent_override: false,
    emergent_reason: null,
    insufficient_data: false,
    missing_information: [],
    clinical_reasons: ['Synthetic complete outpatient referral.'],
    red_flags: [],
    suggested_workup: [],
    failed_therapies: [],
    subspecialty_recommendation: 'General Neurology',
    subspecialty_rationale: 'Synthetic routing rationale.',
    redirect_to_non_neuro: false,
    redirect_specialty: null,
    redirect_rationale: null,
    disclaimer: 'Synthetic teaching result.',
    care_pathway: 'routine_outpatient',
    data_quality: 'sufficient',
    coverage_status: 'complete',
    review_requirement: 'clinician_confirmation',
    workflow_status: 'clinician_review',
    scheduling_locked: true,
    outpatient_finalization_allowed: true,
    safety_review: null,
    ...overrides,
  }
}

describe('isEligibleForOutpatientFinalization', () => {
  it.each([
    ['routine priority', safeResult({ triage_tier: 'routine_priority' })],
    ['routine', safeResult()],
    ['non-urgent', safeResult({ triage_tier: 'non_urgent' })],
    [
      'urgent expedited',
      safeResult({
        care_pathway: 'expedited_outpatient',
        triage_tier: 'urgent',
      }),
    ],
    [
      'semi-urgent expedited',
      safeResult({
        care_pathway: 'expedited_outpatient',
        triage_tier: 'semi_urgent',
      }),
    ],
  ])('allows a complete locked clinician review for %s', (_label, result) => {
    expect(isEligibleForOutpatientFinalization(result)).toBe(true)
  })

  it.each([
    ['emergency pathway', { care_pathway: 'emergency_now', triage_tier: 'emergent' }],
    ['same-day pathway', { care_pathway: 'same_day_clinician_review', triage_tier: 'urgent' }],
    ['undetermined pathway', { care_pathway: 'undetermined' }],
    ['redirect pathway', { care_pathway: 'redirect' }],
    ['emergency override', { emergent_override: true }],
    ['insufficient-data flag', { insufficient_data: true }],
    ['insufficient tier', { triage_tier: 'insufficient_data' }],
    ['non-neurology redirect flag', { redirect_to_non_neuro: true }],
    ['partial data', { data_quality: 'partial' }],
    ['insufficient data', { data_quality: 'insufficient' }],
    ['conflicting data', { data_quality: 'conflicting' }],
    ['partial coverage', { coverage_status: 'partial' }],
    ['failed coverage', { coverage_status: 'failed' }],
    ['legacy coverage', { coverage_status: 'legacy_unknown' }],
    ['not-applicable coverage', { coverage_status: 'not_applicable' }],
    ['emergency review', { review_requirement: 'emergency_action' }],
    ['immediate review', { review_requirement: 'immediate_clinician_review' }],
    ['no review requirement', { review_requirement: 'none' }],
    ['emergency hold', { workflow_status: 'emergency_hold' }],
    ['provider clarification', { workflow_status: 'provider_clarification' }],
    ['patient clarification', { workflow_status: 'patient_clarification' }],
    ['decision ready', { workflow_status: 'decision_ready' }],
    ['already unlocked', { scheduling_locked: false }],
    ['missing lock state', { scheduling_locked: undefined }],
    ['viewer or scheduler role', { outpatient_finalization_allowed: false }],
    ['missing role authorization', { outpatient_finalization_allowed: undefined }],
    ['routine pathway with urgent tier', { triage_tier: 'urgent' }],
    [
      'expedited pathway with routine tier',
      { care_pathway: 'expedited_outpatient', triage_tier: 'routine' },
    ],
  ] satisfies Array<[string, Partial<TriageResult>]>)('rejects %s', (_label, overrides) => {
    expect(isEligibleForOutpatientFinalization(safeResult(overrides))).toBe(false)
  })
})

describe('outpatient finalization command safety', () => {
  it('builds an exact bounded command from the current disposition', () => {
    expect(
      buildOutpatientFinalizationCommand(
        safeResult(),
        '  Reviewed the complete synthetic packet.  ',
      ),
    ).toEqual({
      triageSessionId: 'triage-safe-1',
      carePathway: 'routine_outpatient',
      triageTier: 'routine',
      reviewNote: 'Reviewed the complete synthetic packet.',
    })
  })

  it('refuses an empty, oversized, or ineligible command', () => {
    expect(buildOutpatientFinalizationCommand(safeResult(), '   ')).toBeNull()
    expect(
      buildOutpatientFinalizationCommand(safeResult(), 'x'.repeat(2_001)),
    ).toBeNull()
    expect(
      buildOutpatientFinalizationCommand(
        safeResult({ care_pathway: 'emergency_now', triage_tier: 'emergent' }),
        'Reviewed.',
      ),
    ).toBeNull()
  })

  it('retains one idempotency key for exact retries and changes it with the evidence', () => {
    const first = buildOutpatientFinalizationCommand(
      safeResult(),
      'Reviewed complete packet.',
    )
    const changed = buildOutpatientFinalizationCommand(
      safeResult(),
      'Reviewed complete packet and source citations.',
    )
    expect(first).not.toBeNull()
    expect(changed).not.toBeNull()

    const cache = new Map<string, string>()
    const createKey = vi
      .fn()
      .mockReturnValueOnce('finalize:key-0001')
      .mockReturnValueOnce('finalize:key-0002')
    const firstFingerprint = outpatientFinalDispositionFingerprint(first!)
    const changedFingerprint = outpatientFinalDispositionFingerprint(changed!)

    expect(
      getOrCreateOutpatientDispositionKey(cache, firstFingerprint, createKey),
    ).toBe('finalize:key-0001')
    expect(
      getOrCreateOutpatientDispositionKey(cache, firstFingerprint, createKey),
    ).toBe('finalize:key-0001')
    expect(
      getOrCreateOutpatientDispositionKey(cache, changedFingerprint, createKey),
    ).toBe('finalize:key-0002')
    expect(createKey).toHaveBeenCalledTimes(2)
  })

  it('only accepts a success response that exactly matches the requested record and disposition', () => {
    const command = buildOutpatientFinalizationCommand(
      safeResult(),
      'Reviewed complete packet.',
    )!
    const body = {
      success: true,
      disposition: {
        triage_session_id: 'triage-safe-1',
        care_pathway: 'routine_outpatient',
        triage_tier: 'routine',
        reviewed_by: 'clinician-1',
      },
    }

    expect(parseFinalizedOutpatientDisposition(body, command)).toEqual({
      triageSessionId: 'triage-safe-1',
      carePathway: 'routine_outpatient',
      triageTier: 'routine',
      reviewedBy: 'clinician-1',
    })
    expect(
      parseFinalizedOutpatientDisposition(
        {
          ...body,
          disposition: { ...body.disposition, triage_tier: 'non_urgent' },
        },
        command,
      ),
    ).toBeNull()
    expect(
      parseFinalizedOutpatientDisposition(
        {
          ...body,
          disposition: { ...body.disposition, triage_session_id: 'other' },
        },
        command,
      ),
    ).toBeNull()
    expect(
      parseFinalizedOutpatientDisposition(
        {
          ...body,
          disposition: { ...body.disposition, reviewed_by: '' },
        },
        command,
      ),
    ).toBeNull()
  })

  it('projects a verified success into decision-ready lock-release state without mutating the result', () => {
    const result = safeResult()
    const projected = applyFinalizedOutpatientDisposition(result, {
      triageSessionId: 'triage-safe-1',
      carePathway: 'routine_outpatient',
      triageTier: 'routine',
      reviewedBy: 'clinician-1',
    })

    expect(projected).not.toBe(result)
    expect(projected).toMatchObject({
      care_pathway: 'routine_outpatient',
      triage_tier: 'routine',
      review_requirement: 'none',
      workflow_status: 'decision_ready',
      scheduling_locked: false,
    })
    expect(result).toMatchObject({
      review_requirement: 'clinician_confirmation',
      workflow_status: 'clinician_review',
      scheduling_locked: true,
    })
  })

  it('does not project a success from a different triage record', () => {
    const result = safeResult()
    expect(
      applyFinalizedOutpatientDisposition(result, {
        triageSessionId: 'other-triage',
        carePathway: 'routine_outpatient',
        triageTier: 'routine',
        reviewedBy: 'clinician-1',
      }),
    ).toBe(result)
  })

  it('does not treat a stale success as matching a changed disposition', () => {
    const result = safeResult({
      care_pathway: 'expedited_outpatient',
      triage_tier: 'urgent',
    })
    const staleDisposition = {
      triageSessionId: 'triage-safe-1',
      carePathway: 'routine_outpatient' as const,
      triageTier: 'routine' as const,
      reviewedBy: 'clinician-1',
    }

    expect(
      finalizedDispositionMatchesResult(result, staleDisposition),
    ).toBe(false)
    expect(
      applyFinalizedOutpatientDisposition(result, staleDisposition),
    ).toBe(result)
  })

  it('revokes a prior success projection when the record re-enters a safety hold', () => {
    const result = safeResult({
      review_requirement: 'emergency_action',
      workflow_status: 'emergency_hold',
      scheduling_locked: true,
    })
    const priorDisposition = {
      triageSessionId: 'triage-safe-1',
      carePathway: 'routine_outpatient' as const,
      triageTier: 'routine' as const,
      reviewedBy: 'clinician-1',
    }

    expect(
      finalizedDispositionMatchesResult(result, priorDisposition),
    ).toBe(false)
    expect(
      applyFinalizedOutpatientDisposition(result, priorDisposition),
    ).toBe(result)
  })

  it('recognizes the matching durable decision-ready state after a refresh', () => {
    expect(
      finalizedDispositionMatchesResult(
        safeResult({
          review_requirement: 'none',
          workflow_status: 'decision_ready',
          scheduling_locked: false,
        }),
        {
          triageSessionId: 'triage-safe-1',
          carePathway: 'routine_outpatient',
          triageTier: 'routine',
          reviewedBy: 'clinician-1',
        },
      ),
    ).toBe(true)
  })

  it('posts the exact disposition with the supplied retry-safe idempotency key', async () => {
    const command = buildOutpatientFinalizationCommand(
      safeResult(),
      'Reviewed complete packet.',
    )!
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        disposition: {
          triage_session_id: 'triage-safe-1',
          care_pathway: 'routine_outpatient',
          triage_tier: 'routine',
          reviewed_by: 'clinician-1',
        },
      }),
    })

    await expect(
      submitOutpatientFinalization(
        command,
        'finalize:key-0001',
        fetchMock as unknown as typeof fetch,
      ),
    ).resolves.toEqual({
      triageSessionId: 'triage-safe-1',
      carePathway: 'routine_outpatient',
      triageTier: 'routine',
      reviewedBy: 'clinician-1',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/triage/triage-safe-1/final-disposition',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'finalize:key-0001',
        },
        body: JSON.stringify({
          final_care_pathway: 'routine_outpatient',
          final_triage_tier: 'routine',
          review_note: 'Reviewed complete packet.',
        }),
      },
    )
  })

  it('fails closed on a rejected disposition and preserves the server safety reason', async () => {
    const command = buildOutpatientFinalizationCommand(
      safeResult(),
      'Reviewed complete packet.',
    )!
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        error: 'Outpatient disposition was not finalized',
        reason: 'emergency_action_open',
      }),
    })

    await expect(
      submitOutpatientFinalization(
        command,
        'finalize:key-0001',
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow(
      'Disposition was not finalized (emergency action open). Scheduling remains locked.',
    )
  })

  it('fails closed on network loss or an unverifiable success body', async () => {
    const command = buildOutpatientFinalizationCommand(
      safeResult(),
      'Reviewed complete packet.',
    )!
    const networkFailure = vi.fn().mockRejectedValue(new Error('socket lost'))
    const mismatchedSuccess = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        disposition: {
          triage_session_id: 'triage-safe-1',
          care_pathway: 'routine_outpatient',
          triage_tier: 'non_urgent',
          reviewed_by: 'clinician-1',
        },
      }),
    })

    await expect(
      submitOutpatientFinalization(
        command,
        'finalize:key-0001',
        networkFailure as unknown as typeof fetch,
      ),
    ).rejects.toThrow('Scheduling remains locked')
    await expect(
      submitOutpatientFinalization(
        command,
        'finalize:key-0001',
        mismatchedSuccess as unknown as typeof fetch,
      ),
    ).rejects.toThrow('could not be verified')
  })

  it('refuses a malformed idempotency key before sending a request', async () => {
    const command = buildOutpatientFinalizationCommand(
      safeResult(),
      'Reviewed complete packet.',
    )!
    const fetchMock = vi.fn()

    await expect(
      submitOutpatientFinalization(
        command,
        'bad',
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow('Scheduling remains locked')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
