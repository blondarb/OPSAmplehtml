import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createIngressSafetyWorkflow } from '@/lib/triage/ingressSafetyWorkflow'
import type { PersistableEmergencyGatewayResult } from '@/lib/triage/gatewayPersistence'

const { getPoolMock, connectMock, queryMock, releaseMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

function gateway(
  carePathway: PersistableEmergencyGatewayResult['carePathway'],
): PersistableEmergencyGatewayResult {
  return {
    status: 'completed',
    failureCode: null,
    carePathway,
    reviewRequirement:
      carePathway === 'emergency_now'
        ? 'emergency_action'
        : 'immediate_clinician_review',
    schedulingLocked: true,
    signals: [],
    lexicalHits: [],
    version: 'neurology-long-packet-emergency-map-reduce-v1',
  }
}

describe('createIngressSafetyWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ connect: connectMock })
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock })
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return {
          rows: [
            {
              id: 'extraction-1',
              text_input: 'Synthetic source text',
              source_filename: 'packet.pdf',
              patient_age: 65,
              patient_sex: 'Female',
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('FROM triage_sessions') && sql.includes('source_extraction_id')) {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('INSERT INTO triage_sessions')) {
        return { rows: [{ id: 'triage-ingress-1' }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO triage_emergency_actions')) {
        return { rows: [{ id: 'action-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })
  })

  it('atomically creates an emergency hold, action, and provenance event', async () => {
    await expect(
      createIngressSafetyWorkflow({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        sourceType: 'pdf',
        gateway: gateway('emergency_now'),
        modelProfile: 'neurology-long-packet-model-pipeline-v1',
      }),
    ).resolves.toEqual({ ok: true, triageSessionId: 'triage-ingress-1' })

    const sql = queryMock.mock.calls.map(([statement]) => String(statement)).join('\n')
    expect(sql).toContain('INSERT INTO triage_sessions')
    expect(sql).toContain("'emergency_hold'")
    expect(sql).toContain('INSERT INTO triage_emergency_actions')
    expect(sql).toContain('INSERT INTO triage_workflow_events')
    const insert = queryMock.mock.calls.find(([statement]) =>
      String(statement).includes('INSERT INTO triage_sessions'),
    )
    expect(insert?.[1]?.[9]).toBe('complete')
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
  })

  it('reuses the existing tenant-bound ingress workflow idempotently', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM triage_sessions') && sql.includes('source_extraction_id')) {
        return {
          rows: [
            {
              id: 'existing-triage',
              workflow_status: 'emergency_hold',
              care_pathway: 'emergency_now',
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
      createIngressSafetyWorkflow({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        sourceType: 'pdf',
        gateway: gateway('emergency_now'),
        modelProfile: 'test-model',
      }),
    ).resolves.toEqual({ ok: true, triageSessionId: 'existing-triage' })

    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO triage_emergency_actions'),
      ),
    ).toBe(false)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('FROM triage_emergency_actions'),
      ['existing-triage'],
    )
  })

  it('creates a same-day review hold without manufacturing an emergency action', async () => {
    await createIngressSafetyWorkflow({
      extractionId: 'extraction-1',
      tenantId: 'tenant-1',
      sourceType: 'pdf',
      gateway: gateway('same_day_clinician_review'),
      modelProfile: 'test-model',
    })

    const sql = queryMock.mock.calls.map(([statement]) => String(statement)).join('\n')
    expect(sql).toContain("'clinician_review'")
    expect(sql).not.toContain('INSERT INTO triage_emergency_actions')
  })

  it('persists explicitly failed source coverage for an incomplete mixed-PDF hold', async () => {
    await createIngressSafetyWorkflow({
      extractionId: 'extraction-1',
      tenantId: 'tenant-1',
      sourceType: 'pdf',
      gateway: gateway('emergency_now'),
      modelProfile: 'test-model',
      coverageStatus: 'failed',
    })

    const insert = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO triage_sessions'),
    )
    expect(insert).toBeDefined()
    expect(String(insert?.[0])).not.toContain("'complete', $10")
    expect(insert?.[1]?.[9]).toBe('failed')
  })

  it('fails closed when the tenant-bound extraction does not exist', async () => {
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes('FROM triage_extractions')
        ? { rows: [], rowCount: 0 }
        : { rows: [], rowCount: 1 },
    )

    await expect(
      createIngressSafetyWorkflow({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        sourceType: 'pdf',
        gateway: gateway('emergency_now'),
        modelProfile: 'test-model',
      }),
    ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
    expect(releaseMock).toHaveBeenCalled()
  })

  it('raises an existing same-day workflow to emergency and creates its action atomically', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM triage_sessions') && sql.includes('source_extraction_id')) {
        return {
          rows: [
            {
              id: 'existing-triage',
              workflow_status: 'clinician_review',
              care_pathway: 'same_day_clinician_review',
              safety_shadow_result: {
                priorSafetyState: {
                  deterministicGateway: gateway(
                    'same_day_clinician_review',
                  ),
                },
                modelSafety: { carePathway: 'same_day_clinician_review' },
                fusion: { reasons: ['prior-ingress-floor'] },
              },
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('FROM triage_emergency_actions')) {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('INSERT INTO triage_emergency_actions')) {
        return { rows: [{ id: 'new-action' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      createIngressSafetyWorkflow({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        sourceType: 'pdf',
        gateway: gateway('emergency_now'),
        modelProfile: 'test-model',
      }),
    ).resolves.toEqual({ ok: true, triageSessionId: 'existing-triage' })

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE triage_sessions'),
      expect.arrayContaining([
        'existing-triage',
        'tenant-1',
        'emergency_now',
        'emergency_action',
      ]),
    )
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO triage_emergency_actions'),
      ),
    ).toBe(true)
    const update = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE triage_sessions'),
    )
    const snapshot = JSON.parse(String(update?.[1]?.[7])) as Record<string, unknown>
    expect(JSON.stringify(snapshot)).not.toContain('priorSafetyState')
    expect(snapshot).toMatchObject({
      deterministicGateway: { carePathway: 'emergency_now' },
      modelSafety: { carePathway: 'same_day_clinician_review' },
      fusion: { reasons: ['prior-ingress-floor'] },
      persistedCarePathwayFloor: 'emergency_now',
    })
  })

  it('does not lower an existing emergency workflow when ingress replays same-day', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM triage_sessions') && sql.includes('source_extraction_id')) {
        return {
          rows: [
            {
              id: 'existing-triage',
              workflow_status: 'emergency_hold',
              care_pathway: 'emergency_now',
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
      createIngressSafetyWorkflow({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        sourceType: 'pdf',
        gateway: gateway('same_day_clinician_review'),
        modelProfile: 'test-model',
      }),
    ).resolves.toEqual({ ok: true, triageSessionId: 'existing-triage' })

    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE triage_sessions'),
      ),
    ).toBe(false)
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO triage_emergency_actions'),
      ),
    ).toBe(false)
  })

  it('repairs a lower row upward when an open emergency action already exists', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM triage_sessions') && sql.includes('source_extraction_id')) {
        return {
          rows: [
            {
              id: 'existing-triage',
              workflow_status: 'clinician_review',
              care_pathway: 'routine_outpatient',
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
      createIngressSafetyWorkflow({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        sourceType: 'pdf',
        gateway: gateway('same_day_clinician_review'),
        modelProfile: 'test-model',
      }),
    ).resolves.toEqual({ ok: true, triageSessionId: 'existing-triage' })

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE triage_sessions'),
      expect.arrayContaining(['emergency_now', 'emergency_action']),
    )
    expect(JSON.stringify(queryMock.mock.calls)).toContain('existing-action')
  })

  it('fails closed instead of silently reusing a closed ingress workflow', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM triage_sessions') && sql.includes('source_extraction_id')) {
        return {
          rows: [
            {
              id: 'existing-triage',
              workflow_status: 'closed',
              care_pathway: 'emergency_now',
            },
          ],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      createIngressSafetyWorkflow({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        sourceType: 'pdf',
        gateway: gateway('emergency_now'),
        modelProfile: 'test-model',
      }),
    ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
  })
})
