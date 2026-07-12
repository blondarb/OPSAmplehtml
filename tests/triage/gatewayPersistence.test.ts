import { beforeEach, describe, expect, it, vi } from 'vitest'

import { persistEmergencyGatewayResult } from '@/lib/triage/gatewayPersistence'
import type { EmergencyGatewayResult } from '@/lib/triage/emergencyGateway'

const { getPoolMock, connectMock, queryMock, releaseMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

function result(
  overrides: Partial<EmergencyGatewayResult>,
): EmergencyGatewayResult {
  return {
    status: 'completed',
    failureCode: null,
    carePathway: 'routine_outpatient',
    reviewRequirement: 'clinician_confirmation',
    schedulingLocked: true,
    signals: [],
    lexicalHits: [],
    version: 'neurology-emergency-gateway-v1',
    ...overrides,
  }
}

describe('persistEmergencyGatewayResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ connect: connectMock })
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock })
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT workflow_status')) {
        return {
          rows: [
            {
              workflow_status: 'pending_safety_screen',
              care_pathway: 'undetermined',
              safety_shadow_result: null,
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('FROM triage_emergency_actions')) {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('INSERT INTO triage_emergency_actions')) {
        return { rows: [{ id: 'action-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })
  })

  it('persists an emergency hold and action before model scoring', async () => {
    await expect(
      persistEmergencyGatewayResult(
        'triage-1',
        'tenant-1',
        result({ carePathway: 'emergency_now', reviewRequirement: 'emergency_action' }),
        7,
      ),
    ).resolves.toBe(true)

    const sql = queryMock.mock.calls.map(([statement]) => statement).join('\n')
    expect(sql).toContain('UPDATE triage_sessions')
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE triage_sessions'),
      expect.arrayContaining(['emergency_now', 'emergency_hold']),
    )
    expect(sql).toContain('INSERT INTO triage_emergency_actions')
    expect(sql).toContain('INSERT INTO triage_workflow_events')
    expect(sql).toMatch(/processing_status = 'pending'/)
    expect(sql).toMatch(/processing_attempt_count = \$3/)
    expect(sql).toMatch(/processing_attempt_count = \$10/)
    expect(JSON.stringify(queryMock.mock.calls)).toContain('7')
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
  })

  it('persists a routine deterministic screen without opening an emergency action', async () => {
    await expect(
      persistEmergencyGatewayResult('triage-1', 'tenant-1', result({}), 1),
    ).resolves.toBe(true)

    const sql = queryMock.mock.calls.map(([statement]) => statement).join('\n')
    expect(sql).toContain('UPDATE triage_sessions')
    expect(sql).toContain('INSERT INTO triage_workflow_events')
    expect(sql).not.toContain('INSERT INTO triage_emergency_actions')
  })

  it('rolls back and reports failure if safety persistence fails', async () => {
    queryMock.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(
      persistEmergencyGatewayResult('triage-1', 'tenant-1', result({}), 1),
    ).resolves.toBe(false)
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
    expect(releaseMock).toHaveBeenCalled()
  })

  it('does not downgrade a persisted emergency floor during a routine replay', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT workflow_status')) {
        return {
          rows: [
            {
              workflow_status: 'emergency_hold',
              care_pathway: 'emergency_now',
              safety_shadow_result: { prior: 'emergency' },
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('FROM triage_emergency_actions')) {
        return { rows: [{ id: 'existing-action' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistEmergencyGatewayResult(
        'triage-1',
        'tenant-1',
        result({
          carePathway: 'routine_outpatient',
          version: 'neurology-emergency-gateway-v3',
        }),
        1,
      ),
    ).resolves.toBe(true)

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE triage_sessions'),
      expect.arrayContaining([
        'triage-1',
        'tenant-1',
        'emergency_now',
        'emergency_action',
      ]),
    )
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO triage_emergency_actions'),
      ),
    ).toBe(false)
    expect(JSON.stringify(queryMock.mock.calls)).toContain('existing-action')
  })

  it('does not downgrade a persisted same-day floor during algorithm replay', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT workflow_status')) {
        return {
          rows: [
            {
              workflow_status: 'clinician_review',
              care_pathway: 'same_day_clinician_review',
              safety_shadow_result: { prior: 'same-day' },
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
      persistEmergencyGatewayResult(
        'triage-1',
        'tenant-1',
        result({ carePathway: 'routine_outpatient' }),
        1,
      ),
    ).resolves.toBe(true)

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE triage_sessions'),
      expect.arrayContaining([
        'same_day_clinician_review',
        'immediate_clinician_review',
      ]),
    )
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO triage_emergency_actions'),
      ),
    ).toBe(false)
  })

  it('treats an existing open emergency action as an emergency floor', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT workflow_status')) {
        return {
          rows: [
            {
              workflow_status: 'clinician_review',
              care_pathway: 'routine_outpatient',
              safety_shadow_result: null,
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('FROM triage_emergency_actions')) {
        return { rows: [{ id: 'open-action' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      persistEmergencyGatewayResult('triage-1', 'tenant-1', result({}), 1),
    ).resolves.toBe(true)

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE triage_sessions'),
      expect.arrayContaining(['emergency_now', 'emergency_action']),
    )
    expect(JSON.stringify(queryMock.mock.calls)).toContain('open-action')
  })

  it('fails closed rather than replaying into a closed workflow', async () => {
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
      persistEmergencyGatewayResult('triage-1', 'tenant-1', result({}), 1),
    ).resolves.toBe(false)
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE triage_sessions'),
      ),
    ).toBe(false)
  })

  it('flattens prior safety provenance instead of recursively nesting replay snapshots', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT workflow_status')) {
        return {
          rows: [
            {
              workflow_status: 'emergency_hold',
              care_pathway: 'emergency_now',
              data_quality: 'insufficient',
              safety_shadow_result: {
                priorSafetyState: {
                  deterministicGateway: result({
                    carePathway: 'emergency_now',
                    version: 'gateway-v0',
                  }),
                },
                deterministicGateway: {
                  priorSafetyState: {
                    deterministicGateway: result({
                      carePathway: 'emergency_now',
                      version: 'gateway-v0',
                    }),
                  },
                },
                modelSafety: { carePathway: 'emergency_now' },
                fusion: { reasons: ['prior-model-emergency'] },
              },
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('FROM triage_emergency_actions')) {
        return { rows: [{ id: 'existing-action' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await persistEmergencyGatewayResult(
      'triage-1',
      'tenant-1',
      result({
        carePathway: 'routine_outpatient',
        version: 'gateway-v2',
      }),
      1,
    )

    const update = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE triage_sessions'),
    )
    const snapshot = JSON.parse(String(update?.[1]?.[8])) as Record<string, unknown>
    expect(JSON.stringify(snapshot)).not.toContain('priorSafetyState')
    expect(snapshot).toMatchObject({
      deterministicGateway: { version: 'gateway-v2' },
      modelSafety: { carePathway: 'emergency_now' },
      fusion: { reasons: ['prior-model-emergency'] },
      persistedCarePathwayFloor: 'emergency_now',
    })
  })
})
