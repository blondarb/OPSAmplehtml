import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, authorizePatientMock, invokeBedrockMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  authorizePatientMock: vi.fn(),
  invokeBedrockMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/patientAccess/requestAuthorization', () => ({
  authorizePatientRequest: authorizePatientMock,
}))
vi.mock('@/lib/bedrock', () => ({ invokeBedrock: invokeBedrockMock }))

import { POST } from '../route'

function request(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/ai/historian/patient-report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

describe('patient report safety boundary', () => {
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
    invokeBedrockMock.mockResolvedValue({ text: 'Synthetic patient recap.' })
  })

  it('rejects unauthenticated report generation before parsing or model use', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await request({ narrativeSummary: 'Synthetic summary.' })

    expect(response.status).toBe(401)
    expect(invokeBedrockMock).not.toHaveBeenCalled()
  })

  it('rejects oversized client-supplied clinical text', async () => {
    const response = await request({ narrativeSummary: 'x'.repeat(20_001) })

    expect(response.status).toBe(413)
    expect(invokeBedrockMock).not.toHaveBeenCalled()
  })

  it('allows a patient capability with only the report scope', async () => {
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
        scopes: ['patient:historian:report'],
        expiresAtEpochSeconds: 2_000_000_000,
      },
    })

    const response = await request({ narrativeSummary: 'Synthetic summary.' })

    expect(response.status).toBe(200)
    expect(authorizePatientMock).toHaveBeenCalledWith({
      requiredScopes: ['patient:historian:report'],
    })
    expect(invokeBedrockMock).toHaveBeenCalledOnce()
  })

  it('rejects missing report scope or a revoked patient session before model use', async () => {
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

    const response = await request({ narrativeSummary: 'Synthetic summary.' })

    expect(response.status).toBe(403)
    expect(invokeBedrockMock).not.toHaveBeenCalled()
  })

  it('rejects body identity that conflicts with authoritative patient claims', async () => {
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
        scopes: ['patient:historian:report'],
        expiresAtEpochSeconds: 2_000_000_000,
      },
    })

    const response = await request({
      narrativeSummary: 'Synthetic summary.',
      patient_id: 'patient-other',
      tenant_id: 'tenant-other',
    })

    expect(response.status).toBe(403)
    expect(invokeBedrockMock).not.toHaveBeenCalled()
  })
})
