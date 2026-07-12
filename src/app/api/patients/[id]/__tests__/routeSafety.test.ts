import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  getPoolMock,
  queryMock,
  fromMock,
  patientSelectMock,
  patientEqIdMock,
  patientEqTenantMock,
  patientSingleMock,
  medicationSelectMock,
  medicationEqPatientMock,
  medicationEqTenantMock,
  medicationEqActiveMock,
  medicationOrderMock,
  allergySelectMock,
  allergyEqPatientMock,
  allergyEqTenantMock,
  allergyEqActiveMock,
  allergyOrderMock,
  boundedSelectMock,
  boundedEqPatientMock,
  boundedEqTenantMock,
  boundedOrderMock,
  boundedLimitMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  fromMock: vi.fn(),
  patientSelectMock: vi.fn(),
  patientEqIdMock: vi.fn(),
  patientEqTenantMock: vi.fn(),
  patientSingleMock: vi.fn(),
  medicationSelectMock: vi.fn(),
  medicationEqPatientMock: vi.fn(),
  medicationEqTenantMock: vi.fn(),
  medicationEqActiveMock: vi.fn(),
  medicationOrderMock: vi.fn(),
  allergySelectMock: vi.fn(),
  allergyEqPatientMock: vi.fn(),
  allergyEqTenantMock: vi.fn(),
  allergyEqActiveMock: vi.fn(),
  allergyOrderMock: vi.fn(),
  boundedSelectMock: vi.fn(),
  boundedEqPatientMock: vi.fn(),
  boundedEqTenantMock: vi.fn(),
  boundedOrderMock: vi.fn(),
  boundedLimitMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))

import { GET } from '../route'

function getPatient(id = 'patient-1') {
  return GET(new Request(`http://localhost/api/patients/${id}`) as never, {
    params: Promise.resolve({ id }),
  })
}

describe('patient chart clinical boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'viewer-1',
        email: 'viewer@example.test',
        tenantId: 'tenant-1',
        role: 'viewer',
      },
    })
    patientSingleMock.mockResolvedValue({
      data: {
        id: 'patient-1',
        first_name: 'Synthetic',
        last_name: 'Patient',
        date_of_birth: '1990-01-15',
      },
      error: null,
    })
    patientEqTenantMock.mockReturnValue({ single: patientSingleMock })
    patientEqIdMock.mockReturnValue({ eq: patientEqTenantMock })
    patientSelectMock.mockReturnValue({ eq: patientEqIdMock })

    medicationOrderMock.mockResolvedValue({ data: [], error: null })
    medicationEqActiveMock.mockReturnValue({ order: medicationOrderMock })
    medicationEqTenantMock.mockReturnValue({ eq: medicationEqActiveMock })
    medicationEqPatientMock.mockReturnValue({ eq: medicationEqTenantMock })
    medicationSelectMock.mockReturnValue({ eq: medicationEqPatientMock })

    allergyOrderMock.mockResolvedValue({ data: [], error: null })
    allergyEqActiveMock.mockReturnValue({ order: allergyOrderMock })
    allergyEqTenantMock.mockReturnValue({ eq: allergyEqActiveMock })
    allergyEqPatientMock.mockReturnValue({ eq: allergyEqTenantMock })
    allergySelectMock.mockReturnValue({ eq: allergyEqPatientMock })

    boundedLimitMock.mockResolvedValue({ data: [], error: null })
    boundedOrderMock.mockReturnValue({ limit: boundedLimitMock })
    boundedEqTenantMock.mockReturnValue({ order: boundedOrderMock })
    boundedEqPatientMock.mockReturnValue({ eq: boundedEqTenantMock })
    boundedSelectMock.mockReturnValue({ eq: boundedEqPatientMock })

    fromMock.mockImplementation((table: string) => {
      if (table === 'patients') return { select: patientSelectMock }
      if (table === 'patient_medications') return { select: medicationSelectMock }
      if (table === 'patient_allergies') return { select: allergySelectMock }
      return { select: boundedSelectMock }
    })
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock.mockResolvedValue({ rows: [] })
  })

  it('rejects an unauthenticated chart read before database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await getPatient()

    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('does not resolve a patient outside the membership tenant', async () => {
    patientSingleMock.mockResolvedValueOnce({ data: null, error: null })

    const response = await getPatient('patient-2')

    expect(response.status).toBe(404)
    expect(patientEqTenantMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('tenant-scopes the chart and every child collection', async () => {
    const response = await getPatient()

    expect(response.status).toBe(200)
    expect(patientEqTenantMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(medicationEqTenantMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(allergyEqTenantMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(boundedEqTenantMock).toHaveBeenCalledTimes(3)
    expect(boundedEqTenantMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('v."tenant_id" = $2'),
      ['patient-1', 'tenant-1'],
    )
  })
})
