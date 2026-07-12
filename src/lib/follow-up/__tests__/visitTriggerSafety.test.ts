import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getPoolMock,
  queryMock,
  fromMock,
  insertMock,
  selectMock,
  singleMock,
} = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))

import { triggerFollowUpFromVisit } from '../visitTrigger'

const completedVisit = {
  visit_id: 'visit-1',
  patient_id: 'patient-1',
  visit_date: '2026-07-11',
  visit_status: 'completed',
  chief_complaint: ['Synthetic concern'],
  first_name: 'Synthetic',
  last_name: 'Patient',
  date_of_birth: '1970-01-01',
  gender: 'female',
  assessment: 'Synthetic assessment',
  plan: 'Synthetic plan',
  ai_summary: 'Synthetic summary',
  medications: [],
}

describe('direct visit follow-up trigger safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock.mockResolvedValue({ rows: [completedVisit] })
    singleMock.mockResolvedValue({ data: { id: 'session-1' }, error: null })
    selectMock.mockReturnValue({ single: singleMock })
    insertMock.mockReturnValue({ select: selectMock })
    fromMock.mockReturnValue({ insert: insertMock })
  })

  it('uses a required caller tenant for the visit graph and inserted session', async () => {
    const result = await triggerFollowUpFromVisit('visit-1', 'tenant-1')

    expect(result).toBe('session-1')
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('v."tenant_id" = $2'),
      ['visit-1', 'tenant-1'],
    )
    expect(queryMock.mock.calls[0][0]).toContain('p."tenant_id" = v."tenant_id"')
    expect(queryMock.mock.calls[0][0]).toContain('cn."tenant_id" = v."tenant_id"')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        patient_id: 'patient-1',
        visit_id: 'visit-1',
      }),
    )
  })

  it('does not create follow-up state for a visit that is not completed', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ ...completedVisit, visit_status: 'in_progress' }],
    })

    const result = await triggerFollowUpFromVisit('visit-1', 'tenant-1')

    expect(result).toBeNull()
    expect(fromMock).not.toHaveBeenCalled()
  })
})
