import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resolveGrantMock, queryMock, connectMock, releaseMock, getPoolMock } = vi.hoisted(() => {
  const queryMock = vi.fn()
  const releaseMock = vi.fn()
  const connectMock = vi.fn(async () => ({ query: queryMock, release: releaseMock }))
  const getPoolMock = vi.fn(async () => ({ connect: connectMock }))
  return { resolveGrantMock: vi.fn(), queryMock, connectMock, releaseMock, getPoolMock }
})

vi.mock('@/lib/historian/invitationStore', () => ({
  resolveHistorianPatientGrant: resolveGrantMock,
}))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { POST } from '@/app/api/ai/historian/safety-escalation/route'

const binding = {
  inviteId: 'invite-1', tenantId: 'tenant-a', consultId: 'consult-1', patientId: 'patient-1',
  sessionId: 'session-1', patientName: 'Synthetic Patient', referralReason: 'Gait concern',
  sessionType: 'new_patient', provider: 'nova', interviewMode: 'comprehensive',
  interviewPromptVersion: 'comprehensive-v1', status: 'in_progress',
  grantExpiresAt: '2026-08-21T18:00:00.000Z',
}

describe('invited historian immediate safety escalation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('persists the safety state and an idempotent critical alert in the bound tenant transaction', async () => {
    resolveGrantMock.mockResolvedValueOnce(binding)
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('FOR UPDATE OF session, invite')) return { rows: [{ id: 'session-1' }], rowCount: 1 }
      if (sql.includes('UPDATE historian_sessions')) return { rows: [], rowCount: 1 }
      if (sql.includes('FROM notifications')) return { rows: [], rowCount: 0 }
      if (sql.includes('INSERT INTO notifications')) return { rows: [], rowCount: 1 }
      throw new Error(`Unexpected SQL: ${sql}`)
    })
    const response = await POST(new Request('https://example.test/api/ai/historian/safety-escalation', {
      method: 'POST',
      headers: { Cookie: 'historian_patient_grant=verified-grant', 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1', tenantId: 'attacker-tenant' }),
    }))
    expect(response.status).toBe(200)
    const alertInsert = queryMock.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO notifications'))
    expect(alertInsert?.[1]?.[0]).toBe('tenant-a')
    expect(alertInsert?.[1]?.[1]).toBe('session-1')
    expect(alertInsert?.[1]).not.toContain('attacker-tenant')
    expect(queryMock.mock.calls.at(-1)?.[0]).toBe('COMMIT')
  })

  it('fails closed without a verified invitation grant', async () => {
    resolveGrantMock.mockResolvedValueOnce(null)
    const response = await POST(new Request('https://example.test/api/ai/historian/safety-escalation', {
      method: 'POST', body: JSON.stringify({ sessionId: 'session-1' }),
    }))
    expect(response.status).toBe(401)
    expect(getPoolMock).not.toHaveBeenCalled()
  })
})
