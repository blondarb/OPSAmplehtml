import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeClinicalAccessMock,
  createHistorianInvitationMock,
  redeemHistorianInvitationMock,
} = vi.hoisted(() => ({
  authorizeClinicalAccessMock: vi.fn(),
  createHistorianInvitationMock: vi.fn(),
  redeemHistorianInvitationMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeClinicalAccessMock,
  clinicalAccessDeniedMessage: () => 'Access denied.',
}))
vi.mock('@/lib/historian/invitationStore', () => ({
  createHistorianInvitation: createHistorianInvitationMock,
  redeemHistorianInvitation: redeemHistorianInvitationMock,
}))
vi.mock('@/lib/api/publicRouteGuard', () => ({
  allowedAppOrigins: () => ['https://neuroplans.example'],
  checkPublicRouteAbuse: () => ({ ok: true }),
}))
vi.mock('@/lib/db', () => ({ getPool: vi.fn() }))

import { POST as createInvitation } from '@/app/api/ai/historian/invites/route'
import { POST as redeemInvitation } from '@/app/api/ai/historian/invites/redeem/route'

describe('historian invitation routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires an active clinician/admin membership to create a patient link', async () => {
    authorizeClinicalAccessMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: 'forbidden',
    })
    const response = await createInvitation(new Request('https://neuroplans.example/api/ai/historian/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consultId: 'consult-1' }),
    }))
    expect(response.status).toBe(403)
    expect(createHistorianInvitationMock).not.toHaveBeenCalled()
  })

  it('returns a fragment-token URL so the bearer is absent from HTTP request and referrer data', async () => {
    authorizeClinicalAccessMock.mockResolvedValueOnce({
      ok: true,
      context: { userId: 'clinician-1', email: 'c@example.test', tenantId: 'tenant-a', role: 'clinician' },
    })
    createHistorianInvitationMock.mockResolvedValueOnce({
      ok: true,
      inviteId: 'invite-1',
      sessionId: 'session-1',
      rawToken: 'one-time-secret',
      expiresAt: '2026-08-22T18:00:00.000Z',
      patientName: 'Synthetic Patient',
      referralReason: 'Gait concern',
    })
    const response = await createInvitation(new Request('https://neuroplans.example/api/ai/historian/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consultId: 'consult-1' }),
    }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.invitation.url).toBe(
      'https://neuroplans.example/patient/historian/invite#token=one-time-secret',
    )
    expect(body.invitation.url).not.toContain('?token=')
    expect(createHistorianInvitationMock).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      consultId: 'consult-1',
      invitedByUserId: 'clinician-1',
    })
  })

  it('redeems once into an HttpOnly Secure SameSite=Strict four-hour grant', async () => {
    redeemHistorianInvitationMock.mockResolvedValueOnce({
      ok: true,
      grantToken: 'browser-grant',
      grantExpiresAt: '2026-08-20T22:00:00.000Z',
      context: {
        patientName: 'Synthetic Patient',
        referralReason: 'Gait concern',
        sessionType: 'new_patient',
        interviewMode: 'comprehensive',
        interviewPromptVersion: 'comprehensive-v1',
      },
    })
    const response = await redeemInvitation(new Request(
      'https://neuroplans.example/api/ai/historian/invites/redeem',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'one-time-secret', dateOfBirth: '1960-04-12' }),
      },
    ))
    expect(response.status).toBe(200)
    const cookie = response.headers.get('set-cookie') || ''
    expect(cookie).toContain('historian_patient_grant=browser-grant')
    expect(cookie.toLowerCase()).toContain('httponly')
    expect(cookie.toLowerCase()).toContain('secure')
    expect(cookie.toLowerCase()).toContain('samesite=strict')
    expect(cookie.toLowerCase()).toContain('max-age=14400')
    expect(redeemHistorianInvitationMock).toHaveBeenCalledWith('one-time-secret', '1960-04-12')
  })

  it('passes an explicit clinician replacement request to the transactional store', async () => {
    authorizeClinicalAccessMock.mockResolvedValueOnce({
      ok: true,
      context: { userId: 'clinician-1', email: 'c@example.test', tenantId: 'tenant-a', role: 'clinician' },
    })
    createHistorianInvitationMock.mockResolvedValueOnce({ ok: false, reason: 'interview_in_progress' })
    const response = await createInvitation(new Request('https://neuroplans.example/api/ai/historian/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consultId: 'consult-1', replaceActive: true }),
    }))
    expect(response.status).toBe(409)
    expect(createHistorianInvitationMock).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      consultId: 'consult-1',
      invitedByUserId: 'clinician-1',
      replaceActive: true,
    })
  })
})
