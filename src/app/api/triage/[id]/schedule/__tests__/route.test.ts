import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from '../route'

const { getPoolMock, queryMock, fromMock, insertMock, selectMock, singleMock, authorizeMock } =
  vi.hoisted(() => ({
    getPoolMock: vi.fn(),
    queryMock: vi.fn(),
    fromMock: vi.fn(),
    insertMock: vi.fn(),
    selectMock: vi.fn(),
    singleMock: vi.fn(),
    authorizeMock: vi.fn(),
  }))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))

const cleared = {
  id: 'triage-123',
  triage_tier: 'urgent',
  patient_id: 'patient-123',
  clinical_reasons: ['rapid progression'],
  subspecialty_recommendation: 'Neuromuscular',
  care_pathway: 'expedited_outpatient',
  data_quality: 'sufficient',
  coverage_status: 'complete',
  review_requirement: 'none',
  workflow_status: 'decision_ready',
  scheduling_locked: false,
  reviewed_at: '2026-07-10T12:00:00.000Z',
  reviewed_by: 'clinician-1',
  final_care_pathway: 'expedited_outpatient',
  final_triage_tier: 'urgent',
  open_critical_clarifications: 0,
  open_emergency_actions: 0,
}

async function callRoute() {
  return POST(new Request('http://localhost/api/triage/triage-123/schedule') as never, {
    params: Promise.resolve({ id: 'triage-123' }),
  })
}

describe('POST /api/triage/[id]/schedule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock.mockResolvedValue({ rows: [cleared] })
    singleMock.mockResolvedValue({
      data: { id: 'appointment-123', status: 'pending-review' },
      error: null,
    })
    selectMock.mockReturnValue({ single: singleMock })
    insertMock.mockReturnValue({ select: selectMock })
    fromMock.mockReturnValue({ insert: insertMock })
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'user-1',
        email: 'clinician@example.test',
        tenantId: 'tenant-1',
        role: 'clinician',
      },
    })
  })

  it('rejects an unauthorized caller before reading triage data', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await callRoute()

    expect(response.status).toBe(401)
    expect(queryMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it.each([
    [{ ...cleared, care_pathway: 'emergency_now' }, 'care_pathway_not_outpatient'],
    [{ ...cleared, care_pathway: 'undetermined' }, 'care_pathway_not_outpatient'],
    [{ ...cleared, scheduling_locked: true }, 'scheduling_locked'],
    [{ ...cleared, reviewed_at: null }, 'clinician_review_incomplete'],
    [{ ...cleared, reviewed_by: null }, 'clinician_reviewer_missing'],
    [{ ...cleared, final_care_pathway: null }, 'final_disposition_missing'],
    [{ ...cleared, coverage_status: 'partial' }, 'coverage_incomplete'],
    [{ ...cleared, data_quality: 'insufficient' }, 'data_quality_not_sufficient'],
    [{ ...cleared, review_requirement: 'immediate_clinician_review' }, 'review_not_complete'],
    [{ ...cleared, open_critical_clarifications: 1 }, 'critical_clarification_open'],
    [{ ...cleared, open_emergency_actions: 1 }, 'emergency_action_open'],
  ])('returns 409 and performs no insert when workflow policy denies: %#', async (row, reason) => {
    queryMock.mockResolvedValueOnce({ rows: [row] })

    const response = await callRoute()

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Triage session is not authorized for outpatient scheduling',
      reason,
    })
    expect(fromMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('creates a triage-linked pending-review appointment only after policy clearance', async () => {
    const response = await callRoute()

    expect(response.status).toBe(201)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        triage_session_id: 'triage-123',
        patient_id: 'patient-123',
        appointment_type: 'new-consult',
        status: 'pending-review',
        tenant_id: 'tenant-1',
      }),
    )
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('ts."tenant_id" = $2'),
      ['triage-123', 'tenant-1'],
    )
  })

  it.each(['emergent', 'critical', 'semi_urgent', 'routine'])(
    'never schedules directly from the legacy %s tier',
    async (triageTier) => {
      queryMock.mockResolvedValueOnce({
        rows: [{ ...cleared, triage_tier: triageTier }],
      })

      const response = await callRoute()

      expect(response.status).toBe(400)
      expect(fromMock).not.toHaveBeenCalled()
    },
  )
})
