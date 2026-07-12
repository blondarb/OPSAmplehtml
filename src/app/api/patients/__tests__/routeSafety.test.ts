import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, fromMock, insertMock, selectMock, singleMock } = vi.hoisted(
  () => ({
    authorizeMock: vi.fn(),
    fromMock: vi.fn(),
    insertMock: vi.fn(),
    selectMock: vi.fn(),
    singleMock: vi.fn(),
  }),
)

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))

import { POST } from '../route'

function createPatient(overrides: Record<string, unknown> = {}) {
  return POST(
    new Request('http://localhost/api/patients', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Synthetic',
        lastName: 'Patient',
        dateOfBirth: '1990-01-15',
        gender: 'O',
        tenant_id: 'attacker-tenant',
        ...overrides,
      }),
    }) as never,
  )
}

describe('patients collection clinical boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'scheduler-1',
        email: 'scheduler@example.test',
        tenantId: 'tenant-1',
        role: 'scheduler',
      },
    })
    singleMock.mockResolvedValue({ data: { id: 'patient-1' }, error: null })
    selectMock.mockReturnValue({ single: singleMock })
    insertMock.mockReturnValue({ select: selectMock })
    fromMock.mockReturnValue({ insert: insertMock })
  })

  it('rejects an unauthenticated patient create before database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await createPatient()

    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('creates a patient in the membership tenant, ignoring the body tenant', async () => {
    const response = await createPatient()

    expect(response.status).toBe(201)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'scheduler-1',
        tenant_id: 'tenant-1',
      }),
    )
  })
})
