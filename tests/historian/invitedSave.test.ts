import { beforeEach, describe, expect, it, vi } from 'vitest'

const { queryMock, connectMock, releaseMock, getPoolMock } = vi.hoisted(() => {
  const queryMock = vi.fn()
  const releaseMock = vi.fn()
  const connectMock = vi.fn(async () => ({ query: queryMock, release: releaseMock }))
  const getPoolMock = vi.fn(async () => ({ query: queryMock, connect: connectMock }))
  return { queryMock, connectMock, releaseMock, getPoolMock }
})

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { saveInvitedHistorianSession } from '@/lib/historian/invitedSave'
import type { HistorianInvitationBinding } from '@/lib/historian/invitationStore'
import { COMPREHENSIVE_HISTORY_DOMAINS } from '@/lib/historianTypes'

const binding: HistorianInvitationBinding = {
  inviteId: 'invite-1',
  tenantId: 'tenant-authority',
  consultId: 'consult-authority',
  patientId: 'patient-authority',
  sessionId: 'session-authority',
  patientName: 'Synthetic Patient',
  referralReason: 'Gait concern',
  sessionType: 'new_patient',
  provider: 'nova',
  interviewMode: 'comprehensive',
  interviewPromptVersion: 'comprehensive-v1',
  status: 'in_progress',
  grantExpiresAt: '2026-08-21T18:00:00.000Z',
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: binding.sessionId,
    tenant_id: 'attacker-tenant',
    patient_id: 'attacker-patient',
    consult_id: 'attacker-consult',
    structured_output: {
      chief_complaint: 'Gait concern',
      interview_mode: 'standard',
      history_coverage: {
        covered_domains: COMPREHENSIVE_HISTORY_DOMAINS.map((domain) => domain.id),
        missing_or_uncertain: [],
      },
    },
    narrative_summary: 'Synthetic interview summary.',
    transcript: [
      { role: 'assistant', text: 'Why were you referred?', timestamp: 0, seq: 1 },
      { role: 'user', text: 'Because walking is harder.', timestamp: 2, seq: 2 },
    ],
    red_flags: [],
    duration_seconds: 120,
    question_count: 2,
    interview_completion_status: 'complete',
    ...overrides,
  }
}

describe('invited historian transactional save', () => {
  beforeEach(() => {
    queryMock.mockReset()
    connectMock.mockClear()
    releaseMock.mockClear()
    getPoolMock.mockClear()
  })

  it('accepts the production one-based transcript sequence, updates only bound records, and enqueues DDx work atomically', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('FOR UPDATE OF invite, session')) {
        return {
          rows: [{
            invite_status: 'in_progress',
            session_status: 'in_progress',
            grant_expires_at: '2026-08-21T18:00:00.000Z',
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('INSERT INTO historian_transcript_events')) return { rows: [], rowCount: 2 }
      if (sql.includes('SELECT seq, role, text')) {
        return {
          rows: [
            { seq: 1, role: 'assistant', text: 'Why were you referred?' },
            { seq: 2, role: 'user', text: 'Because walking is harder.' },
          ],
          rowCount: 2,
        }
      }
      if (sql.includes('INSERT INTO historian_eval_jobs')) return { rows: [], rowCount: 1 }
      if (sql.includes('UPDATE historian_') || sql.includes('UPDATE neurology_consults')) {
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    const result = await saveInvitedHistorianSession(
      binding,
      body(),
      new Date('2026-08-20T18:00:00.000Z'),
    )
    expect(result).toMatchObject({
      ok: true,
      replayed: false,
      evaluationStatus: 'pending',
      sessionId: binding.sessionId,
      consultId: binding.consultId,
    })

    const sessionUpdate = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE historian_sessions'),
    )
    expect(sessionUpdate?.[0]).toContain('AND tenant_id = $11')
    expect(sessionUpdate?.[0]).toContain('AND consult_id = $12')
    expect(sessionUpdate?.[1]).toContain(binding.sessionId)
    expect(sessionUpdate?.[1]).toContain(binding.tenantId)
    expect(sessionUpdate?.[1]).toContain(binding.consultId)
    expect(sessionUpdate?.[1]).not.toContain('attacker-tenant')
    expect(sessionUpdate?.[1]).not.toContain('attacker-patient')
    expect(sessionUpdate?.[1]).not.toContain('attacker-consult')
    expect(String(sessionUpdate?.[1]?.[0])).toContain('"interview_mode":"comprehensive"')

    const calls = queryMock.mock.calls.map(([sql]) => String(sql))
    expect(calls.indexOf('COMMIT')).toBeGreaterThan(calls.findIndex((sql) => sql.includes('INSERT INTO historian_eval_jobs')))
    expect(releaseMock).toHaveBeenCalledTimes(1)
  })

  it('returns the original receipt on a network replay and does not enqueue twice', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }
      if (sql.includes('FOR UPDATE OF invite, session')) {
        return {
          rows: [{
            invite_status: 'completed',
            session_status: 'completed',
            grant_expires_at: '2026-08-21T18:00:00.000Z',
          }],
          rowCount: 1,
        }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    const result = await saveInvitedHistorianSession(
      { ...binding, status: 'completed' },
      body(),
      new Date('2026-08-20T18:00:00.000Z'),
    )
    expect(result).toMatchObject({ ok: true, replayed: true, evaluationStatus: 'already_queued' })
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO historian_eval_jobs'))).toBe(false)
  })

  it('rejects a caller-selected session before touching the database', async () => {
    const result = await saveInvitedHistorianSession(binding, body({ sessionId: 'attacker-session' }))
    expect(result).toEqual({ ok: false, status: 409, error: 'Session binding mismatch.' })
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('rejects a zero-based transcript that does not match the production hook contract', async () => {
    const result = await saveInvitedHistorianSession(binding, body({
      transcript: [
        { role: 'assistant', text: 'Why were you referred?', timestamp: 0, seq: 0 },
        { role: 'user', text: 'Because walking is harder.', timestamp: 2, seq: 1 },
      ],
    }))
    expect(result).toEqual({ ok: false, status: 400, error: 'Transcript is malformed.' })
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('rejects a purportedly complete interview whose fixed coverage audit is incomplete', async () => {
    const result = await saveInvitedHistorianSession(binding, body({
      structured_output: {
        chief_complaint: 'Gait concern',
        history_coverage: { covered_domains: [], missing_or_uncertain: [] },
      },
    }))
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('persists a tenant-bound critical alert in the same transaction for safety escalation without model red flags', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('FOR UPDATE OF invite, session')) {
        return { rows: [{
          invite_status: 'in_progress', session_status: 'in_progress',
          grant_expires_at: '2026-08-21T18:00:00.000Z',
        }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO historian_transcript_events')) return { rows: [], rowCount: 2 }
      if (sql.includes('SELECT seq, role, text')) {
        return { rows: [
          { seq: 1, role: 'assistant', text: 'Why were you referred?' },
          { seq: 2, role: 'user', text: 'Because walking is harder.' },
        ], rowCount: 2 }
      }
      if (sql.includes('FROM notifications')) return { rows: [], rowCount: 0 }
      if (sql.includes('INSERT INTO notifications')) return { rows: [], rowCount: 1 }
      if (sql.includes('INSERT INTO historian_eval_jobs')) return { rows: [], rowCount: 1 }
      if (sql.includes('UPDATE historian_') || sql.includes('UPDATE neurology_consults')) {
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    const result = await saveInvitedHistorianSession(
      binding,
      body({ safety_escalated: true, red_flags: [] }),
      new Date('2026-08-20T18:00:00.000Z'),
    )
    expect(result.ok).toBe(true)
    const alertInsert = queryMock.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO notifications'))
    expect(alertInsert?.[1]?.[0]).toBe(binding.tenantId)
    expect(alertInsert?.[1]?.[1]).toBe(binding.sessionId)
    expect(queryMock.mock.calls.indexOf(alertInsert!)).toBeLessThan(
      queryMock.mock.calls.findIndex(([sql]) => sql === 'COMMIT'),
    )
  })
})
