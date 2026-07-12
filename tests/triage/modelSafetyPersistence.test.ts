import { beforeEach, describe, expect, it, vi } from 'vitest'
import { persistModelSafetyFusion } from '@/lib/triage/modelSafetyPersistence'
import type { ValidatedModelSafetyExtraction } from '@/lib/triage/modelSafetyExtraction'
import type { EnsembleFusionDecision } from '@/lib/triage/ensemblePolicy'

const { getPoolMock, connectMock, queryMock, releaseMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

const safetyResult: ValidatedModelSafetyExtraction = {
  carePathway: 'emergency_now',
  dataQuality: 'sufficient',
  criticalUnknowns: [],
  signals: [],
}

const fusion: EnsembleFusionDecision = {
  carePathway: 'emergency_now',
  outpatientPriority: 'urgent',
  dataQuality: 'sufficient',
  reviewRequirement: 'emergency_action',
  schedulingLocked: true,
  adjudicationRequired: true,
  reasons: ['safety_model_emergency'],
}

const routineFusion: EnsembleFusionDecision = {
  carePathway: 'routine_outpatient',
  outpatientPriority: 'routine',
  dataQuality: 'sufficient',
  reviewRequirement: 'clinician_confirmation',
  schedulingLocked: true,
  adjudicationRequired: false,
  reasons: ['no_time_critical_signal'],
}

function persistenceInput(
  overrides: Partial<Parameters<typeof persistModelSafetyFusion>[0]> = {},
): Parameters<typeof persistModelSafetyFusion>[0] {
  return {
    triageSessionId: 'triage-1',
    tenantId: 'tenant-1',
    modelProfile: 'us.anthropic.claude-sonnet-5',
    promptVersion: 'neurology-safety-extractor-v1',
    scoringStatus: 'complete',
    scoringFailure: null,
    scoringModelProfile: 'us.anthropic.claude-sonnet-4-6',
    scoringPromptVersion: 'neurology-outpatient-scorer-v2026-07-11',
    safetyResult,
    fusion,
    processingAttemptCount: 1,
    ...overrides,
  }
}

describe('persistModelSafetyFusion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ connect: connectMock })
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock })
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT workflow_status')) {
        return {
          rows: [
            {
              workflow_status: 'clinician_review',
              care_pathway: 'routine_outpatient',
              safety_shadow_result: { deterministic: 'complete' },
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('SELECT id') && sql.includes('triage_emergency_actions')) {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('INSERT INTO triage_emergency_actions')) {
        return { rows: [{ id: 'action-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })
  })

  it('atomically raises a model emergency, opens an action, and records provenance', async () => {
    await expect(
      persistModelSafetyFusion({
        triageSessionId: 'triage-1',
        tenantId: 'tenant-1',
        modelProfile: 'us.anthropic.claude-sonnet-5',
        promptVersion: 'neurology-safety-extractor-v1',
        scoringStatus: 'complete',
        scoringFailure: null,
        scoringModelProfile: 'us.anthropic.claude-sonnet-4-6',
        scoringPromptVersion: 'neurology-outpatient-scorer-v2026-07-11',
        safetyResult,
        fusion,
        processingAttemptCount: 1,
      }),
    ).resolves.toMatchObject({
      ok: true,
      carePathway: 'emergency_now',
      reviewRequirement: 'emergency_action',
      workflowStatus: 'emergency_hold',
    })

    const sql = queryMock.mock.calls.map(([statement]) => statement).join('\n')
    expect(sql).toContain("workflow_status = 'emergency_hold'")
    expect(sql).toContain('INSERT INTO triage_emergency_actions')
    expect(sql).toContain('INSERT INTO triage_workflow_events')
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      expect.arrayContaining(['triage-1', 'tenant-1']),
    )
    expect(JSON.stringify(queryMock.mock.calls)).toContain(
      'processing_attempt_count = $3',
    )
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
    expect(JSON.stringify(queryMock.mock.calls)).toContain(
      'neurology-outpatient-scorer-v2026-07-11',
    )
    expect(JSON.stringify(queryMock.mock.calls)).toContain(
      'us.anthropic.claude-sonnet-4-6',
    )
    expect(JSON.stringify(queryMock.mock.calls)).toContain(
      'model_outpatient_scoring_completed',
    )
  })

  it('does not create a duplicate action when an open action already exists', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT workflow_status')) {
        return {
          rows: [
            {
              workflow_status: 'emergency_hold',
              care_pathway: 'emergency_now',
              safety_shadow_result: {},
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('SELECT id') && sql.includes('triage_emergency_actions')) {
        return { rows: [{ id: 'existing-action' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await persistModelSafetyFusion({
      triageSessionId: 'triage-1',
      tenantId: 'tenant-1',
      modelProfile: 'us.anthropic.claude-sonnet-5',
      promptVersion: 'neurology-safety-extractor-v1',
      scoringStatus: 'complete',
      scoringFailure: null,
      scoringModelProfile: 'us.anthropic.claude-sonnet-4-6',
      scoringPromptVersion: 'neurology-outpatient-scorer-v2026-07-11',
      safetyResult,
      fusion,
      processingAttemptCount: 1,
    })

    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO triage_emergency_actions'),
      ),
    ).toBe(false)
  })

  it('rolls back and fails closed if the tenant-bound workflow is missing', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT workflow_status')) {
        return { rows: [], rowCount: 0 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistModelSafetyFusion({
        triageSessionId: 'triage-1',
        tenantId: 'tenant-1',
        modelProfile: 'us.anthropic.claude-sonnet-5',
        promptVersion: 'neurology-safety-extractor-v1',
        scoringStatus: 'timeout',
        scoringFailure: 'deadline_exceeded',
        scoringModelProfile: 'us.anthropic.claude-sonnet-4-6',
        scoringPromptVersion: 'neurology-outpatient-scorer-v2026-07-11',
        safetyResult,
        fusion,
        processingAttemptCount: 1,
      }),
    ).resolves.toEqual({ ok: false })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
    expect(releaseMock).toHaveBeenCalled()
  })

  it('preserves a same-day floor across lower model replay and scoring failure', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT workflow_status')) {
        return {
          rows: [
            {
              workflow_status: 'clinician_review',
              care_pathway: 'same_day_clinician_review',
              data_quality: 'insufficient',
              safety_shadow_result: {
                priorSafetyState: {
                  deterministicGateway: {
                    status: 'completed',
                    carePathway: 'same_day_clinician_review',
                    version: 'gateway-v1',
                  },
                },
                modelSafety: { carePathway: 'same_day_clinician_review' },
              },
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('FROM triage_emergency_actions')) {
        return { rows: [], rowCount: 0 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistModelSafetyFusion(
        persistenceInput({
          promptVersion: 'neurology-safety-extractor-v3',
          scoringStatus: 'timeout',
          scoringFailure: 'deadline_exceeded',
          safetyResult: null,
          safetyFailure: 'model_timeout',
          fusion: routineFusion,
        }),
      ),
    ).resolves.toMatchObject({
      ok: true,
      carePathway: 'same_day_clinician_review',
      dataQuality: 'insufficient',
      reviewRequirement: 'immediate_clinician_review',
    })

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE triage_sessions'),
      expect.arrayContaining([
        'same_day_clinician_review',
        'insufficient',
        'immediate_clinician_review',
      ]),
    )
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO triage_emergency_actions'),
      ),
    ).toBe(false)
    expect(
      queryMock.mock.calls
        .map(([sql]) => String(sql))
        .join('\n'),
    ).toContain('due_at = COALESCE(due_at, now())')
    const update = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE triage_sessions'),
    )
    const snapshot = JSON.parse(String(update?.[1]?.[5])) as Record<string, unknown>
    expect(JSON.stringify(snapshot)).not.toContain('priorSafetyState')
    expect(snapshot).toMatchObject({
      deterministicGateway: { version: 'gateway-v1' },
      persistedCarePathwayFloor: 'same_day_clinician_review',
    })
  })

  it('does not auto-clear conflicting data quality with a sufficient model result', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT workflow_status')) {
        return {
          rows: [
            {
              workflow_status: 'clinician_review',
              care_pathway: 'same_day_clinician_review',
              data_quality: 'conflicting',
              safety_shadow_result: {},
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('FROM triage_emergency_actions')) {
        return { rows: [], rowCount: 0 }
      }
      return { rows: [], rowCount: 1 }
    })

    await persistModelSafetyFusion(
      persistenceInput({ fusion: routineFusion }),
    )

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE triage_sessions'),
      expect.arrayContaining(['conflicting']),
    )
  })

  it('promotes the provisional partial sentinel when the completed fusion is sufficient', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT workflow_status')) {
        return {
          rows: [
            {
              workflow_status: 'clinician_review',
              care_pathway: 'routine_outpatient',
              data_quality: 'partial',
              safety_shadow_result: { deterministicGateway: { status: 'completed' } },
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('FROM triage_emergency_actions')) {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('UPDATE triage_sessions')) {
        return {
          rows: [
            {
              care_pathway: 'routine_outpatient',
              data_quality: 'sufficient',
              review_requirement: 'clinician_confirmation',
              workflow_status: 'clinician_review',
            },
          ],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistModelSafetyFusion(
        persistenceInput({ fusion: routineFusion }),
      ),
    ).resolves.toMatchObject({
      ok: true,
      carePathway: 'routine_outpatient',
      dataQuality: 'sufficient',
    })

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE triage_sessions'),
      expect.arrayContaining(['routine_outpatient', 'sufficient']),
    )
  })

  it('preserves emergency and reuses an open action even when the row is inconsistent', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT workflow_status')) {
        return {
          rows: [
            {
              workflow_status: 'clinician_review',
              care_pathway: 'routine_outpatient',
              safety_shadow_result: {},
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('FROM triage_emergency_actions')) {
        return { rows: [{ id: 'existing-open-action' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistModelSafetyFusion(
        persistenceInput({
          safetyResult: null,
          safetyFailure: 'invalid_output',
          fusion: routineFusion,
        }),
      ),
    ).resolves.toMatchObject({
      ok: true,
      carePathway: 'emergency_now',
      reviewRequirement: 'emergency_action',
    })

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE triage_sessions'),
      expect.arrayContaining(['emergency_now', 'emergency_action']),
    )
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO triage_emergency_actions'),
      ),
    ).toBe(false)
    expect(JSON.stringify(queryMock.mock.calls)).toContain(
      'existing-open-action',
    )
  })

  it('fails closed before model replay can mutate a closed workflow', async () => {
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes('SELECT workflow_status')
        ? {
            rows: [
              {
                workflow_status: 'closed',
                care_pathway: 'emergency_now',
                safety_shadow_result: {},
              },
            ],
            rowCount: 1,
          }
        : { rows: [], rowCount: 1 },
    )

    await expect(
      persistModelSafetyFusion(
        persistenceInput({ fusion: routineFusion }),
      ),
    ).resolves.toEqual({ ok: false })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE triage_sessions'),
      ),
    ).toBe(false)
  })
})
