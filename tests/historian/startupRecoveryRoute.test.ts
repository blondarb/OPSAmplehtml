import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyFlushToken: vi.fn(),
  recoverHistorianInvitationStartup: vi.fn(),
}))

vi.mock('@/lib/historian/flushToken', () => ({
  verifyFlushToken: mocks.verifyFlushToken,
}))
vi.mock('@/lib/historian/invitationStore', () => ({
  recoverHistorianInvitationStartup: mocks.recoverHistorianInvitationStartup,
}))

import { POST } from '@/app/api/ai/historian/startup-recovery/route'

function request(body: unknown, token = 'synthetic-recovery-token') {
  return new Request('https://example.test/api/ai/historian/startup-recovery', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

describe('Historian startup recovery route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requires a signed token bound to the exact session', async () => {
    mocks.verifyFlushToken.mockResolvedValue({
      sessionId: 'session-1',
      startupAttemptId: '11111111-1111-4111-8111-111111111111',
    })

    const response = await POST(request({
      sessionId: 'session-2',
      reason: 'provider_error',
    }))

    expect(response.status).toBe(403)
    expect(mocks.recoverHistorianInvitationStartup).not.toHaveBeenCalled()
  })

  it('allows only the two transport startup reasons', async () => {
    mocks.verifyFlushToken.mockResolvedValue({
      sessionId: 'session-1',
      startupAttemptId: '11111111-1111-4111-8111-111111111111',
    })

    const response = await POST(request({
      sessionId: 'session-1',
      reason: 'manual_end',
    }))

    expect(response.status).toBe(400)
    expect(mocks.recoverHistorianInvitationStartup).not.toHaveBeenCalled()
  })

  it('reopens an eligible zero-turn invitation without logging identifiers or credentials', async () => {
    mocks.verifyFlushToken.mockResolvedValue({
      sessionId: 'session-1',
      startupAttemptId: '11111111-1111-4111-8111-111111111111',
    })
    mocks.recoverHistorianInvitationStartup.mockResolvedValue({
      ok: true,
      recovered: true,
      replayed: false,
    })

    const response = await POST(request({
      sessionId: 'session-1',
      reason: 'provider_error',
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ recovered: true })
    expect(mocks.recoverHistorianInvitationStartup).toHaveBeenCalledWith(
      'session-1',
      '11111111-1111-4111-8111-111111111111',
      'provider_error',
    )
    const logged = JSON.stringify(vi.mocked(console.info).mock.calls)
    expect(logged).toContain('zero_turn_invitation_reopened')
    expect(logged).not.toContain('session-1')
    expect(logged).not.toContain('synthetic-recovery-token')
  })

  it('rejects a legacy token without an attempt binding', async () => {
    mocks.verifyFlushToken.mockResolvedValue({ sessionId: 'session-1' })

    const response = await POST(request({
      sessionId: 'session-1',
      reason: 'provider_error',
    }))

    expect(response.status).toBe(403)
    expect(mocks.recoverHistorianInvitationStartup).not.toHaveBeenCalled()
  })
})
