import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  authorizePatientMock,
  getPoolMock,
  queryMock,
  fromMock,
  intakeInsertMock,
  intakeInsertSelectMock,
  intakeInsertSingleMock,
  intakeReadSelectMock,
  intakeReadEqMock,
  intakeReadOrderMock,
  intakeReadLimitMock,
  consultUpdateMock,
  consultEqIdMock,
  consultEqTenantMock,
  createConsultMock,
  createNotificationMock,
  getConsultMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  authorizePatientMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  fromMock: vi.fn(),
  intakeInsertMock: vi.fn(),
  intakeInsertSelectMock: vi.fn(),
  intakeInsertSingleMock: vi.fn(),
  intakeReadSelectMock: vi.fn(),
  intakeReadEqMock: vi.fn(),
  intakeReadOrderMock: vi.fn(),
  intakeReadLimitMock: vi.fn(),
  consultUpdateMock: vi.fn(),
  consultEqIdMock: vi.fn(),
  consultEqTenantMock: vi.fn(),
  createConsultMock: vi.fn(),
  createNotificationMock: vi.fn(),
  getConsultMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/patientAccess/requestAuthorization', () => ({
  authorizePatientRequest: authorizePatientMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/consult/pipeline', () => ({
  createConsult: createConsultMock,
  getConsult: getConsultMock,
}))
vi.mock('@/lib/notifications', () => ({
  createNotification: createNotificationMock,
}))

import { GET, POST } from '../route'

function submitIntake(overrides: Record<string, unknown> = {}) {
  return POST(
    new Request('http://localhost/api/patient/intake', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        patient_name: 'Synthetic Patient',
        chief_complaint: 'Synthetic chronic headache.',
        patient_id: 'patient-1',
        tenant_id: 'attacker-tenant',
        ...overrides,
      }),
    }),
  )
}

describe('patient intake safety boundary', () => {
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
    authorizePatientMock.mockResolvedValue({
      ok: false,
      status: 401,
      reason: 'missing_patient_session',
    })
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock.mockResolvedValue({ rows: [{ id: 'patient-1' }] })
    intakeInsertSingleMock.mockResolvedValue({
      data: { id: 'intake-1' },
      error: null,
    })
    intakeInsertSelectMock.mockReturnValue({ single: intakeInsertSingleMock })
    intakeInsertMock.mockReturnValue({ select: intakeInsertSelectMock })
    intakeReadLimitMock.mockResolvedValue({ data: [], error: null })
    intakeReadOrderMock.mockReturnValue({ limit: intakeReadLimitMock })
    intakeReadEqMock.mockReturnValue({ order: intakeReadOrderMock })
    intakeReadSelectMock.mockReturnValue({ eq: intakeReadEqMock })
    consultEqTenantMock.mockResolvedValue({ error: null })
    consultEqIdMock.mockReturnValue({ eq: consultEqTenantMock })
    consultUpdateMock.mockReturnValue({ eq: consultEqIdMock })
    fromMock.mockImplementation((table: string) => {
      if (table === 'patient_intake_forms') {
        return { insert: intakeInsertMock, select: intakeReadSelectMock }
      }
      if (table === 'neurology_consults') return { update: consultUpdateMock }
      throw new Error(`Unexpected table: ${table}`)
    })
    createConsultMock.mockResolvedValue({ data: { id: 'consult-1' } })
    getConsultMock.mockResolvedValue({
      id: 'consult-1',
      patient_id: 'patient-1',
      tenant_id: 'tenant-1',
    })
    createNotificationMock.mockResolvedValue({ id: 'notification-1' })
  })

  it('rejects unauthenticated submissions before parsing or database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await submitIntake()

    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('rejects a supplied patient outside the authoritative tenant', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })

    const response = await submitIntake()

    expect(response.status).toBe(404)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      ['patient-1', 'tenant-1'],
    )
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('ignores body tenant and tenant-binds intake, consult, update, and notification', async () => {
    const response = await submitIntake()

    expect(response.status).toBe(201)
    expect(intakeInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        patient_id: 'patient-1',
      }),
    )
    expect(createConsultMock).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      'patient-1',
      'tenant-1',
    )
    expect(consultEqTenantMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', patientId: 'patient-1' }),
    )
  })

  it('rejects unauthenticated intake-list reads', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await GET()

    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('tenant-scopes intake-list reads', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(intakeReadEqMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
  })

  it('derives tenant and patient from a capability with only intake-submit scope', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })
    authorizePatientMock.mockResolvedValueOnce({
      ok: true,
      context: {
        tenantId: 'tenant-patient',
        patientId: 'patient-authoritative',
        scopes: ['patient:intake:submit'],
        expiresAtEpochSeconds: 2_000_000_000,
      },
    })
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'patient-authoritative' }] })

    const response = await submitIntake({
      patient_id: undefined,
      tenant_id: undefined,
    })

    expect(response.status).toBe(201)
    expect(authorizePatientMock).toHaveBeenCalledWith({
      requiredScopes: ['patient:intake:submit'],
    })
    expect(intakeInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-patient',
        patient_id: 'patient-authoritative',
      }),
    )
    expect(createConsultMock).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      'patient-authoritative',
      'tenant-patient',
    )
  })

  it('attaches intake only to the exact consult in a patient capability', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })
    authorizePatientMock.mockResolvedValueOnce({
      ok: true,
      context: {
        tenantId: 'tenant-1',
        patientId: 'patient-1',
        consultId: 'consult-1',
        scopes: ['patient:intake:submit'],
        expiresAtEpochSeconds: 2_000_000_000,
      },
    })

    const response = await submitIntake({
      patient_id: undefined,
      tenant_id: undefined,
      consult_id: undefined,
    })

    expect(response.status).toBe(201)
    expect(getConsultMock).toHaveBeenCalledWith('consult-1', 'tenant-1')
    expect(createConsultMock).not.toHaveBeenCalled()
    expect(consultEqIdMock).toHaveBeenCalledWith('id', 'consult-1')
    expect(consultEqTenantMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
  })

  it.each([
    { patient_id: 'patient-other', tenant_id: undefined },
    { patient_id: undefined, tenant_id: 'tenant-other' },
    { patient_id: undefined, tenant_id: undefined, consult_id: 'consult-other' },
  ])('rejects body binding outside authoritative patient claims: %s', async (identity) => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })
    authorizePatientMock.mockResolvedValueOnce({
      ok: true,
      context: {
        tenantId: 'tenant-1',
        patientId: 'patient-1',
        consultId: 'consult-1',
        scopes: ['patient:intake:submit'],
        expiresAtEpochSeconds: 2_000_000_000,
      },
    })

    const response = await submitIntake(identity)

    expect(response.status).toBe(403)
    expect(intakeInsertMock).not.toHaveBeenCalled()
  })

  it('rejects missing scope or revoked patient access before intake persistence', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })
    authorizePatientMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'invalid_patient_session',
    })

    const response = await submitIntake({
      patient_id: undefined,
      tenant_id: undefined,
    })

    expect(response.status).toBe(401)
    expect(intakeInsertMock).not.toHaveBeenCalled()
  })

  it('rejects a capability consult that no longer belongs to the patient', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })
    authorizePatientMock.mockResolvedValueOnce({
      ok: true,
      context: {
        tenantId: 'tenant-1',
        patientId: 'patient-1',
        consultId: 'consult-1',
        scopes: ['patient:intake:submit'],
        expiresAtEpochSeconds: 2_000_000_000,
      },
    })
    getConsultMock.mockResolvedValueOnce({
      id: 'consult-1',
      patient_id: 'patient-other',
      tenant_id: 'tenant-1',
    })

    const response = await submitIntake({
      patient_id: undefined,
      tenant_id: undefined,
    })

    expect(response.status).toBe(403)
    expect(intakeInsertMock).not.toHaveBeenCalled()
  })
})
