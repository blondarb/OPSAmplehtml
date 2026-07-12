import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  getPoolMock,
  queryMock,
  credentialsMock,
  sendSmsMock,
  normalizePhoneMock,
  loadSchedulingMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  credentialsMock: vi.fn(),
  sendSmsMock: vi.fn(),
  normalizePhoneMock: vi.fn((value: string) => {
    const digits = String(value).replace(/\D/g, '')
    const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
    return ten.length === 10 ? `+1${ten}` : null
  }),
  loadSchedulingMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/secrets', () => ({ getTwilioCredentials: credentialsMock }))
vi.mock('@/lib/follow-up/twilioClient', () => ({
  sendSms: sendSmsMock,
  normalizePhoneNumber: normalizePhoneMock,
}))
vi.mock('@/lib/triage/schedulingAuthorization', () => ({
  loadSchedulingAuthorization: loadSchedulingMock,
}))

import { GET, POST } from '../route'

function request(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/follow-up/send-sms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      session_id: 'session-1',
      phone_number: '(555) 234-5678',
      custom_message: 'INJECTED CONTENT MUST NEVER BE SENT',
      ...overrides,
    }),
  })
}

const boundSession = {
  id: 'session-1',
  patient_id: 'patient-1',
  patient_name: 'Synthetic Patient',
  visit_date: '2026-07-10',
  provider_name: 'Synthetic Clinician',
  medications: [{ name: 'Synthetic Medication', dose: '1 tablet', isNew: true }],
  status: 'idle',
  patient_phone: '(555) 234-5678',
  consult_id: 'consult-1',
  triage_session_id: 'triage-1',
}

describe('follow-up SMS initiation safety boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMock.mockReset()
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'clinician-1',
        email: 'clinician@example.test',
        tenantId: 'tenant-1',
        role: 'clinician',
      },
    })
    getPoolMock.mockResolvedValue({ query: queryMock })
    credentialsMock.mockResolvedValue({
      account_sid: 'AC-test',
      auth_token: 'test-token',
      phone_number: '+15550000000',
    })
    sendSmsMock.mockResolvedValue('SM-test')
    loadSchedulingMock.mockResolvedValue({
      authorization: {},
      decision: { allowed: true },
    })
  })

  it('lists only tenant-bound eligible sessions with masked destinations', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'session-1',
          patient_name: 'Synthetic Patient',
          visit_date: '2026-07-10',
          patient_phone: '+15552345678',
        },
      ],
    })

    const response = await GET()

    expect(response.status).toBe(200)
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('fs.tenant_id = $1'),
      ['tenant-1'],
    )
    const body = await response.json()
    expect(body.sessions[0]).toMatchObject({
      id: 'session-1',
      patientName: 'Synthetic Patient',
      destination: '***-***-5678',
    })
    expect(JSON.stringify(body)).not.toContain('+15552345678')
  })

  it('rejects unauthenticated sends before secrets, database, or Twilio access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await POST(request())

    expect(response.status).toBe(401)
    expect(credentialsMock).not.toHaveBeenCalled()
    expect(getPoolMock).not.toHaveBeenCalled()
    expect(sendSmsMock).not.toHaveBeenCalled()
  })

  it('rejects a requested destination that differs from the tenant patient phone', async () => {
    queryMock.mockResolvedValueOnce({ rows: [boundSession] })

    const response = await POST(request({ phone_number: '(555) 999-9999' }))

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      reason: 'follow_up_destination_mismatch',
    })
    expect(sendSmsMock).not.toHaveBeenCalled()
  })

  it('blocks SMS initiation when consult triage authorization is revoked', async () => {
    queryMock.mockResolvedValueOnce({ rows: [boundSession] })
    loadSchedulingMock.mockResolvedValueOnce({
      authorization: null,
      decision: { allowed: false, reason: 'emergency_action_open' },
    })

    const response = await POST(request())

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ reason: 'emergency_action_open' })
    expect(sendSmsMock).not.toHaveBeenCalled()
  })

  it('sends only bounded server-generated content to the authoritative phone', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [boundSession] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'session-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'phone-session-1' }] })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(queryMock.mock.calls[0][0]).toContain('fs.tenant_id = $2')
    expect(queryMock.mock.calls[0][1]).toEqual(['session-1', 'tenant-1'])
    expect(queryMock.mock.calls[1][0]).not.toContain('JOIN followup_sessions')
    expect(queryMock.mock.calls[1][1]).toEqual(['+15552345678'])
    expect(loadSchedulingMock).toHaveBeenCalledTimes(2)
    const [destination, content] = sendSmsMock.mock.calls[0]
    expect(destination).toBe('+15552345678')
    expect(content).not.toContain('INJECTED CONTENT')
    expect(content.length).toBeLessThanOrEqual(480)
    expect(queryMock.mock.calls[4][1]).toContain('tenant-session')
  })
})
