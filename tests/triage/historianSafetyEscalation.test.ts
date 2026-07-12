import { beforeEach, describe, expect, it, vi } from 'vitest'

import { recordHistorianSafetyEscalation } from '@/lib/triage/historianSafetyEscalation'

const { getPoolMock, connectMock, queryMock, releaseMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

const input = {
  consultId: 'consult-1',
  tenantId: 'tenant-1',
  historianSessionId: 'historian-1',
  summary: 'Patient reported a new emergency symptom.',
  structuredOutput: {},
  redFlags: [] as Array<{ flag: string; severity: string; context: string }>,
  safetyEscalated: true,
  completionStatus: 'complete' as const,
}

describe('recordHistorianSafetyEscalation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ connect: connectMock })
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock })
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT triage_session_id')) {
        return { rows: [{ triage_session_id: 'triage-1' }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO triage_emergency_actions')) {
        return { rows: [{ id: 'action-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })
  })

  it('atomically locks triage, opens an emergency action, records the event, and holds the consult', async () => {
    await expect(recordHistorianSafetyEscalation(input)).resolves.toBe(true)

    const sql = queryMock.mock.calls.map(([statement]) => statement).join('\n')
    expect(sql).toContain('UPDATE triage_sessions')
    expect(sql).toContain("workflow_status = 'emergency_hold'")
    expect(sql).toContain('scheduling_locked = true')
    expect(sql).toContain('INSERT INTO triage_emergency_actions')
    expect(sql).toContain('INSERT INTO triage_workflow_events')
    expect(sql).toContain("status = 'triage_complete'")
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
    expect(releaseMock).toHaveBeenCalled()
  })

  it('rolls back and fails closed if the consult is not triage-bound', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT triage_session_id')) {
        return { rows: [], rowCount: 0 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(recordHistorianSafetyEscalation(input)).resolves.toBe(false)

    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
    expect(releaseMock).toHaveBeenCalled()
  })
})
