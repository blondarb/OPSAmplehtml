import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  fromMock,
  getSelectMock,
  getEqTenantMock,
  getEqStatusMock,
  getOrderMock,
  getLimitMock,
  originalSelectMock,
  originalEqIdMock,
  originalEqTenantMock,
  originalSingleMock,
  updateMock,
  updateEqIdMock,
  updateEqTenantMock,
  updateSelectMock,
  updateSingleMock,
  insertMock,
  insertSelectMock,
  insertSingleMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  fromMock: vi.fn(),
  getSelectMock: vi.fn(),
  getEqTenantMock: vi.fn(),
  getEqStatusMock: vi.fn(),
  getOrderMock: vi.fn(),
  getLimitMock: vi.fn(),
  originalSelectMock: vi.fn(),
  originalEqIdMock: vi.fn(),
  originalEqTenantMock: vi.fn(),
  originalSingleMock: vi.fn(),
  updateMock: vi.fn(),
  updateEqIdMock: vi.fn(),
  updateEqTenantMock: vi.fn(),
  updateSelectMock: vi.fn(),
  updateSingleMock: vi.fn(),
  insertMock: vi.fn(),
  insertSelectMock: vi.fn(),
  insertSingleMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))

import { GET, PATCH } from '../route'

function sendDraft(overrides: Record<string, unknown> = {}) {
  return PATCH(
    new Request('http://localhost/api/patient/messages/draft', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message_id: 'message-1',
        action: 'send',
        edited_draft: 'Reviewed synthetic response.',
        ...overrides,
      }),
    }) as never,
  )
}

function useMutationQueryMocks() {
  fromMock.mockReturnValue({
    select: originalSelectMock,
    update: updateMock,
    insert: insertMock,
  })
}

describe('patient message draft clinical boundary', () => {
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

    getLimitMock.mockResolvedValue({ data: [], error: null })
    getOrderMock.mockReturnValue({ limit: getLimitMock })
    getEqStatusMock.mockReturnValue({ order: getOrderMock })
    getEqTenantMock.mockReturnValue({ eq: getEqStatusMock })
    getSelectMock.mockReturnValue({ eq: getEqTenantMock })

    originalSingleMock.mockResolvedValue({
      data: {
        id: 'message-1',
        patient_name: 'Synthetic Patient',
        patient_id: 'patient-1',
        subject: 'Question',
        ai_draft: 'Draft response.',
      },
      error: null,
    })
    originalEqTenantMock.mockReturnValue({ single: originalSingleMock })
    originalEqIdMock.mockReturnValue({ eq: originalEqTenantMock })
    originalSelectMock.mockReturnValue({ eq: originalEqIdMock })

    updateSingleMock.mockResolvedValue({
      data: { id: 'message-1', draft_status: 'approved' },
      error: null,
    })
    updateSelectMock.mockReturnValue({ single: updateSingleMock })
    updateEqTenantMock.mockReturnValue({ select: updateSelectMock })
    updateEqIdMock.mockReturnValue({ eq: updateEqTenantMock })
    updateMock.mockReturnValue({ eq: updateEqIdMock })

    insertSingleMock.mockResolvedValue({
      data: { id: 'message-2', direction: 'outbound' },
      error: null,
    })
    insertSelectMock.mockReturnValue({ single: insertSingleMock })
    insertMock.mockReturnValue({ select: insertSelectMock })

    fromMock.mockReturnValue({
      select: getSelectMock,
      update: updateMock,
      insert: insertMock,
    })
  })

  it('rejects an unauthenticated pending-draft read', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await GET()

    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('tenant-scopes pending-draft reads', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(getEqTenantMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
  })

  it('rejects a scheduler from approving or sending a clinical draft', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: 'forbidden',
    })

    const response = await sendDraft()

    expect(response.status).toBe(403)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('tenant-scopes the fetch, state update, and outbound message', async () => {
    useMutationQueryMocks()

    const response = await sendDraft()

    expect(response.status).toBe(200)
    expect(originalEqTenantMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(updateEqTenantMock).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 'tenant-1' }),
    )
  })

  it('does not expose database error details', async () => {
    useMutationQueryMocks()
    originalSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'secret schema and SQL details' },
    })

    const response = await sendDraft()

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Message not found' })
  })
})
