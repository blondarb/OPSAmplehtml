import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET, POST } from '../route'

const {
  singleMock,
  linkHistorianMock,
  recordEscalationMock,
  recordClarificationMock,
  notifyRedFlagMock,
  notifyEscalationMock,
  authorizeMock,
  authorizePatientMock,
  getConsultMock,
  fromMock,
  insertMock,
  selectMock,
  getPoolMock,
  queryMock,
} = vi.hoisted(() => ({
  singleMock: vi.fn(),
  linkHistorianMock: vi.fn(),
  recordEscalationMock: vi.fn(),
  recordClarificationMock: vi.fn(),
  notifyRedFlagMock: vi.fn(),
  notifyEscalationMock: vi.fn(),
  authorizeMock: vi.fn(),
  authorizePatientMock: vi.fn(),
  getConsultMock: vi.fn(),
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
}))

vi.mock('@/lib/db-query', () => ({
  from: fromMock,
}))
vi.mock('@/lib/consult/pipeline', () => ({
  linkHistorianToConsult: linkHistorianMock,
  getConsult: getConsultMock,
}))
vi.mock('@/lib/triage/historianSafetyEscalation', () => ({
  recordHistorianSafetyEscalation: recordEscalationMock,
}))
vi.mock('@/lib/triage/historianClarificationCompletion', () => ({
  recordReferralClarificationCompletion: recordClarificationMock,
}))
vi.mock('@/lib/notifications', () => ({
  notifyHistorianRedFlag: notifyRedFlagMock,
  notifyHistorianSafetyEscalation: notifyEscalationMock,
}))
vi.mock('@/lib/cognito/server', () => ({ getUser: vi.fn() }))
vi.mock('@/lib/tenant', () => ({ getTenantServer: vi.fn(() => 'tenant-1') }))
vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/patientAccess/requestAuthorization', () => ({
  authorizePatientRequest: authorizePatientMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

async function callRoute(overrides: Record<string, unknown> = {}) {
  return POST(
    new Request('http://localhost/api/ai/historian/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        consult_id: 'consult-1',
        session_type: 'referral_clarification',
        patient_name: 'Patient',
        structured_output: {
          clarification_answers: [
            { question_id: 'question-1', answer: 'Yesterday.' },
          ],
        },
        narrative_summary: 'Patient-reported clarification.',
        transcript: [],
        red_flags: [],
        safety_escalated: false,
        ...overrides,
      }),
    }),
  )
}

describe('Historian save safety closure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    singleMock.mockResolvedValue({
      data: { id: 'historian-1' },
      error: null,
    })
    linkHistorianMock.mockResolvedValue(true)
    recordEscalationMock.mockResolvedValue(true)
    recordClarificationMock.mockResolvedValue({ ok: true })
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'user-1',
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
    getConsultMock.mockResolvedValue({
      id: 'consult-1',
      patient_id: 'patient-1',
      tenant_id: 'tenant-1',
    })
    selectMock.mockReturnValue({ single: singleMock })
    insertMock.mockReturnValue({ select: selectMock })
    fromMock.mockReturnValue({ insert: insertMock })
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock.mockResolvedValue({ rows: [{ id: 'patient-1' }] })
  })

  it('rejects an unauthorized caller before saving any clinical data', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await callRoute()

    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
    expect(getConsultMock).not.toHaveBeenCalled()
  })

  it('rejects an unauthorized Historian list read before database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: 'forbidden',
    })

    const response = await GET(
      new Request('http://localhost/api/ai/historian/save?tenant_id=spoofed'),
    )

    expect(response.status).toBe(403)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('ignores tenant and patient identity supplied by the client', async () => {
    const response = await callRoute({
      tenant_id: 'spoofed-tenant',
      patient_id: 'spoofed-patient',
    })

    expect(response.status).toBe(200)
    expect(getConsultMock).toHaveBeenCalledWith('consult-1', 'tenant-1')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        patient_id: 'patient-1',
        session_type: 'referral_clarification',
      }),
    )
  })

  it('rejects a standalone patient binding outside the authoritative tenant', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })

    const response = await callRoute({
      consult_id: null,
      session_type: 'new_patient',
      patient_id: 'other-tenant-patient',
    })

    expect(response.status).toBe(404)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      ['other-tenant-patient', 'tenant-1'],
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('records an atomic emergency hold and notifies even with no red-flag array', async () => {
    const response = await callRoute({ safety_escalated: true })

    expect(response.status).toBe(200)
    expect(recordEscalationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        consultId: 'consult-1',
        historianSessionId: 'historian-1',
        safetyEscalated: true,
        redFlags: [],
      }),
    )
    expect(linkHistorianMock).not.toHaveBeenCalled()
    expect(notifyEscalationMock).toHaveBeenCalledWith(
      'historian-1',
      'Patient',
      [],
      'patient-1',
      'tenant-1',
    )
  })

  it('fails closed when the emergency hold cannot be persisted', async () => {
    recordEscalationMock.mockResolvedValueOnce(false)

    const response = await callRoute({ safety_escalated: true })

    expect(response.status).toBe(503)
    expect(notifyEscalationMock).not.toHaveBeenCalled()
  })

  it('returns non-emergency clarification answers to clinician reconciliation', async () => {
    const response = await callRoute()

    expect(response.status).toBe(200)
    expect(recordEscalationMock).not.toHaveBeenCalled()
    expect(recordClarificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        consultId: 'consult-1',
        answers: [{ questionId: 'question-1', answer: 'Yesterday.' }],
      }),
    )
    expect(linkHistorianMock).not.toHaveBeenCalled()
  })

  it('derives tenant and patient from a patient capability for a standalone save', async () => {
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
        scopes: ['patient:historian:save'],
        expiresAtEpochSeconds: 2_000_000_000,
      },
    })

    const response = await callRoute({
      consult_id: null,
      session_type: 'new_patient',
      patient_id: null,
      tenant_id: 'attacker-tenant',
    })

    expect(response.status).toBe(200)
    expect(authorizePatientMock).toHaveBeenCalledWith({
      requiredScopes: ['patient:historian:save'],
    })
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-patient',
        patient_id: 'patient-authoritative',
        session_type: 'new_patient',
      }),
    )
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('requires clarification scope and exact consult/patient ownership for a patient answer', async () => {
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
        scopes: ['patient:clarification:answer'],
        expiresAtEpochSeconds: 2_000_000_000,
      },
    })

    const response = await callRoute()

    expect(response.status).toBe(200)
    expect(authorizePatientMock).toHaveBeenCalledWith({
      requiredScopes: ['patient:clarification:answer'],
      expectedConsultId: 'consult-1',
    })
    expect(getConsultMock).toHaveBeenCalledWith('consult-1', 'tenant-1')
    expect(recordClarificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        consultId: 'consult-1',
        tenantId: 'tenant-1',
      }),
    )
  })

  it('does not let generic historian-save scope submit referral clarification', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })
    authorizePatientMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: 'scope_denied',
    })

    const response = await callRoute()

    expect(response.status).toBe(403)
    expect(getConsultMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('rejects a patient body binding that conflicts with capability claims', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })
    authorizePatientMock.mockResolvedValueOnce({
      ok: true,
      context: {
        tenantId: 'tenant-1',
        patientId: 'patient-authoritative',
        scopes: ['patient:historian:save'],
        expiresAtEpochSeconds: 2_000_000_000,
      },
    })

    const response = await callRoute({
      consult_id: null,
      session_type: 'new_patient',
      patient_id: 'patient-other',
    })

    expect(response.status).toBe(403)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('rejects a revoked patient save session before clinical persistence', async () => {
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

    const response = await callRoute({
      consult_id: null,
      session_type: 'new_patient',
    })

    expect(response.status).toBe(401)
    expect(insertMock).not.toHaveBeenCalled()
  })
})
