import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeClinicalMock, authorizePatientMock } = vi.hoisted(() => ({
  authorizeClinicalMock: vi.fn(),
  authorizePatientMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeClinicalMock,
}))
vi.mock('@/lib/patientAccess/requestAuthorization', () => ({
  authorizePatientRequest: authorizePatientMock,
}))

import { authorizeClinicalOrPatientAccess } from '../routeAuthorization'

const request = {
  clinicalAction: 'historian.start' as const,
  clinicalRoles: ['clinician', 'admin'] as const,
  patientScopes: ['patient:historian:start'] as const,
}

describe('clinical or patient route authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeClinicalMock.mockResolvedValue({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })
    authorizePatientMock.mockResolvedValue({
      ok: false,
      status: 401,
      reason: 'missing_patient_session',
    })
  })

  it('preserves the existing clinical path without consulting patient cookies', async () => {
    authorizeClinicalMock.mockResolvedValueOnce({
      ok: true,
      context: {
        userId: 'clinician-1',
        email: 'clinician@example.test',
        tenantId: 'tenant-1',
        role: 'clinician',
      },
    })

    await expect(authorizeClinicalOrPatientAccess(request)).resolves.toEqual({
      ok: true,
      principal: 'clinical',
      context: {
        userId: 'clinician-1',
        email: 'clinician@example.test',
        tenantId: 'tenant-1',
        role: 'clinician',
      },
    })
    expect(authorizePatientMock).not.toHaveBeenCalled()
  })

  it('accepts a lifecycle-validated patient session with only the requested scope', async () => {
    authorizePatientMock.mockResolvedValueOnce({
      ok: true,
      context: {
        tenantId: 'tenant-2',
        patientId: 'patient-2',
        consultId: 'consult-2',
        scopes: ['patient:historian:start'],
        expiresAtEpochSeconds: 2_000_000_000,
      },
    })

    await expect(authorizeClinicalOrPatientAccess(request)).resolves.toEqual({
      ok: true,
      principal: 'patient',
      context: {
        tenantId: 'tenant-2',
        patientId: 'patient-2',
        consultId: 'consult-2',
        scopes: ['patient:historian:start'],
        expiresAtEpochSeconds: 2_000_000_000,
      },
    })
    expect(authorizePatientMock).toHaveBeenCalledWith({
      requiredScopes: ['patient:historian:start'],
    })
  })

  it('preserves a clinical denial when there is no patient cookie', async () => {
    authorizeClinicalMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: 'forbidden',
    })

    await expect(authorizeClinicalOrPatientAccess(request)).resolves.toEqual({
      ok: false,
      status: 403,
      reason: 'forbidden',
    })
  })

  it('returns a present-but-invalid patient session denial without token details', async () => {
    authorizePatientMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: 'scope_denied',
    })

    const result = await authorizeClinicalOrPatientAccess(request)

    expect(result).toEqual({
      ok: false,
      status: 403,
      reason: 'scope_denied',
    })
    expect(JSON.stringify(result)).not.toContain('token')
  })
})
