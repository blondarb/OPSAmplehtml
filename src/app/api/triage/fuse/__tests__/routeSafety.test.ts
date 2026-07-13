import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authorizeMock, invokeClinicalMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  invokeClinicalMock: vi.fn(),
}))

vi.mock('@/lib/auth/clinicalAccess', () => ({
  authorizeClinicalAccess: authorizeMock,
}))
vi.mock('@/lib/bedrock', () => ({
  invokeBedrockClinicalJSON: invokeClinicalMock,
}))

import { POST } from '../route'

function callPost() {
  return POST(
    new Request('http://localhost/api/triage/fuse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        extractions: [
          { extracted_summary: 'Synthetic source one.' },
          { extracted_summary: 'Synthetic source two.' },
        ],
      }),
    }),
  )
}

describe('triage fusion route safety', () => {
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
    invokeClinicalMock.mockResolvedValue({
      parsed: {
        fused_summary: 'Synthetic fused summary.',
        fusion_confidence: 'high',
        sources_used: ['one', 'two'],
        conflicts_resolved: [],
        timeline_reconstructed: 'Synthetic timeline.',
      },
    })
  })

  it('rejects unauthenticated fusion before any model access', async () => {
    authorizeMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
    })

    const response = await callPost()

    expect(response.status).toBe(401)
    expect(invokeClinicalMock).not.toHaveBeenCalled()
  })

  it('uses the strict complete-output Bedrock path', async () => {
    const response = await callPost()

    expect(response.status).toBe(200)
    expect(invokeClinicalMock).toHaveBeenCalledOnce()
  })
})
