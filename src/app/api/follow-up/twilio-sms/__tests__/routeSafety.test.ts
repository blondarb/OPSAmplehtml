import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  credentialsMock,
  validateSignatureMock,
  processTurnMock,
  fromMock,
  getPoolMock,
  queryMock,
  loadSchedulingMock,
} = vi.hoisted(() => ({
  credentialsMock: vi.fn(),
  validateSignatureMock: vi.fn(),
  processTurnMock: vi.fn(),
  fromMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  loadSchedulingMock: vi.fn(),
}))

vi.mock('@/lib/secrets', () => ({ getTwilioCredentials: credentialsMock }))
vi.mock('@/lib/follow-up/twilioClient', () => ({
  validateTwilioSignature: validateSignatureMock,
}))
vi.mock('@/lib/follow-up/conversationEngine', () => ({
  processConversationTurn: processTurnMock,
}))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/triage/schedulingAuthorization', () => ({
  loadSchedulingAuthorization: loadSchedulingMock,
}))

import { POST } from '../route'

function fluentResult(data: unknown) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'gt', 'order', 'limit', 'single', 'update']) {
    builder[method] = vi.fn(() => builder)
  }
  builder.then = (
    resolve: (value: { data: unknown; error: null }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve({ data, error: null }).then(resolve, reject)
  return builder
}

function request() {
  const form = new FormData()
  form.set('From', '+15552345678')
  form.set('To', '+15559876543')
  form.set('Body', 'Synthetic reply')
  return new Request('https://app.example.test/api/follow-up/twilio-sms', {
    method: 'POST',
    headers: { 'X-Twilio-Signature': 'valid-signature' },
    body: form,
  })
}

const processResult = {
  agent_response: 'Server-generated reply',
  current_module: 'symptoms',
  escalation_triggered: false,
  all_flags: [],
  conversation_complete: false,
  dashboard_update: { status: 'in_progress' },
  medication_status: [],
  highest_tier: 'none',
  extracted_data: {
    functional_status: null,
    functional_details: null,
    patient_questions: [],
  },
  caregiver_info: {
    isCaregiver: false,
    name: null,
    relationship: null,
  },
}

describe('signed Twilio follow-up webhook safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('TWILIO_WEBHOOK_BASE_URL', 'https://app.example.test')
    credentialsMock.mockResolvedValue({
      account_sid: 'AC-test',
      auth_token: 'test-token',
    })
    validateSignatureMock.mockResolvedValue(true)
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock.mockResolvedValue({
      rows: [
        {
          id: 'session-1',
          tenant_id: 'tenant-1',
          patient_id: 'patient-1',
          tenant_patient_id: 'patient-1',
          patient_name: 'Authoritative Patient',
          patient_age: 55,
          patient_gender: 'female',
          diagnosis: 'Neurological follow-up',
          visit_date: '2026-07-10',
          provider_name: 'Synthetic Clinician',
          medications: JSON.stringify([{ name: 'Synthetic Medication', dose: '1 tablet' }]),
          visit_summary: 'Authoritative summary',
          transcript: [],
          consult_id: 'consult-1',
          triage_session_id: 'triage-1',
        },
      ],
    })
    loadSchedulingMock.mockResolvedValue({
      authorization: {},
      decision: { allowed: true },
    })
    processTurnMock.mockResolvedValue(processResult)
    fromMock
      .mockReturnValueOnce(
        fluentResult({
          id: 'phone-session-1',
          session_id: 'session-1',
          scenario_id: 'tenant-session',
          sms_history: [],
        }),
      )
      .mockReturnValueOnce(fluentResult(null))
      .mockReturnValueOnce(fluentResult(null))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('derives patient context from the tenant session and rechecks triage around the model', async () => {
    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(validateSignatureMock).toHaveBeenCalled()
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('nc.tenant_id = fs.tenant_id'),
      ['session-1'],
    )
    const phoneLookup = fromMock.mock.results[0]?.value as {
      eq: ReturnType<typeof vi.fn>
    }
    expect(phoneLookup.eq).toHaveBeenCalledWith('phone_number', '+15552345678')
    expect(phoneLookup.eq).toHaveBeenCalledWith('twilio_number', '+15559876543')
    expect(processTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_context: expect.objectContaining({
          id: 'patient-1',
          name: 'Authoritative Patient',
        }),
      }),
      '',
    )
    expect(loadSchedulingMock).toHaveBeenCalledTimes(2)
    const sessionBuilder = fromMock.mock.results[1]?.value as {
      update: ReturnType<typeof vi.fn>
    }
    const sessionUpdate = sessionBuilder.update.mock.calls[0]?.[0]
    expect(typeof sessionUpdate.transcript).toBe('string')
    expect(typeof sessionUpdate.medication_status).toBe('string')
    expect(typeof sessionUpdate.patient_questions).toBe('string')
    expect(JSON.parse(sessionUpdate.transcript)).toHaveLength(2)

    const phoneBuilder = fromMock.mock.results[2]?.value as {
      update: ReturnType<typeof vi.fn>
    }
    const phoneUpdate = phoneBuilder.update.mock.calls[0]?.[0]
    expect(typeof phoneUpdate.sms_history).toBe('string')
    expect(JSON.parse(phoneUpdate.sms_history)).toHaveLength(2)
    expect(await response.text()).toContain('Server-generated reply')
  })

  it('rejects invalid Twilio signatures in every environment before session or model access', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    validateSignatureMock.mockResolvedValueOnce(false)

    const response = await POST(request())

    expect(response.status).toBe(403)
    expect(fromMock).not.toHaveBeenCalled()
    expect(processTurnMock).not.toHaveBeenCalled()
  })
})
