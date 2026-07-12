import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPoolMock, queryMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { loadEmergencyActions } from '@/lib/triage/emergencyActionRead'

describe('loadEmergencyActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'triage-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'action-1',
            status: 'open',
            owner_user_id: null,
            owner_team: 'neurology_triage',
            due_at: new Date('2026-07-11T12:00:00Z'),
            next_escalation_at: new Date('2026-07-11T12:05:00Z'),
            contact_attempted_at: null,
            contact_channel: null,
            delivery_status: 'unknown',
            understanding_status: 'unknown',
            outcome: null,
            closure_code: null,
            closed_at: null,
            reviewed_by: null,
            reviewed_at: null,
          },
        ],
      })
  })

  it('checks the authoritative tenant before reading action details', async () => {
    const result = await loadEmergencyActions('triage-1', 'tenant-1')

    expect(result).toMatchObject({
      ok: true,
      actions: [
        {
          id: 'action-1',
          status: 'open',
          dueAt: '2026-07-11T12:00:00.000Z',
        },
      ],
    })
    expect(queryMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('tenant_id = $2'),
      ['triage-1', 'tenant-1'],
    )
    expect(String(queryMock.mock.calls[1][0])).toContain('session.tenant_id = $2')
    expect(queryMock.mock.calls[1][1]).toEqual(['triage-1', 'tenant-1'])
  })

  it('does not reveal action existence outside the tenant', async () => {
    queryMock.mockReset()
    queryMock.mockResolvedValueOnce({ rows: [] })

    await expect(
      loadEmergencyActions('triage-other', 'tenant-1'),
    ).resolves.toEqual({ ok: false, reason: 'triage_session_not_found' })
    expect(queryMock).toHaveBeenCalledOnce()
  })

  it('returns a sanitized fail-closed result on database failure', async () => {
    queryMock.mockReset()
    queryMock.mockRejectedValueOnce(new Error('secret database detail'))

    await expect(
      loadEmergencyActions('triage-1', 'tenant-1'),
    ).resolves.toEqual({ ok: false, reason: 'persistence_failed' })
  })
})
