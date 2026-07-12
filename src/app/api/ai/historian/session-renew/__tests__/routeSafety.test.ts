import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from '../route'

const {
  getPoolMock,
  queryMock,
  getConsultMock,
  buildContextMock,
  buildPromptMock,
  getToolsMock,
  getOpenAIKeyMock,
  authorizeMock,
  authorizePatientMock,
} = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  getConsultMock: vi.fn(),
  buildContextMock: vi.fn(),
  buildPromptMock: vi.fn(),
  getToolsMock: vi.fn(),
  getOpenAIKeyMock: vi.fn(),
  authorizeMock: vi.fn(),
  authorizePatientMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/consult/pipeline', () => ({ getConsult: getConsultMock }))
vi.mock('@/lib/consult/contextBuilder', () => ({
  buildHistorianContextFromConsult: buildContextMock,
}))
vi.mock('@/lib/secrets', () => ({ getOpenAIKey: getOpenAIKeyMock }))
vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/patientAccess/requestAuthorization', () => ({
  authorizePatientRequest: authorizePatientMock,
}))
vi.mock('@/lib/historianPrompts', () => ({
  buildHistorianSystemPrompt: buildPromptMock,
  getHistorianToolDefinition: getToolsMock,
}))

const authorizedRow = {
  care_pathway: 'routine_outpatient',
  workflow_status: 'patient_clarification',
  scheduling_locked: true,
  reviewed_at: '2026-07-10T12:00:00.000Z',
  reviewed_by: 'clinician-1',
  open_critical_clarifications: 0,
  open_emergency_actions: 0,
  coverage_status: 'complete',
  data_quality: 'partial',
  review_requirement: 'clinician_confirmation',
  question_id: 'question-1',
  question_code: 'symptom_onset',
  question_text: 'When did the symptom begin?',
}

async function callRoute(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/ai/historian/session-renew', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

describe('Historian renewal safety authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock.mockResolvedValue({ rows: [authorizedRow] })
    getConsultMock.mockResolvedValue({
      id: 'consult-1',
      triage_session_id: 'triage-1',
    })
    buildContextMock.mockReturnValue({
      referralReason: 'episodic symptoms',
      patientContext: 'stable outpatient',
    })
    buildPromptMock.mockReturnValue('purpose-limited instructions')
    getToolsMock.mockReturnValue([{ name: 'save_interview_output' }])
    getOpenAIKeyMock.mockResolvedValue('test-key')
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'user-1',
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ value: 'renewed-key', expires_at: 12345 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )
  })

  it('rejects an unauthorized renewal before consult or key access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: 'forbidden',
    })

    const response = await callRoute({ consult_id: 'consult-1' })

    expect(response.status).toBe(403)
    expect(getConsultMock).not.toHaveBeenCalled()
    expect(getOpenAIKeyMock).not.toHaveBeenCalled()
  })

  it('rejects purpose-limited renewal without a consult binding', async () => {
    const response = await callRoute({
      sessionType: 'referral_clarification',
    })

    expect(response.status).toBe(409)
    expect(getOpenAIKeyMock).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reauthorizes the consult but never mints OpenAI credentials for referral clarification', async () => {
    const response = await callRoute({
      sessionType: 'new_patient',
      consult_id: 'consult-1',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'OpenAI renewal is not permitted for referral clarification',
      reason: 'referral_clarification_uses_signed_nova',
    })
    expect(getConsultMock).toHaveBeenCalledWith('consult-1', 'tenant-1')
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('ts."tenant_id" = $2'),
      ['triage-1', 'tenant-1'],
    )
    expect(buildPromptMock).not.toHaveBeenCalled()
    expect(getToolsMock).not.toHaveBeenCalled()
    expect(getOpenAIKeyMock).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves OpenAI renewal for non-referral sessions', async () => {
    const response = await callRoute({ sessionType: 'new_patient' })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ephemeralKey: 'renewed-key',
      expiresAt: 12345,
    })
    expect(getOpenAIKeyMock).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('allows a lifecycle-valid patient session with the exact renewal scope', async () => {
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
        scopes: ['patient:historian:renew'],
        expiresAtEpochSeconds: 2_000_000_000,
      },
    })

    const response = await callRoute({
      sessionType: 'new_patient',
      patient_id: 'patient-authoritative',
      tenant_id: 'attacker-tenant',
    })

    expect(response.status).toBe(200)
    expect(authorizePatientMock).toHaveBeenCalledWith({
      requiredScopes: ['patient:historian:renew'],
      expectedPatientId: 'patient-authoritative',
    })
    expect(getOpenAIKeyMock).toHaveBeenCalledOnce()
  })

  it('rejects a missing or revoked patient renewal scope before key access', async () => {
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

    const response = await callRoute({ sessionType: 'new_patient' })

    expect(response.status).toBe(403)
    expect(getOpenAIKeyMock).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not let general renewal scope authorize consult-bound clarification', async () => {
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

    const response = await callRoute({
      sessionType: 'new_patient',
      consult_id: 'consult-1',
    })

    expect(response.status).toBe(403)
    expect(authorizePatientMock).toHaveBeenCalledWith({
      requiredScopes: ['patient:clarification:answer'],
      expectedConsultId: 'consult-1',
    })
    expect(getConsultMock).not.toHaveBeenCalled()
    expect(getOpenAIKeyMock).not.toHaveBeenCalled()
  })

  it('rejects a patient identifier that conflicts with signed renewal claims', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })
    authorizePatientMock.mockResolvedValueOnce({
      ok: true,
      context: {
        tenantId: 'tenant-1',
        patientId: 'patient-authoritative',
        scopes: ['patient:historian:renew'],
        expiresAtEpochSeconds: 2_000_000_000,
      },
    })

    const response = await callRoute({
      sessionType: 'new_patient',
      patient_id: 'patient-other',
    })

    expect(response.status).toBe(403)
    expect(getOpenAIKeyMock).not.toHaveBeenCalled()
  })

  it('rejects an unknown browser-requested renewal session type', async () => {
    const response = await callRoute({ sessionType: 'unrestricted_admin' })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid historian session type' })
    expect(getOpenAIKeyMock).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails closed when consult authorization was revoked', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ ...authorizedRow, care_pathway: 'emergency_now' }],
    })

    const response = await callRoute({ consult_id: 'consult-1' })

    expect(response.status).toBe(409)
    expect(getOpenAIKeyMock).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})
