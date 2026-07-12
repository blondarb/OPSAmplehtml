import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  buildPromptMock,
  getPoolMock,
  queryMock,
  loadSchedulingMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  buildPromptMock: vi.fn(() => 'Server-approved follow-up instructions'),
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
  loadSchedulingMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/follow-up/systemPrompt', () => ({
  buildFollowUpVoicePrompt: buildPromptMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/triage/schedulingAuthorization', () => ({
  loadSchedulingAuthorization: loadSchedulingMock,
}))

import { computeNovaRelayConfigDigest } from '@/lib/voice/novaRelayAuth'
import { POST } from '../route'

function request(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/follow-up/realtime-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'nova',
      patient_context: {
        id: 'demo-followup-001',
        name: 'Client-supplied name must be ignored',
        medications: [],
      },
      ...body,
    }),
  })
}

describe('follow-up realtime capability authorization', () => {
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
    loadSchedulingMock.mockResolvedValue({
      authorization: {},
      decision: { allowed: true },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects unauthenticated capability requests before database or model access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await POST(request())

    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
    expect(buildPromptMock).not.toHaveBeenCalled()
  })

  it('resolves demo context on the server and binds the Nova token to it', async () => {
    vi.stubEnv('NOVA_RELAY_SHARED_SECRET', 'test-shared-secret')
    vi.stubEnv('NOVA_SONIC_VOICE_ID', 'tiffany')
    vi.stubEnv('NOVA_SONIC_RELAY_URL', 'wss://relay.example.test')

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(buildPromptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'demo-followup-001',
        name: 'Maria Santos',
      }),
    )
    const body = await response.json()
    const [payloadB64] = body.relayToken.split('.')
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
    expect(body.sessionType).toBe('follow_up')
    expect(payload.configDigest).toBe(
      computeNovaRelayConfigDigest({
        instructions: body.instructions,
        tools: body.tools,
        voiceId: body.voiceId,
        sessionType: body.sessionType,
      }),
    )
  })

  it('rejects arbitrary client-supplied patient context outside a bound session', async () => {
    const response = await POST(
      request({
        patient_context: {
          id: 'patient-1',
          name: 'Injected Patient Context',
        },
      }),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      reason: 'follow_up_context_not_authoritative',
    })
    expect(buildPromptMock).not.toHaveBeenCalled()
  })

  it('blocks capability issuance when a bound consult triage authorization is revoked', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'session-1',
          patient_id: 'patient-1',
          patient_name: 'Authoritative Patient',
          patient_age: 55,
          patient_gender: 'female',
          diagnosis: 'Neurological consultation',
          visit_date: '2026-07-11',
          provider_name: 'Synthetic Clinician',
          medications: [],
          visit_summary: 'Authoritative summary',
          tenant_patient_id: 'patient-1',
          consult_id: 'consult-1',
          triage_session_id: 'triage-1',
        },
      ],
    })
    loadSchedulingMock.mockResolvedValueOnce({
      authorization: null,
      decision: { allowed: false, reason: 'emergency_action_open' },
    })

    const response = await POST(
      request({ session_id: 'session-1', patient_context: undefined }),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ reason: 'emergency_action_open' })
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('fs.tenant_id = $2'),
      ['session-1', 'tenant-1'],
    )
    expect(buildPromptMock).not.toHaveBeenCalled()
  })
})
