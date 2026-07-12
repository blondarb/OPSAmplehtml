import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, finalizeMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  finalizeMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/triage/outpatientFinalDisposition', () => ({
  finalizeOutpatientDisposition: finalizeMock,
}))

import { POST } from '../route'

function request(
  body: Record<string, unknown>,
  idempotencyKey = 'request-0001',
) {
  return new Request('http://localhost/api/triage/triage-1/final-disposition', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  })
}

const body = {
  final_care_pathway: 'routine_outpatient',
  final_triage_tier: 'routine',
  review_note: 'Reviewed the complete synthetic referral and confirmed disposition.',
  tenant_id: 'spoofed-tenant',
  actor_user_id: 'spoofed-user',
}

describe('outpatient final-disposition route', () => {
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
    finalizeMock.mockResolvedValue({
      ok: true,
      replayed: false,
      disposition: {
        triageSessionId: 'triage-1',
        carePathway: 'routine_outpatient',
        triageTier: 'routine',
        reviewedBy: 'clinician-1',
      },
    })
  })

  it('requires clinician/admin authorization before persistence', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: 'forbidden',
    })

    const response = await POST(request(body), {
      params: Promise.resolve({ id: 'triage-1' }),
    })

    expect(response.status).toBe(403)
    expect(finalizeMock).not.toHaveBeenCalled()
  })

  it('keeps scheduling locked until governed missing-information and recommendation snapshots exist', async () => {
    const response = await POST(request(body), {
      params: Promise.resolve({ id: 'triage-1' }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error:
        'Outpatient finalization is not available until governed recommendation and clarification records are implemented.',
      reason: 'outpatient_finalization_not_available',
      scheduling_locked: true,
    })
    expect(authorizeMock).toHaveBeenCalledWith({
      action: 'triage.finalize_outpatient',
      allowedRoles: ['clinician', 'admin'],
    })
    expect(finalizeMock).not.toHaveBeenCalled()
  })

  it('does not parse or validate caller evidence while finalization is unavailable', async () => {
    const response = await POST(request(body, ''), {
      params: Promise.resolve({ id: 'triage-1' }),
    })

    expect(response.status).toBe(409)
    expect(finalizeMock).not.toHaveBeenCalled()
  })

  it('does not pass incomplete or oversized caller evidence to persistence', async () => {
    const response = await POST(
      request({
        final_care_pathway: 'routine_outpatient',
        final_triage_tier: 'routine',
        review_note: 'x'.repeat(2_001),
      }),
      { params: Promise.resolve({ id: 'triage-1' }) },
    )

    expect(response.status).toBe(409)
    expect(finalizeMock).not.toHaveBeenCalled()
  })
})
