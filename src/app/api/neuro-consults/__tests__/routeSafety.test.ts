import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  createConsultMock,
  getPoolMock,
  listConsultsMock,
  queryMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  createConsultMock: vi.fn(),
  getPoolMock: vi.fn(),
  listConsultsMock: vi.fn(),
  queryMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/consult/pipeline', () => ({
  createConsult: createConsultMock,
  listConsults: listConsultsMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { GET, POST } from '../route'

const access = {
  ok: true as const,
  context: {
    userId: 'clinician-1',
    email: 'clinician@example.test',
    tenantId: 'tenant-1',
    role: 'clinician' as const,
  },
}

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/neuro-consults', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

describe('neuro consult collection access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizeMock.mockResolvedValue(access)
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock.mockResolvedValue({
      rows: [
        {
          id: 'triage-1',
          referral_text: 'Authoritative referral text from the triage session.',
          processing_status: 'complete',
          triage_tier: 'routine',
          clinical_reasons: ['Authoritative clinical reason'],
          suggested_workup: ['Authoritative workup'],
          red_flags: ['Authoritative red flag'],
          subspecialty_recommendation: 'General Neurology',
          subspecialty_rationale: 'Authoritative rationale',
          ai_raw_response: { red_flag_override: false },
          patient_id: null,
        },
      ],
    })
    createConsultMock.mockResolvedValue({
      data: { id: 'consult-1', tenant_id: 'tenant-1' },
    })
    listConsultsMock.mockResolvedValue([])
  })

  it('authorizes before parsing or creating a consult', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await POST(
      new Request('http://localhost/api/neuro-consults', {
        method: 'POST',
        body: '{invalid-json',
      }),
    )

    expect(response.status).toBe(401)
    expect(createConsultMock).not.toHaveBeenCalled()
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('resolves triage data from the authenticated tenant instead of trusting client fields', async () => {
    const response = await post({
      referral_text: 'Spoofed referral text',
      tenant_id: 'spoofed-tenant',
      triage_data: {
        triage_session_id: 'triage-1',
        triage_urgency: 'non_urgent',
        triage_tier_display: 'SPOOFED',
        triage_summary: 'Spoofed summary',
        triage_chief_complaint: 'Spoofed complaint',
        triage_red_flags: [],
        triage_subspecialty: 'Spoofed specialty',
      },
    })

    expect(response.status).toBe(201)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      ['triage-1', 'tenant-1'],
    )
    expect(createConsultMock).toHaveBeenCalledWith(
      'Authoritative referral text from the triage session.',
      expect.objectContaining({
        triage_session_id: 'triage-1',
        triage_urgency: 'routine',
        triage_chief_complaint: 'Authoritative clinical reason',
        triage_red_flags: ['Authoritative red flag'],
        triage_subspecialty: 'General Neurology',
      }),
      undefined,
      'tenant-1',
    )
  })

  it('tenant-scopes consult listings for every authorized reader', async () => {
    const response = await GET(
      new Request(
        'http://localhost/api/neuro-consults?patient_id=patient-1&limit=25',
      ),
    )

    expect(response.status).toBe(200)
    expect(listConsultsMock).toHaveBeenCalledWith(
      'patient-1',
      25,
      'tenant-1',
    )
  })

  it('rejects unauthorized list access before querying consults', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: 'forbidden',
    })

    const response = await GET(
      new Request('http://localhost/api/neuro-consults'),
    )

    expect(response.status).toBe(403)
    expect(listConsultsMock).not.toHaveBeenCalled()
  })

  it('does not expose internal errors in a 500 response', async () => {
    createConsultMock.mockRejectedValueOnce(
      new Error('postgres://internal-user:secret@db.example.test'),
    )

    const response = await post({ referral_text: 'Referral text' })
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'Failed to create consult record' })
    expect(JSON.stringify(payload)).not.toContain('secret')
  })
})
