import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  authorizeMock,
  getPoolMock,
  queryMock,
  fromMock,
  updateMock,
  eqMock,
  invokeBedrockMock,
  notifyVisitSignedMock,
  triggerFollowUpMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  fromMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn(),
  invokeBedrockMock: vi.fn(),
  notifyVisitSignedMock: vi.fn(),
  triggerFollowUpMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/bedrock', () => ({ invokeBedrock: invokeBedrockMock }))
vi.mock('@/lib/notifications', () => ({
  notifyVisitSigned: notifyVisitSignedMock,
}))
vi.mock('@/lib/follow-up/visitTrigger', () => ({
  triggerFollowUpFromVisit: triggerFollowUpMock,
}))

import { POST } from '../route'

function callPost(id = 'visit-1') {
  return POST(new NextRequest(`http://localhost/api/visits/${id}/sign`), {
    params: Promise.resolve({ id }),
  })
}

describe('visit signing clinical boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'clinician-1',
        email: 'clinician@example.test',
        tenantId: 'tenant-1',
        role: 'clinician',
      },
    })
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'visit-1',
            patient_id: 'patient-1',
            appointment_id: 'appointment-1',
            chief_complaint: ['Synthetic concern'],
            patient: {
              first_name: 'Synthetic',
              last_name: 'Patient',
              date_of_birth: '1970-01-01',
              gender: 'female',
            },
            clinical_notes: [
              {
                id: 'note-1',
                hpi: 'Synthetic HPI',
                assessment: 'Synthetic assessment',
                plan: 'Synthetic plan',
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'visit-1', status: 'completed' }] })
    invokeBedrockMock.mockResolvedValue({ text: 'Synthetic summary' })
    notifyVisitSignedMock.mockResolvedValue(null)
    triggerFollowUpMock.mockResolvedValue('session-1')

    const builder: Record<string, unknown> = {}
    updateMock.mockReturnValue(builder)
    eqMock.mockReturnValue(builder)
    builder.update = updateMock
    builder.eq = eqMock
    builder.then = (
      resolve: (value: { data: null; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: null, error: null }).then(resolve, reject)
    fromMock.mockReturnValue(builder)
  })

  it('rejects unauthenticated signing before visit or model access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await callPost()

    expect(response.status).toBe(401)
    expect(authorizeMock).toHaveBeenCalledWith({
      action: 'visit.sign',
      allowedRoles: ['clinician', 'admin'],
    })
    expect(getPoolMock).not.toHaveBeenCalled()
    expect(invokeBedrockMock).not.toHaveBeenCalled()
  })

  it('tenant-scopes the visit graph and every signing write', async () => {
    const response = await callPost()

    expect(response.status).toBe(200)
    const [initialSql, initialValues] = queryMock.mock.calls[0]
    expect(initialSql).toContain('v."tenant_id" = $2')
    expect(initialSql).toContain('p."tenant_id" = v."tenant_id"')
    expect(initialSql).toContain('cn."tenant_id" = v."tenant_id"')
    expect(initialValues).toEqual(['visit-1', 'tenant-1'])
    expect(eqMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(notifyVisitSignedMock).toHaveBeenCalledWith(
      'visit-1',
      'Synthetic Patient',
      'clinician@example.test',
      'patient-1',
      'tenant-1',
    )
    expect(triggerFollowUpMock).toHaveBeenCalledWith('visit-1', 'tenant-1')
    expect(queryMock.mock.calls[1][1]).toEqual(['visit-1', 'tenant-1'])
  })
})
