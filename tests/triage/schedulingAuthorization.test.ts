import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPoolMock, queryMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { loadSchedulingAuthorization } from '@/lib/triage/schedulingAuthorization'

describe('loadSchedulingAuthorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock.mockResolvedValue({
      rows: [
        {
          care_pathway: 'routine_outpatient',
          workflow_status: 'decision_ready',
          scheduling_locked: false,
          reviewed_at: '2026-07-10T12:00:00.000Z',
          reviewed_by: 'clinician-1',
          final_care_pathway: 'routine_outpatient',
          final_triage_tier: 'routine',
          open_critical_clarifications: 0,
          open_emergency_actions: 0,
          coverage_status: 'complete',
          data_quality: 'sufficient',
          review_requirement: 'none',
        },
      ],
    })
  })

  it('loads and evaluates a tenant-bound triage authorization', async () => {
    const result = await loadSchedulingAuthorization('triage-1', 'tenant-1')

    expect(result?.decision).toEqual({ allowed: true })
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('ts."tenant_id" = $2'),
      ['triage-1', 'tenant-1'],
    )
  })

  it('returns a missing decision without borrowing another tenant row', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })

    await expect(
      loadSchedulingAuthorization('triage-1', 'tenant-1'),
    ).resolves.toEqual({
      authorization: null,
      decision: { allowed: false, reason: 'triage_authorization_missing' },
    })
  })
})
