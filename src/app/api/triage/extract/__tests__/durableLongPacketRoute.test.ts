import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authorizeMock,
  fromMock,
  insertMock,
  selectMock,
  singleMock,
  updateMock,
  eqMock,
  getPoolMock,
  initializeMock,
  serviceFactoryMock,
  runInBackgroundMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn(),
  getPoolMock: vi.fn(),
  initializeMock: vi.fn(),
  serviceFactoryMock: vi.fn(),
  runInBackgroundMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/triage/asyncRunner', () => ({
  runInBackground: runInBackgroundMock,
}))
vi.mock('@/lib/triage/longPacketDurableWork', () => ({
  createPostgresLongPacketDurableWorkService: serviceFactoryMock,
}))

import { POST } from '../route'

function request(text: string) {
  return new Request('http://localhost/api/triage/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
}

describe('durable long-packet route handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TRIAGE_LONG_PACKET_DURABLE_ENABLED = 'true'
    delete process.env.TRIAGE_LONG_PACKET_MAX_ATTEMPTS
    authorizeMock.mockResolvedValue({
      ok: true,
      context: {
        userId: 'clinician-1',
        tenantId: 'tenant-1',
        role: 'clinician',
      },
    })
    singleMock.mockResolvedValue({ data: { id: 'extraction-1' }, error: null })
    selectMock.mockReturnValue({ single: singleMock })
    insertMock.mockReturnValue({ select: selectMock })
    eqMock.mockReturnValue({ eq: eqMock })
    updateMock.mockReturnValue({ eq: eqMock })
    fromMock.mockReturnValue({ insert: insertMock, update: updateMock })
    getPoolMock.mockResolvedValue({ query: vi.fn() })
    initializeMock.mockResolvedValue({
      runId: 'run-1',
      status: 'running',
      created: true,
    })
    serviceFactoryMock.mockReturnValue({ initializeOrGetRun: initializeMock })
  })

  afterEach(() => {
    delete process.env.TRIAGE_LONG_PACKET_DURABLE_ENABLED
    delete process.env.TRIAGE_LONG_PACKET_MAX_ATTEMPTS
  })

  it('creates the exact durable manifest and never launches inline model work', async () => {
    const response = await POST(request('Stable synthetic history. '.repeat(2_100)))
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(initializeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionId: 'extraction-1',
        tenantId: 'tenant-1',
        runPurpose: 'primary',
        sourceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        plan: expect.objectContaining({ chunks: expect.any(Array) }),
        configuration: expect.objectContaining({
          plannerVersion: 'neurology-long-packet-planner-v1',
          pipelineVersion: 'neurology-long-packet-model-pipeline-v1',
          mapperModelId:
            'us.anthropic.claude-haiku-4-5-20251001-v1:0',
          safetyModelId: 'us.anthropic.claude-sonnet-5',
          reducerModelId: 'us.anthropic.claude-sonnet-4-6',
          maxAttempts: 3,
        }),
      }),
    )
    expect(runInBackgroundMock).not.toHaveBeenCalled()
    expect(body).toMatchObject({
      status: 'pending',
      processing_mode: 'durable_distributed',
      durable_run_id: 'run-1',
    })
  })

  it('fails visibly and records an extraction error when manifest creation fails', async () => {
    initializeMock.mockRejectedValueOnce(new Error('synthetic persistence failure'))

    const response = await POST(request('Stable synthetic history. '.repeat(2_100)))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      reason: 'durable_long_packet_unavailable',
      extraction_id: 'extraction-1',
      immediate_action_required: false,
      outpatient_scoring_blocked: true,
      human_review_required: true,
      safety_triage_session_id: null,
    })
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        error_message: expect.stringMatching(/manual review/i),
      }),
    )
    expect(runInBackgroundMock).not.toHaveBeenCalled()
  })
})
