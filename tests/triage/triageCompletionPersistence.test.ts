import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPoolMock, connectMock, queryMock, releaseMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { finalizeTriageAttempt } from '@/lib/triage/triageCompletionPersistence'

const input: Parameters<typeof finalizeTriageAttempt>[0] = {
  triageSessionId: 'triage-1',
  tenantId: 'tenant-1',
  processingAttemptCount: 3,
  proposedCarePathway: 'routine_outpatient',
  scoringTier: 'routine',
  confidence: 'high',
  dimensionScores: { symptom_acuity: { score: 1, rationale: 'Synthetic.' } },
  weightedScore: 1,
  clinicalReasons: ['Synthetic stable symptoms.'],
  redFlags: [],
  suggestedWorkup: [],
  failedTherapies: [],
  missingInformation: null,
  subspecialtyRecommendation: 'General Neurology',
  subspecialtyRationale: 'Synthetic rationale.',
  aiRawResponse: { confidence: 'high' },
  aiInputTokens: 100,
  aiOutputTokens: 50,
  explicitConsult: {
    id: 'consult-1',
    expectedPatientId: 'patient-1',
    tierDisplay: 'ROUTINE',
    summary: 'Synthetic summary.',
    chiefComplaint: 'Synthetic complaint.',
  },
}

const systemConsultInput: Parameters<typeof finalizeTriageAttempt>[0] = {
  ...input,
  explicitConsult: undefined,
  systemConsult: {
    expectedPatientId: 'patient-1',
    referralText: 'Synthetic source-bound referral text.',
    chiefComplaint: 'Synthetic complaint.',
  },
}

describe('finalizeTriageAttempt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ connect: connectMock })
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock })
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: null }
      }
      return {
        rows: [
          {
            id: 'triage-1',
            triage_tier: 'emergent',
            care_pathway: 'emergency_now',
            data_quality: 'conflicting',
            review_requirement: 'emergency_action',
            workflow_status: 'emergency_hold',
            consult_id: 'consult-1',
          },
        ],
        rowCount: 1,
      }
    })
  })

  it('atomically preserves the row and open-action floor for the exact pending attempt', async () => {
    await expect(finalizeTriageAttempt(input)).resolves.toEqual({
      ok: true,
      triageTier: 'emergent',
      carePathway: 'emergency_now',
      dataQuality: 'conflicting',
      reviewRequirement: 'emergency_action',
      workflowStatus: 'emergency_hold',
      consultId: 'consult-1',
    })

    const [sql, values] = queryMock.mock.calls.find(
      ([statement]) => String(statement).includes('WITH locked_session'),
    )!
    expect(String(sql)).toMatch(/processing_status = 'pending'/)
    expect(String(sql)).toMatch(/processing_attempt_count = \$3/)
    expect(String(sql)).toMatch(
      /\$7 IS NULL[\s\S]+session\.patient_id IS NOT DISTINCT FROM \$6/,
    )
    expect(String(sql)).toMatch(/FOR UPDATE OF session/)
    expect(String(sql)).toMatch(/triage_emergency_actions/)
    expect(String(sql)).toMatch(/action\.status <> 'closed'/)
    expect(String(sql)).toMatch(/processing_status = 'complete'/)
    expect(String(sql)).toMatch(/UPDATE neurology_consults/)
    expect(String(sql)).toMatch(/patient_id IS NOT DISTINCT FROM \$6/)
    expect(values).toEqual(
      expect.arrayContaining([
        'triage-1',
        'tenant-1',
        3,
        'routine_outpatient',
        'routine',
        'patient-1',
        'consult-1',
      ]),
    )
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
    expect(releaseMock).toHaveBeenCalledOnce()
  })

  it('fails closed when the attempt is stale or the explicit consult is ineligible', async () => {
    queryMock.mockImplementation(async (sql: string) =>
      sql === 'BEGIN' || sql === 'ROLLBACK'
        ? { rows: [], rowCount: null }
        : { rows: [], rowCount: 0 },
    )

    await expect(finalizeTriageAttempt(input)).resolves.toEqual({
      ok: false,
      reason: 'claim_or_binding_changed',
    })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
  })

  it('fails closed when the atomic statement rejects', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: null }
      }
      throw new Error('synthetic database failure')
    })

    await expect(finalizeTriageAttempt(input)).resolves.toEqual({
      ok: false,
      reason: 'persistence_failed',
    })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
  })

  it('creates and links a requested system consult inside the exact completion statement', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: null }
      }
      return {
        rows: [
          {
            id: 'triage-1',
            triage_tier: 'emergent',
            care_pathway: 'emergency_now',
            data_quality: 'conflicting',
            review_requirement: 'emergency_action',
            workflow_status: 'emergency_hold',
            consult_id: 'consult-system-canonical',
          },
        ],
        rowCount: 1,
      }
    })

    await expect(finalizeTriageAttempt(systemConsultInput)).resolves.toEqual({
      ok: true,
      triageTier: 'emergent',
      carePathway: 'emergency_now',
      dataQuality: 'conflicting',
      reviewRequirement: 'emergency_action',
      workflowStatus: 'emergency_hold',
      consultId: 'consult-system-canonical',
    })

    const [sql, values] = queryMock.mock.calls.find(
      ([statement]) => String(statement).includes('WITH locked_session'),
    )!
    expect(String(sql)).toMatch(/INSERT INTO neurology_consults/)
    expect(String(sql)).toMatch(
      /ON CONFLICT \(tenant_id, triage_session_id\)[\s\S]+DO UPDATE/,
    )
    expect(String(sql)).toMatch(
      /consult\.tenant_id = EXCLUDED\.tenant_id/,
    )
    expect(String(sql)).toMatch(
      /consult\.patient_id IS NOT DISTINCT FROM EXCLUDED\.patient_id/,
    )
    expect(String(sql)).toMatch(/SET[\s\S]+consult_id =/)
    expect(String(sql)).toMatch(/FROM patients[\s\S]+tenant_id = \$2/)
    expect(String(sql)).toMatch(
      /ARRAY\(SELECT jsonb_array_elements_text\(\$12::jsonb\)\)/,
    )
    expect(values).toEqual(
      expect.arrayContaining([
        'patient-1',
        'Synthetic source-bound referral text.',
        'Synthetic complaint.',
        true,
      ]),
    )
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
  })

  it('rolls back completion when the system consult insert fails', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: null }
      }
      throw new Error('synthetic consult insert failure')
    })

    await expect(finalizeTriageAttempt(systemConsultInput)).resolves.toEqual({
      ok: false,
      reason: 'persistence_failed',
    })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
    expect(queryMock).not.toHaveBeenCalledWith('COMMIT')
  })

  it('rolls back when a wrong-tenant or wrong-patient orphan cannot be adopted', async () => {
    queryMock.mockImplementation(async (sql: string) =>
      sql === 'BEGIN' || sql === 'ROLLBACK'
        ? { rows: [], rowCount: null }
        : { rows: [], rowCount: 0 },
    )

    await expect(finalizeTriageAttempt(systemConsultInput)).resolves.toEqual({
      ok: false,
      reason: 'claim_or_binding_changed',
    })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
    expect(queryMock).not.toHaveBeenCalledWith('COMMIT')
  })

  it('recovers the canonical consult id from an idempotent system-consult upsert', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: null }
      }
      return {
        rows: [
          {
            id: 'triage-1',
            triage_tier: 'routine',
            care_pathway: 'routine_outpatient',
            data_quality: 'sufficient',
            review_requirement: 'clinician_confirmation',
            workflow_status: 'clinician_review',
            consult_id: 'consult-preexisting-orphan',
          },
        ],
        rowCount: 1,
      }
    })

    await expect(finalizeTriageAttempt(systemConsultInput)).resolves.toMatchObject({
      ok: true,
      consultId: 'consult-preexisting-orphan',
    })
    const sql = String(
      queryMock.mock.calls.find(([statement]) =>
        String(statement).includes('WITH locked_session'),
      )?.[0],
    )
    expect(sql).toMatch(
      /ON CONFLICT \(tenant_id, triage_session_id\)[\s\S]+RETURNING consult\.id/,
    )
  })

  it('fails closed if a requested system consult has no canonical id', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: null }
      }
      return {
        rows: [
          {
            id: 'triage-1',
            triage_tier: 'routine',
            care_pathway: 'routine_outpatient',
            data_quality: 'sufficient',
            review_requirement: 'clinician_confirmation',
            workflow_status: 'clinician_review',
            consult_id: null,
          },
        ],
        rowCount: 1,
      }
    })

    await expect(finalizeTriageAttempt(systemConsultInput)).resolves.toEqual({
      ok: false,
      reason: 'persistence_failed',
    })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
    expect(queryMock).not.toHaveBeenCalledWith('COMMIT')
  })

  it('rejects ambiguous explicit and system consult requests before opening a transaction', async () => {
    await expect(
      finalizeTriageAttempt({
        ...systemConsultInput,
        explicitConsult: input.explicitConsult,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'persistence_failed',
    })
    expect(connectMock).not.toHaveBeenCalled()
  })
})
