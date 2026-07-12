import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from '../route'
import { computeNovaRelayConfigDigest } from '@/lib/voice/novaRelayAuth'

const {
  getPoolMock,
  queryMock,
  getConsultMock,
  markHistorianStartedMock,
  buildContextMock,
  buildPromptMock,
  getOpenAIKeyMock,
  getNovaRelaySharedSecretMock,
  authorizeMock,
  authorizePatientMock,
  getNovaToolsMock,
} = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  getConsultMock: vi.fn(),
  markHistorianStartedMock: vi.fn(),
  buildContextMock: vi.fn(),
  buildPromptMock: vi.fn(),
  getOpenAIKeyMock: vi.fn(),
  getNovaRelaySharedSecretMock: vi.fn(),
  authorizeMock: vi.fn(),
  authorizePatientMock: vi.fn(),
  getNovaToolsMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/consult/pipeline', () => ({
  getConsult: getConsultMock,
  markHistorianStarted: markHistorianStartedMock,
}))
vi.mock('@/lib/consult/contextBuilder', () => ({
  buildHistorianContextFromConsult: buildContextMock,
}))
vi.mock('@/lib/secrets', () => ({
  getOpenAIKey: getOpenAIKeyMock,
  getNovaRelaySharedSecret: getNovaRelaySharedSecretMock,
}))
vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/patientAccess/requestAuthorization', () => ({
  authorizePatientRequest: authorizePatientMock,
}))
vi.mock('@/lib/historianPrompts', () => ({
  buildHistorianSystemPrompt: buildPromptMock,
  getHistorianToolDefinition: vi.fn(() => []),
  getHistorianToolsForProvider: getNovaToolsMock,
}))

const clearedAuthorizationRow = {
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
  question_text: 'When did the current symptom begin?',
}

async function callRoute(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/ai/historian/session', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('Historian consult safety authorization', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NOVA_RELAY_SHARED_SECRET', 'test-shared-secret')
    vi.stubEnv('NOVA_SONIC_RELAY_URL', 'wss://relay.example.test')
    getPoolMock.mockResolvedValue({ query: queryMock })
    queryMock.mockResolvedValue({ rows: [clearedAuthorizationRow] })
    getConsultMock.mockResolvedValue({
      id: 'consult-1',
      triage_session_id: 'triage-1',
    })
    markHistorianStartedMock.mockResolvedValue(true)
    buildContextMock.mockReturnValue({
      referralReason: 'episodic numbness',
      patientContext: 'stable outpatient referral',
    })
    buildPromptMock.mockReturnValue('purpose-limited instructions')
    getNovaToolsMock.mockReturnValue([])
    getOpenAIKeyMock.mockResolvedValue('test-key')
    getNovaRelaySharedSecretMock.mockImplementation(async () =>
      process.env.NOVA_RELAY_SHARED_SECRET?.trim() || '',
    )
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
          JSON.stringify({
            value: 'ephemeral-secret',
            session_id: 'realtime-1',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )
  })

  it('rejects an unauthorized caller before consult lookup or model access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await callRoute({ consult_id: 'consult-1' })

    expect(response.status).toBe(401)
    expect(getConsultMock).not.toHaveBeenCalled()
    expect(getOpenAIKeyMock).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    [{ ...clearedAuthorizationRow, care_pathway: 'emergency_now' }, 'care_pathway_not_stable_outpatient'],
    [{ ...clearedAuthorizationRow, workflow_status: 'clinician_review' }, 'workflow_not_patient_clarification'],
    [{ ...clearedAuthorizationRow, coverage_status: 'partial' }, 'coverage_incomplete'],
    [{ ...clearedAuthorizationRow, data_quality: 'insufficient' }, 'data_quality_not_usable_for_clarification'],
    [{ ...clearedAuthorizationRow, review_requirement: 'immediate_clinician_review' }, 'time_critical_review_unresolved'],
    [{ ...clearedAuthorizationRow, question_id: null, question_code: null, question_text: null }, 'patient_clarification_not_approved'],
  ])('returns 409 before minting or state transition when authorization fails: %#', async (row, reason) => {
    queryMock.mockResolvedValueOnce({ rows: [row] })

    const response = await callRoute({
      consult_id: 'consult-1',
      sessionType: 'new_patient',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Historian is not authorized for this consult',
      reason,
    })
    expect(getOpenAIKeyMock).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(markHistorianStartedMock).not.toHaveBeenCalled()
  })

  it('forces an authorized consult into purpose-limited referral clarification', async () => {
    const response = await callRoute({
      consult_id: 'consult-1',
      sessionType: 'new_patient',
      referralReason: 'untrusted client text',
    })

    expect(response.status).toBe(200)
    expect(buildPromptMock).toHaveBeenCalledWith(
      'referral_clarification',
      'episodic numbness',
      'stable outpatient referral',
      [
        {
          id: 'question-1',
          code: 'symptom_onset',
          text: 'When did the current symptom begin?',
        },
      ],
    )
    expect(markHistorianStartedMock).toHaveBeenCalledWith(
      'consult-1',
      'tenant-1',
    )
    expect(getConsultMock).toHaveBeenCalledWith('consult-1', 'tenant-1')
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('ts."tenant_id" = $2'),
      ['triage-1', 'tenant-1'],
    )
  })

  it('forces referral clarification to signed Nova even when the browser requests OpenAI', async () => {
    const response = await callRoute({
      consult_id: 'consult-1',
      provider: 'openai',
      sessionType: 'new_patient',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      provider: 'nova',
      relayUrl: 'wss://relay.example.test',
      sessionType: 'referral_clarification',
    })
    expect(body.relayToken).toEqual(expect.any(String))
    expect(body).not.toHaveProperty('ephemeralKey')
    expect(getOpenAIKeyMock).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['NOVA_RELAY_SHARED_SECRET', ''],
    ['NOVA_SONIC_RELAY_URL', ''],
  ])('fails closed before state transition when referral relay config %s is missing', async (name, value) => {
    vi.stubEnv(name, value)

    const response = await callRoute({
      consult_id: 'consult-1',
      provider: 'openai',
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'Signed Nova relay is unavailable for referral clarification',
      reason: 'nova_relay_unavailable',
    })
    expect(markHistorianStartedMock).not.toHaveBeenCalled()
    expect(getOpenAIKeyMock).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects referral clarification without a consult-bound authorization', async () => {
    const response = await callRoute({
      provider: 'nova',
      sessionType: 'referral_clarification',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Historian is not authorized for referral clarification',
      reason: 'triage_authorization_missing',
    })
    expect(buildPromptMock).not.toHaveBeenCalled()
    expect(getOpenAIKeyMock).not.toHaveBeenCalled()
  })

  it('preserves OpenAI for a non-referral historian session', async () => {
    const response = await callRoute({
      provider: 'openai',
      sessionType: 'new_patient',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      provider: 'openai',
      ephemeralKey: 'ephemeral-secret',
      sessionType: 'new_patient',
    })
    expect(getOpenAIKeyMock).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('allows a patient session with only the historian-start scope and derives its binding from claims', async () => {
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
        scopes: ['patient:historian:start'],
        expiresAtEpochSeconds: 2_000_000_000,
      },
    })

    const response = await callRoute({
      provider: 'openai',
      sessionType: 'new_patient',
      tenant_id: 'attacker-tenant',
    })

    expect(response.status).toBe(200)
    expect(authorizePatientMock).toHaveBeenCalledWith({
      requiredScopes: ['patient:historian:start'],
    })
    expect(getConsultMock).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('requires a consult-bound clarification capability and reuses the workflow authorization', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })
    authorizePatientMock.mockResolvedValueOnce({
      ok: true,
      context: {
        tenantId: 'tenant-1',
        patientId: 'patient-1',
        consultId: 'consult-1',
        scopes: ['patient:clarification:answer'],
        expiresAtEpochSeconds: 2_000_000_000,
      },
    })
    getConsultMock.mockResolvedValueOnce({
      id: 'consult-1',
      patient_id: 'patient-1',
      triage_session_id: 'triage-1',
    })
    const confidentialSentinels = [
      'CONFIDENTIAL_TRIAGE_PRIORITY',
      'CONFIDENTIAL_REFERRER_SUMMARY',
      'CONFIDENTIAL_RED_FLAGS',
      'CONFIDENTIAL_SDNE_FINDINGS',
    ]
    buildContextMock.mockReturnValueOnce({
      referralReason: confidentialSentinels[0],
      patientContext: confidentialSentinels.slice(1).join(' '),
    })
    buildPromptMock.mockImplementationOnce(
      (_sessionType, referralReason, patientContext) =>
        `${String(referralReason)}\n${String(patientContext)}`,
    )

    const response = await callRoute({
      consult_id: 'consult-1',
      sessionType: 'new_patient',
      provider: 'openai',
    })

    expect(response.status).toBe(200)
    expect(authorizePatientMock).toHaveBeenCalledWith({
      requiredScopes: ['patient:clarification:answer'],
      expectedConsultId: 'consult-1',
    })
    expect(getConsultMock).toHaveBeenCalledWith('consult-1', 'tenant-1')
    const responseBody = await response.json()
    expect(responseBody).toMatchObject({
      provider: 'nova',
      sessionType: 'referral_clarification',
    })
    expect(buildPromptMock).toHaveBeenCalledWith(
      'referral_clarification',
      'Your neurology referral',
      'No additional consult context is authorized for disclosure. Ask only the approved questions.',
      expect.any(Array),
    )
    expect(JSON.stringify(responseBody)).not.toMatch(
      /CONFIDENTIAL_TRIAGE_PRIORITY|CONFIDENTIAL_REFERRER_SUMMARY|CONFIDENTIAL_RED_FLAGS|CONFIDENTIAL_SDNE_FINDINGS/,
    )
  })

  it('does not let general historian scope authorize referral clarification', async () => {
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
      consult_id: 'consult-1',
      sessionType: 'new_patient',
    })

    expect(response.status).toBe(403)
    expect(authorizePatientMock).toHaveBeenCalledWith({
      requiredScopes: ['patient:clarification:answer'],
      expectedConsultId: 'consult-1',
    })
    expect(getConsultMock).not.toHaveBeenCalled()
    expect(getOpenAIKeyMock).not.toHaveBeenCalled()
  })

  it('rejects a patient capability whose authoritative patient does not own the consult', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })
    authorizePatientMock.mockResolvedValueOnce({
      ok: true,
      context: {
        tenantId: 'tenant-1',
        patientId: 'patient-other',
        consultId: 'consult-1',
        scopes: ['patient:clarification:answer'],
        expiresAtEpochSeconds: 2_000_000_000,
      },
    })
    getConsultMock.mockResolvedValueOnce({
      id: 'consult-1',
      patient_id: 'patient-1',
      triage_session_id: 'triage-1',
    })

    const response = await callRoute({ consult_id: 'consult-1' })

    expect(response.status).toBe(403)
    expect(markHistorianStartedMock).not.toHaveBeenCalled()
    expect(getOpenAIKeyMock).not.toHaveBeenCalled()
  })

  it('rejects a revoked patient session before consult or model access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })
    authorizePatientMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'invalid_patient_session',
    })

    const response = await callRoute({ sessionType: 'new_patient' })

    expect(response.status).toBe(401)
    expect(getConsultMock).not.toHaveBeenCalled()
    expect(getOpenAIKeyMock).not.toHaveBeenCalled()
  })

  it('rejects a patient identifier that conflicts with signed session claims', async () => {
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
        scopes: ['patient:historian:start'],
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

  it('fails closed if the authorized state transition cannot be recorded', async () => {
    markHistorianStartedMock.mockResolvedValueOnce(false)

    const response = await callRoute({ consult_id: 'consult-1' })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'Historian session could not be safely recorded',
    })
  })

  it('binds a Nova token to the exact server-resolved start configuration', async () => {
    vi.stubEnv('NOVA_SONIC_VOICE_ID', 'tiffany')
    getNovaToolsMock.mockReturnValueOnce([
      { toolSpec: { name: 'save_interview_output' } },
    ])

    const response = await callRoute({
      provider: 'nova',
      consult_id: 'consult-1',
      sessionType: 'new_patient',
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    const [payloadB64] = body.relayToken.split('.')
    const tokenPayload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    )
    expect(tokenPayload.configDigest).toBe(
      computeNovaRelayConfigDigest({
        instructions: body.instructions,
        tools: body.tools,
        voiceId: body.voiceId,
        sessionType: body.sessionType,
      }),
    )
    expect(body.sessionType).toBe('referral_clarification')
  })

  it('rejects an unknown browser-requested session type', async () => {
    const response = await callRoute({
      provider: 'nova',
      sessionType: 'unrestricted_admin',
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid historian session type' })
    expect(buildPromptMock).not.toHaveBeenCalled()
  })
})
