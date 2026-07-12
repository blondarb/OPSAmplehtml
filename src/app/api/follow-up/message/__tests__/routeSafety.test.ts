import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  getConsultMock,
  loadSchedulingMock,
  processTurnMock,
  getPoolMock,
  queryMock,
  fromMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getConsultMock: vi.fn(),
  loadSchedulingMock: vi.fn(),
  processTurnMock: vi.fn(),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/consult/pipeline', () => ({
  getConsult: getConsultMock,
  linkIntakeToConsult: vi.fn(),
}))
vi.mock('@/lib/triage/schedulingAuthorization', () => ({
  loadSchedulingAuthorization: loadSchedulingMock,
}))
vi.mock('@/lib/follow-up/conversationEngine', () => ({
  processConversationTurn: processTurnMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))

import { POST } from '../route'

function callPost(
  overrides: Record<string, unknown> = {},
  options: { omitConsultId?: boolean } = {},
) {
  const body: Record<string, unknown> = {
    consult_id: 'consult-1',
    patient_message: 'Synthetic response.',
    patient_context: {
      id: 'patient-1',
      name: 'Synthetic Patient',
    },
    conversation_history: [],
    ...overrides,
  }
  if (options.omitConsultId) delete body.consult_id

  return POST(
    new Request('http://localhost/api/follow-up/message', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

function fluentWriteResult(data: unknown) {
  const builder: Record<string, unknown> = {}
  for (const method of ['insert', 'select', 'single']) {
    builder[method] = vi.fn(() => builder)
  }
  builder.then = (
    resolve: (value: { data: unknown; error: null }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve({ data, error: null }).then(resolve, reject)
  return builder as {
    insert: ReturnType<typeof vi.fn>
    select: ReturnType<typeof vi.fn>
    single: ReturnType<typeof vi.fn>
  }
}

describe('follow-up message clinical safety boundary', () => {
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
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock.mockResolvedValue({ rows: [{ id: 'patient-1' }] })
    getConsultMock.mockResolvedValue({
      id: 'consult-1',
      patient_id: 'patient-1',
      triage_session_id: 'triage-1',
    })
    loadSchedulingMock.mockResolvedValue({
      authorization: {},
      decision: { allowed: true },
    })
    fromMock.mockImplementation(() => {
      throw new Error('unexpected follow-up write')
    })
  })

  it('rejects unauthenticated messages before model or database access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await callPost()

    expect(response.status).toBe(401)
    expect(processTurnMock).not.toHaveBeenCalled()
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('blocks the generic follow-up agent while triage safety is unresolved', async () => {
    loadSchedulingMock.mockResolvedValueOnce({
      authorization: null,
      decision: { allowed: false, reason: 'emergency_action_open' },
    })

    const response = await callPost()

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      reason: 'emergency_action_open',
    })
    expect(getConsultMock).toHaveBeenCalledWith('consult-1', 'tenant-1')
    expect(processTurnMock).not.toHaveBeenCalled()
  })

  it('derives a consult from an existing session and blocks it after an emergency hold', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'patient-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            session_patient_id: 'patient-1',
            patient_name: 'Authoritative Patient',
            patient_age: 55,
            patient_gender: 'female',
            diagnosis: 'Neurological consultation',
            visit_date: '2026-07-11',
            provider_name: 'Synthetic Clinician',
            medications: [],
            visit_summary: 'Authoritative triage summary',
            consult_id: 'consult-1',
            consult_patient_id: 'patient-1',
            triage_session_id: 'triage-1',
          },
        ],
      })
    loadSchedulingMock.mockResolvedValueOnce({
      authorization: null,
      decision: { allowed: false, reason: 'emergency_action_open' },
    })

    const response = await callPost(
      { session_id: 'session-1' },
      { omitConsultId: true },
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      reason: 'emergency_action_open',
    })
    expect(loadSchedulingMock).toHaveBeenCalledWith('triage-1', 'tenant-1')
    expect(processTurnMock).not.toHaveBeenCalled()
  })

  it('rejects a patient context that does not match the existing session', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'patient-2' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            session_patient_id: 'patient-1',
            patient_name: 'Authoritative Patient',
            patient_age: 55,
            patient_gender: 'female',
            diagnosis: 'Neurological consultation',
            visit_date: '2026-07-11',
            provider_name: 'Synthetic Clinician',
            medications: [],
            visit_summary: 'Authoritative triage summary',
            consult_id: 'consult-1',
            consult_patient_id: 'patient-1',
            triage_session_id: 'triage-1',
          },
        ],
      })

    const response = await callPost(
      {
        session_id: 'session-1',
        patient_context: {
          id: 'patient-2',
          name: 'Wrong Patient',
        },
      },
      { omitConsultId: true },
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      reason: 'follow_up_session_patient_mismatch',
    })
    expect(loadSchedulingMock).not.toHaveBeenCalled()
    expect(processTurnMock).not.toHaveBeenCalled()
  })

  it('rejects a new consult-bound session without an explicit patient binding', async () => {
    const response = await callPost({
      patient_context: {
        name: 'Unbound Request Patient',
      },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      reason: 'follow_up_consult_patient_binding_required',
    })
    expect(processTurnMock).not.toHaveBeenCalled()
    expect(loadSchedulingMock).not.toHaveBeenCalled()
  })

  it('rechecks triage after model processing before returning or persisting a consult-bound turn', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'patient-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            session_patient_id: 'patient-1',
            patient_name: 'Authoritative Patient',
            patient_age: null,
            patient_gender: 'female',
            diagnosis: 'Neurological consultation',
            visit_date: '2026-07-11',
            provider_name: 'Synthetic Clinician',
            medications: [],
            visit_summary: 'Authoritative triage summary',
            consult_id: 'consult-1',
            consult_patient_id: 'patient-1',
            triage_session_id: 'triage-1',
          },
        ],
      })
    loadSchedulingMock
      .mockResolvedValueOnce({
        authorization: {},
        decision: { allowed: true },
      })
      .mockResolvedValueOnce({
        authorization: null,
        decision: { allowed: false, reason: 'emergency_action_open' },
      })
    processTurnMock.mockResolvedValueOnce({
      agent_response: 'Synthetic response that must not be returned after revocation.',
      current_module: 'symptoms',
      escalation_triggered: false,
      all_flags: [],
      conversation_complete: false,
      dashboard_update: {
        status: 'in_progress',
        currentModule: 'symptoms',
        flags: [],
        medicationStatus: [],
        functionalStatus: null,
        functionalDetails: null,
        patientQuestions: [],
        caregiverInfo: {
          isCaregiver: false,
          name: null,
          relationship: null,
        },
      },
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
    })

    const response = await callPost(
      {
        session_id: 'session-1',
        patient_context: {
          id: 'patient-1',
          name: 'Untrusted Request Name',
          age: 64,
        },
      },
      { omitConsultId: true },
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      reason: 'emergency_action_open',
    })
    expect(loadSchedulingMock).toHaveBeenCalledTimes(2)
    expect(processTurnMock).toHaveBeenCalledOnce()
    expect(processTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_context: expect.objectContaining({
          id: 'patient-1',
          name: 'Authoritative Patient',
          age: 64,
        }),
      }),
      '',
    )
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('encodes JSONB array fields before persisting a new follow-up turn', async () => {
    const builder = fluentWriteResult({ id: 'session-new' })
    fromMock.mockReturnValueOnce(builder)
    processTurnMock.mockResolvedValueOnce({
      agent_response: 'Synthetic response.',
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
    })

    const response = await callPost({
      patient_context: {
        id: 'patient-1',
        name: 'Synthetic Patient',
        medications: [{ name: 'Synthetic Medication', dose: '1 tablet' }],
      },
    })

    expect(response.status).toBe(200)
    const insertPayload = builder.insert.mock.calls[0]?.[0]
    expect(typeof insertPayload.medications).toBe('string')
    expect(typeof insertPayload.transcript).toBe('string')
    expect(typeof insertPayload.medication_status).toBe('string')
    expect(typeof insertPayload.patient_questions).toBe('string')
    expect(JSON.parse(insertPayload.transcript)).toHaveLength(2)
  })
})
