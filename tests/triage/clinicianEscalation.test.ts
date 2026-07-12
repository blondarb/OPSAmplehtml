import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPoolMock, connectMock, queryMock, releaseMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { recordClinicianTierEscalation } from '@/lib/triage/clinicianEscalation'

const input = {
  triageSessionId: 'triage-1',
  tenantId: 'tenant-1',
  actorUserId: 'clinician-1',
  actorRole: 'clinician' as const,
  newTier: 'emergent',
  reason: 'New acute deficit identified during review',
}

describe('recordClinicianTierEscalation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ connect: connectMock })
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock })
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT triage_tier')) {
        return {
          rows: [
            {
              triage_tier: 'routine',
              physician_override_tier: null,
              care_pathway: 'routine_outpatient',
              workflow_status: 'clinician_review',
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_sessions')) {
        return { rows: [], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO triage_emergency_actions')) {
        return { rows: [{ id: 'action-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })
  })

  it('atomically escalates to an emergency hold and opens an action', async () => {
    await expect(recordClinicianTierEscalation(input)).resolves.toEqual({
      ok: true,
    })

    expect(queryMock).toHaveBeenCalledWith('BEGIN')
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO triage_emergency_actions'),
      ),
    ).toBe(true)
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO triage_workflow_events'),
      ),
    ).toBe(true)
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
    expect(releaseMock).toHaveBeenCalledOnce()
  })

  it('does not permit the override API to downgrade or reaffirm a tier', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT triage_tier')) {
        return {
          rows: [
            {
              triage_tier: 'urgent',
              physician_override_tier: null,
              care_pathway: 'expedited_outpatient',
              workflow_status: 'clinician_review',
            },
          ],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 1 }
    })

    const result = await recordClinicianTierEscalation({
      ...input,
      newTier: 'routine',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'downgrade_requires_closed_loop_review',
    })
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE triage_sessions'),
      ),
    ).toBe(false)
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
  })

  it('allows insufficient data to escalate to emergency without clearing missingness', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT triage_tier')) {
        return {
          rows: [
            {
              triage_tier: 'insufficient_data',
              physician_override_tier: null,
              care_pathway: 'undetermined',
              workflow_status: 'clinician_review',
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_sessions')) {
        return { rows: [], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO triage_emergency_actions')) {
        return { rows: [{ id: 'action-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(recordClinicianTierEscalation(input)).resolves.toEqual({
      ok: true,
    })
  })
})
