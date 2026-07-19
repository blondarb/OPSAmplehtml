import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  claimMock,
  contactMock,
  closeMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  claimMock: vi.fn(),
  contactMock: vi.fn(),
  closeMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
  clinicalAccessDeniedMessage: () => 'Access denied',
}))
vi.mock('@/lib/triage/emergencyActionLifecycle', () => ({
  claimEmergencyAction: claimMock,
  recordEmergencyContactAttempt: contactMock,
  closeEmergencyAction: closeMock,
}))

import { POST as claimPost } from '../claim/route'
import { POST as closePost } from '../close/route'
import { POST as contactPost } from '../contact/route'

const context = {
  params: Promise.resolve({ id: 'triage-1', actionId: 'action-1' }),
}

function request(
  path: string,
  body?: Record<string, unknown>,
  idempotencyKey = 'request-0001',
) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

describe('emergency action lifecycle routes', () => {
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
    claimMock.mockResolvedValue({
      ok: true,
      replayed: false,
      action: { id: 'action-1', status: 'open', ownerUserId: 'clinician-1' },
    })
    contactMock.mockResolvedValue({
      ok: true,
      replayed: false,
      action: {
        id: 'action-1',
        status: 'attempting_contact',
        ownerUserId: 'clinician-1',
      },
    })
    closeMock.mockResolvedValue({
      ok: true,
      replayed: false,
      action: { id: 'action-1', status: 'closed', ownerUserId: 'clinician-1' },
    })
  })

  it('rejects unauthenticated claims before lifecycle persistence', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await claimPost(
      request('/api/triage/triage-1/emergency-actions/action-1/claim'),
      context,
    )

    expect(response.status).toBe(401)
    expect(claimMock).not.toHaveBeenCalled()
  })

  it('uses authoritative actor and tenant identity when claiming', async () => {
    const response = await claimPost(
      request('/api/triage/triage-1/emergency-actions/action-1/claim'),
      context,
    )

    expect(response.status).toBe(200)
    expect(authorizeMock).toHaveBeenCalledWith({
      action: 'triage.emergency_action',
      allowedRoles: ['clinician', 'admin'],
    })
    expect(claimMock).toHaveBeenCalledWith({
      triageSessionId: 'triage-1',
      actionId: 'action-1',
      tenantId: 'tenant-1',
      actorUserId: 'clinician-1',
      actorRole: 'clinician',
      idempotencyKey: 'request-0001',
    })
  })

  it('requires a bounded idempotency key on every mutation', async () => {
    const response = await claimPost(
      request(
        '/api/triage/triage-1/emergency-actions/action-1/claim',
        undefined,
        '',
      ),
      context,
    )

    expect(response.status).toBe(400)
    expect(claimMock).not.toHaveBeenCalled()
  })

  it('records contact from validated fields and ignores spoofed identity fields', async () => {
    const response = await contactPost(
      request('/api/triage/triage-1/emergency-actions/action-1/contact', {
        channel: 'patient_phone',
        instruction_given: 'Proceed for immediate emergency evaluation.',
        delivery_status: 'delivered',
        understanding_status: 'confirmed',
        outcome_code: 'instructions_delivered',
        outcome_summary: 'Synthetic patient confirmed understanding.',
        tenant_id: 'attacker-tenant',
        actor_user_id: 'attacker-user',
      }),
      context,
    )

    expect(response.status).toBe(200)
    expect(contactMock).toHaveBeenCalledWith({
      triageSessionId: 'triage-1',
      actionId: 'action-1',
      tenantId: 'tenant-1',
      actorUserId: 'clinician-1',
      actorRole: 'clinician',
      idempotencyKey: 'request-0001',
      channel: 'patient_phone',
      instructionGiven: 'Proceed for immediate emergency evaluation.',
      deliveryStatus: 'delivered',
      understandingStatus: 'confirmed',
      outcomeCode: 'instructions_delivered',
      outcomeSummary: 'Synthetic patient confirmed understanding.',
    })
  })

  it('rejects missing contact evidence before invoking the service', async () => {
    const response = await contactPost(
      request('/api/triage/triage-1/emergency-actions/action-1/contact', {
        channel: 'patient_phone',
      }),
      context,
    )

    expect(response.status).toBe(400)
    expect(contactMock).not.toHaveBeenCalled()
  })

  it('passes complete disposition evidence to close and maps safety conflicts to 409', async () => {
    closeMock.mockResolvedValueOnce({
      ok: false,
      reason: 'disposition_evidence_incomplete',
    })

    const response = await closePost(
      request('/api/triage/triage-1/emergency-actions/action-1/close', {
        disposition_code: 'emergency_services_handoff_confirmed',
        disposition_evidence:
          'Synthetic EMS handoff was confirmed by the responding team.',
        recipient_or_agency: 'Responding emergency services unit',
        destination: 'Synthetic emergency department',
      }),
      context,
    )

    expect(closeMock).toHaveBeenCalledWith({
      triageSessionId: 'triage-1',
      actionId: 'action-1',
      tenantId: 'tenant-1',
      actorUserId: 'clinician-1',
      actorRole: 'clinician',
      idempotencyKey: 'request-0001',
      dispositionCode: 'emergency_services_handoff_confirmed',
      dispositionEvidence:
        'Synthetic EMS handoff was confirmed by the responding team.',
      recipientOrAgency: 'Responding emergency services unit',
      destination: 'Synthetic emergency department',
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      reason: 'disposition_evidence_incomplete',
    })
  })

  it('maps action lookup and persistence failures without exposing internals', async () => {
    claimMock.mockResolvedValueOnce({
      ok: false,
      reason: 'action_not_found',
    })
    const missing = await claimPost(
      request('/api/triage/triage-1/emergency-actions/action-1/claim'),
      context,
    )
    expect(missing.status).toBe(404)

    claimMock.mockResolvedValueOnce({
      ok: false,
      reason: 'persistence_failed',
    })
    const failed = await claimPost(
      request('/api/triage/triage-1/emergency-actions/action-1/claim'),
      context,
    )
    expect(failed.status).toBe(503)
    expect(await failed.json()).toEqual({
      error: 'Emergency action command was not applied',
      reason: 'persistence_failed',
    })
  })
})
