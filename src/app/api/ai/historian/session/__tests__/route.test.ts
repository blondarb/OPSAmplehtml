import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/consult/pipeline', () => ({
  getConsult: vi.fn(),
  markHistorianStarted: vi.fn(),
}))
vi.mock('@/lib/secrets', () => ({
  getOpenAIKey: vi.fn(),
  getNovaRelaySharedSecret: vi.fn(),
}))
vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: vi.fn(),
  clinicalAccessDeniedMessage: () => 'Access denied',
}))
vi.mock('@/lib/historian/invitationStore', () => ({
  resolveHistorianPatientGrant: vi.fn(),
  markHistorianInvitationStarted: vi.fn(),
}))

import { POST } from '@/app/api/ai/historian/session/route'
import { getNovaRelaySharedSecret, getOpenAIKey } from '@/lib/secrets'
import { getConsult } from '@/lib/consult/pipeline'
import { authorizeClinicalAccess } from '@/lib/auth/clinicalAccess'
import { __resetPublicRouteGuard } from '@/lib/api/publicRouteGuard'
import {
  markHistorianInvitationStarted,
  resolveHistorianPatientGrant,
} from '@/lib/historian/invitationStore'

const buildReq = (body: Record<string, unknown>, queryString = '', cookie?: string): Request =>
  new Request(`http://localhost/api/ai/historian/session${queryString}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  })

const VOICE_FIELDS = [
  'ephemeralKey',
  'providerSessionId',
  'expiresAt',
  'model',
  'turn_detection_mode',
  'base_instructions',
  'tools',
  'provider',
  'instructions',
  'relayUrl',
  'relayToken',
  'voiceId',
]

describe('POST /api/ai/historian/session — textMode (Historian Validation Suite Task 6)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    __resetPublicRouteGuard()
    vi.mocked(getOpenAIKey).mockResolvedValue('sk-test-key')
    vi.mocked(getNovaRelaySharedSecret).mockResolvedValue('synthetic-relay-secret')
    vi.mocked(getConsult).mockResolvedValue(null)
    vi.mocked(authorizeClinicalAccess).mockResolvedValue({
      ok: true,
      context: { userId: 'clinician-1', email: 'c@example.test', tenantId: 'default', role: 'clinician' },
    })
    vi.mocked(resolveHistorianPatientGrant).mockResolvedValue(null)
    vi.mocked(markHistorianInvitationStarted).mockResolvedValue(true)
    delete process.env.HISTORIAN_TURN_EVIDENCE_CONTROLLER_V1
    delete process.env.HISTORIAN_ADAPTIVE_INTERVIEW_V1
    // mockImplementation (not mockResolvedValue) so each call gets a FRESH
    // Response — a Response body can only be read once, and this test file
    // calls POST multiple times per test against the same mocked fetch.
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ value: 'ek_test_123', expires_at: 1234567890, session_id: 'oai_sess_1' }),
          { status: 200 },
        ),
    )
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('body.textMode === true returns ONLY sessionId + flushToken, with no voice-credential fields, and never calls OpenAI', async () => {
    const res = await POST(buildReq({ sessionType: 'new_patient', textMode: true }))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(typeof json.sessionId).toBe('string')
    expect(json.sessionId.length).toBeGreaterThan(0)
    expect(typeof json.flushToken).toBe('string')

    for (const field of VOICE_FIELDS) {
      expect(json).not.toHaveProperty(field)
    }

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(getOpenAIKey).not.toHaveBeenCalled()
    expect(getConsult).not.toHaveBeenCalled()
  })

  it('?textMode=1 query string also short-circuits to the same minimal shape', async () => {
    const res = await POST(buildReq({ sessionType: 'new_patient' }, '?textMode=1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(typeof json.sessionId).toBe('string')
    expect(typeof json.flushToken).toBe('string')
    expect(Object.keys(json).sort()).toEqual(['flushToken', 'sessionId'])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('mints a fresh sessionId on every textMode call', async () => {
    const first = await (await POST(buildReq({ textMode: true }))).json()
    const second = await (await POST(buildReq({ textMode: true }))).json()
    expect(first.sessionId).not.toBe(second.sessionId)
  })

  it('default (non-textMode) path is unchanged: still returns the full OpenAI voice-session shape', async () => {
    const res = await POST(buildReq({ sessionType: 'new_patient' }))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.provider).toBe('openai')
    expect(json.ephemeralKey).toBe('ek_test_123')
    expect(Array.isArray(json.tools)).toBe(true)
    expect(typeof json.base_instructions).toBe('string')
    expect(typeof json.sessionId).toBe('string')
    expect(typeof json.flushToken).toBe('string')
    expect(json.interviewMode).toBe('standard')
    expect(json.interviewPromptVersion).toBe('standard-v1')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(getOpenAIKey).toHaveBeenCalledTimes(1)
  })

  it('resolves comprehensive mode to Nova with the server-built instructions', async () => {
    const res = await POST(buildReq({ sessionType: 'new_patient', interviewMode: 'comprehensive', provider: 'openai' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.provider).toBe('nova')
    expect(json.instructions).toContain('COMPREHENSIVE MODE — REQUIRED ORDER AND COVERAGE')
    expect(json.instructions).not.toMatch(/Never exceed 25 turns total/)
    expect(json.interviewMode).toBe('comprehensive')
    expect(json.interviewPromptVersion).toBe('comprehensive-v1')
    expect(json.turnEvidenceController).toBe(false)
    expect(getOpenAIKey).not.toHaveBeenCalled()
  })

  it('enables the app-owned question/evidence contract only with the exact server flag', async () => {
    process.env.HISTORIAN_TURN_EVIDENCE_CONTROLLER_V1 = 'true'
    const res = await POST(buildReq({ sessionType: 'new_patient', interviewMode: 'comprehensive' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.provider).toBe('nova')
    expect(json.interviewPromptVersion).toBe('comprehensive-v2')
    expect(json.turnEvidenceController).toBe(true)
    expect(json.instructions).toContain('request_history_question')
    expect(json.tools.map((tool: { toolSpec: { name: string } }) => tool.toolSpec.name)).toEqual([
      'request_history_question',
      'request_interview_control',
      'save_interview_output',
    ])
  })

  it('selects the adaptive conductor and silent-review contract ahead of v2 only with its exact flag', async () => {
    process.env.HISTORIAN_TURN_EVIDENCE_CONTROLLER_V1 = 'true'
    process.env.HISTORIAN_ADAPTIVE_INTERVIEW_V1 = 'true'
    const res = await POST(buildReq({ sessionType: 'new_patient', interviewMode: 'comprehensive' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.provider).toBe('nova')
    expect(json.interviewPromptVersion).toBe('comprehensive-v3')
    expect(json.turnEvidenceController).toBe(false)
    expect(json.adaptiveTurnController).toBe(true)
    expect(json.instructions).toContain('Claude conductor')
    expect(json.instructions).toContain('request_history_question')
    expect(json.instructions).not.toContain('fixed question plan')
    expect(json.tools.map((tool: { toolSpec: { name: string } }) => tool.toolSpec.name)).toEqual([
      'request_history_question',
      'request_interview_control',
      'save_interview_output',
    ])
  })

  it('fails closed to standard mode for an unknown interviewMode', async () => {
    const res = await POST(buildReq({ sessionType: 'new_patient', interviewMode: 'unlimited' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.base_instructions).toMatch(/Never exceed 25 turns total/)
    expect(json.base_instructions).not.toContain('COMPREHENSIVE MODE — REQUIRED ORDER AND COVERAGE')
    expect(json.interviewMode).toBe('standard')
    expect(json.interviewPromptVersion).toBe('standard-v1')
  })

  it('rejects anonymous comprehensive mode before minting voice credentials', async () => {
    vi.mocked(authorizeClinicalAccess).mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })
    const res = await POST(buildReq({ sessionType: 'new_patient', interviewMode: 'comprehensive' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Access denied', reason: 'unauthenticated' })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(getOpenAIKey).not.toHaveBeenCalled()
  })

  it('uses the one-time patient grant as the sole authority for an invited Comprehensive Nova session', async () => {
    vi.mocked(resolveHistorianPatientGrant).mockResolvedValueOnce({
      inviteId: 'invite-1',
      tenantId: 'tenant-a',
      consultId: 'consult-1',
      patientId: 'patient-1',
      sessionId: '11111111-1111-4111-8111-111111111111',
      patientName: 'Synthetic Patient',
      referralReason: 'Progressive gait difficulty',
      sessionType: 'new_patient',
      provider: 'nova',
      interviewMode: 'comprehensive',
      interviewPromptVersion: 'comprehensive-v1',
      status: 'redeemed',
      grantExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    })

    const res = await POST(buildReq({
      sessionType: 'follow_up',
      interviewMode: 'standard',
      provider: 'openai',
      referralReason: 'attacker supplied',
      consult_id: 'attacker-consult',
    }, '', 'historian_patient_grant=opaque-grant'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.provider).toBe('nova')
    expect(json.sessionId).toBe('11111111-1111-4111-8111-111111111111')
    expect(json.consult_id).toBe('consult-1')
    expect(json.interviewMode).toBe('comprehensive')
    expect(json.interviewPromptVersion).toBe('comprehensive-v1')
    expect(json.instructions).toContain('Progressive gait difficulty')
    expect(json.instructions).not.toContain('attacker supplied')
    expect(authorizeClinicalAccess).not.toHaveBeenCalled()
    expect(markHistorianInvitationStarted).toHaveBeenCalledTimes(1)
    const startupAttemptId = vi.mocked(markHistorianInvitationStarted).mock.calls[0][1]
    expect(startupAttemptId).toMatch(/^[0-9a-f-]{36}$/i)
    const verifiedPayload = JSON.parse(
      Buffer.from(json.flushToken.split('.')[0], 'base64url').toString('utf8'),
    )
    expect(verifiedPayload).toMatchObject({
      sessionId: '11111111-1111-4111-8111-111111111111',
      startupAttemptId,
    })
  })

  it('starts an invited Comprehensive v4 session with the adaptive controller', async () => {
    vi.mocked(resolveHistorianPatientGrant).mockResolvedValueOnce({
      inviteId: 'invite-v4', tenantId: 'tenant-a', consultId: 'consult-v4', patientId: 'patient-v4',
      sessionId: '44444444-4444-4444-8444-444444444444', patientName: 'Synthetic Patient',
      referralReason: 'Synthetic episodic loss of awareness', sessionType: 'new_patient', provider: 'nova',
      interviewMode: 'comprehensive', interviewPromptVersion: 'comprehensive-v4',
      status: 'redeemed', grantExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    })

    const res = await POST(buildReq({}, '', 'historian_patient_grant=opaque-grant'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.interviewPromptVersion).toBe('comprehensive-v4')
    expect(json.adaptiveTurnController).toBe(true)
    expect(json.turnEvidenceController).toBe(false)
    expect(json.provider).toBe('nova')
    expect(json.instructions).toContain('Claude conductor')
  })

  it('fails closed when a patient grant cookie is present but invalid', async () => {
    vi.mocked(resolveHistorianPatientGrant).mockResolvedValueOnce(null)
    const res = await POST(buildReq(
      { interviewMode: 'standard' },
      '',
      'historian_patient_grant=expired-grant',
    ))
    expect(res.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not restart an in-progress invited session after refresh', async () => {
    vi.mocked(resolveHistorianPatientGrant).mockResolvedValueOnce({
      inviteId: 'invite-1', tenantId: 'tenant-a', consultId: 'consult-1', patientId: 'patient-1',
      sessionId: '11111111-1111-4111-8111-111111111111', patientName: 'Synthetic Patient',
      referralReason: 'Gait concern', sessionType: 'new_patient', provider: 'nova',
      interviewMode: 'comprehensive', interviewPromptVersion: 'comprehensive-v1',
      status: 'in_progress', grantExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    const res = await POST(buildReq({}, '', 'historian_patient_grant=opaque-grant'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/interrupted/i)
    expect(markHistorianInvitationStarted).not.toHaveBeenCalled()
  })

  it('false-y textMode values (absent, false, "0") do not trigger the short-circuit', async () => {
    const res1 = await POST(buildReq({ sessionType: 'new_patient', textMode: false }))
    const json1 = await res1.json()
    expect(json1.provider).toBe('openai')

    const res2 = await POST(buildReq({ sessionType: 'new_patient' }, '?textMode=0'))
    const json2 = await res2.json()
    expect(json2.provider).toBe('openai')
  })
})
