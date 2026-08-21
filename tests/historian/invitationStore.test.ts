import { beforeEach, describe, expect, it, vi } from 'vitest'

const { queryMock, connectMock, releaseMock, getPoolMock } = vi.hoisted(() => {
  const queryMock = vi.fn()
  const releaseMock = vi.fn()
  const connectMock = vi.fn(async () => ({ query: queryMock, release: releaseMock }))
  const getPoolMock = vi.fn(async () => ({ query: queryMock, connect: connectMock }))
  return { queryMock, connectMock, releaseMock, getPoolMock }
})

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import {
  createHistorianInvitation,
  redeemHistorianInvitation,
  resolveHistorianPatientGrant,
} from '@/lib/historian/invitationStore'
import { hashHistorianToken } from '@/lib/historian/invitationTokens'

describe('historian invitation store', () => {
  beforeEach(() => {
    queryMock.mockReset()
    connectMock.mockClear()
    releaseMock.mockClear()
    getPoolMock.mockClear()
  })

  it('redeems a pending token once and persists only hashes for both credentials', async () => {
    const now = new Date('2026-08-20T18:00:00.000Z')
    queryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('FROM historian_invites invite') && sql.includes("invite.status = 'pending'")) {
        expect(values?.[0]).toBe(hashHistorianToken('one-time-invite'))
        return {
          rows: [{
            id: 'invite-1',
            session_id: 'session-1',
            expires_at: '2026-08-21T18:00:00.000Z',
            patient_name: 'Synthetic Patient',
            referral_reason: 'Gait concern',
            session_type: 'new_patient',
            patient_date_of_birth: '1960-04-12',
            verification_attempts: 0,
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE historian_invites')) {
        expect(values?.[2]).toMatch(/^[a-f0-9]{64}$/)
        expect(values?.[2]).not.toBe('one-time-invite')
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    const result = await redeemHistorianInvitation('one-time-invite', '1960-04-12', now)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.grantToken).not.toBe('one-time-invite')
    expect(result.context.interviewMode).toBe('comprehensive')
    expect(result.context.interviewPromptVersion).toBe('comprehensive-v1')
    expect(releaseMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a token that no longer has a pending invitation row', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }
      if (sql.includes('FROM historian_invites invite')) return { rows: [], rowCount: 0 }
      throw new Error(`Unexpected SQL: ${sql}`)
    })
    await expect(redeemHistorianInvitation('already-used', '1960-04-12')).resolves.toEqual({
      ok: false,
      reason: 'invalid_or_expired',
    })
  })

  it('resolves an unexpired browser grant to the server-owned session binding', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        invite_id: 'invite-1',
        tenant_id: 'tenant-a',
        consult_id: 'consult-1',
        patient_id: null,
        session_id: 'session-1',
        patient_name: 'Synthetic Patient',
        referral_reason: 'Gait concern',
        session_type: 'new_patient',
        provider: 'nova',
        interview_mode: 'comprehensive',
        interview_prompt_version: 'comprehensive-v1',
        status: 'redeemed',
        grant_expires_at: '2026-08-21T18:00:00.000Z',
      }],
      rowCount: 1,
    })
    const request = new Request('https://example.test/api/ai/historian/session', {
      headers: { Cookie: 'historian_patient_grant=browser-grant' },
    })
    const result = await resolveHistorianPatientGrant(request)
    expect(result?.sessionId).toBe('session-1')
    expect(result?.tenantId).toBe('tenant-a')
    expect(result?.provider).toBe('nova')
    expect(queryMock.mock.calls[0][1]).toEqual([hashHistorianToken('browser-grant')])
  })

  it('does not replace an unexpired redeemed invitation without an explicit clinician action', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }
      if (sql.includes('FROM neurology_consults consult')) {
        return { rows: [{
          id: 'consult-1', tenant_id: 'tenant-a', patient_id: 'patient-1',
          status: 'historian_pending', triage_chief_complaint: 'Gait concern',
          patient_name: 'Synthetic Patient', patient_date_of_birth: '1960-04-12',
        }], rowCount: 1 }
      }
      if (sql.includes('FROM historian_invites') && sql.includes('FOR UPDATE')) {
        return { rows: [{
          id: 'invite-old', status: 'redeemed', session_id: 'session-old',
          grant_expires_at: '2026-08-20T21:00:00.000Z',
        }], rowCount: 1 }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    await expect(createHistorianInvitation({
      tenantId: 'tenant-a',
      consultId: 'consult-1',
      invitedByUserId: 'clinician-1',
      now: new Date('2026-08-20T18:00:00.000Z'),
    })).resolves.toEqual({ ok: false, reason: 'interview_in_progress' })
  })

  it('expires a stale browser grant and issues a fresh invitation without clinician override', async () => {
    queryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('FROM neurology_consults consult')) {
        return { rows: [{
          id: 'consult-1', tenant_id: 'tenant-a', patient_id: 'patient-1',
          status: 'historian_pending', triage_chief_complaint: 'Gait concern',
          patient_name: 'Synthetic Patient', patient_date_of_birth: '1960-04-12',
        }], rowCount: 1 }
      }
      if (sql.includes('FROM historian_invites') && sql.includes('FOR UPDATE')) {
        return { rows: [{
          id: 'invite-old', status: 'redeemed', session_id: 'session-old',
          grant_expires_at: '2026-08-20T17:59:59.000Z',
        }], rowCount: 1 }
      }
      if (sql.includes('UPDATE historian_invites')) {
        expect(values).toEqual([
          'invite-old', 'expired', new Date('2026-08-20T18:00:00.000Z'),
        ])
        return { rows: [], rowCount: 1 }
      }
      if (sql.includes('UPDATE historian_sessions')) return { rows: [], rowCount: 1 }
      if (sql.includes('INSERT INTO historian_sessions')) {
        return { rows: [{ id: 'session-new' }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO historian_invites')) {
        return { rows: [{ id: 'invite-new' }], rowCount: 1 }
      }
      if (sql.includes('UPDATE neurology_consults')) return { rows: [], rowCount: 1 }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    const result = await createHistorianInvitation({
      tenantId: 'tenant-a',
      consultId: 'consult-1',
      invitedByUserId: 'clinician-1',
      now: new Date('2026-08-20T18:00:00.000Z'),
    })
    expect(result).toMatchObject({ ok: true, inviteId: 'invite-new', sessionId: 'session-new' })
  })

  it('lets an authorized clinician explicitly revoke an abandoned grant and reissue atomically', async () => {
    queryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('FROM neurology_consults consult')) {
        return { rows: [{
          id: 'consult-1', tenant_id: 'tenant-a', patient_id: 'patient-1',
          status: 'historian_pending', triage_chief_complaint: 'Gait concern',
          patient_name: 'Synthetic Patient', patient_date_of_birth: '1960-04-12',
        }], rowCount: 1 }
      }
      if (sql.includes('FROM historian_invites') && sql.includes('FOR UPDATE')) {
        return { rows: [{
          id: 'invite-old', status: 'in_progress', session_id: 'session-old',
          grant_expires_at: '2026-08-20T21:00:00.000Z',
        }], rowCount: 1 }
      }
      if (sql.includes('UPDATE historian_invites')) {
        expect(values).toContain('revoked')
        return { rows: [], rowCount: 1 }
      }
      if (sql.includes('UPDATE historian_sessions')) return { rows: [], rowCount: 1 }
      if (sql.includes('INSERT INTO historian_sessions')) {
        return { rows: [{ id: 'session-new' }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO historian_invites')) {
        return { rows: [{ id: 'invite-new' }], rowCount: 1 }
      }
      if (sql.includes('UPDATE neurology_consults')) return { rows: [], rowCount: 1 }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    const result = await createHistorianInvitation({
      tenantId: 'tenant-a',
      consultId: 'consult-1',
      invitedByUserId: 'clinician-1',
      replaceActive: true,
      now: new Date('2026-08-20T18:00:00.000Z'),
    })
    expect(result).toMatchObject({ ok: true, inviteId: 'invite-new', sessionId: 'session-new' })
  })

  it('does not issue a grant when date of birth does not match and revokes after bounded attempts', async () => {
    queryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('FROM historian_invites invite') && sql.includes("invite.status = 'pending'")) {
        return { rows: [{
          id: 'invite-1', session_id: 'session-1', expires_at: '2026-08-21T18:00:00.000Z',
          patient_name: 'Synthetic Patient', referral_reason: 'Gait concern', session_type: 'new_patient',
          patient_date_of_birth: '1960-04-12', verification_attempts: 4,
        }], rowCount: 1 }
      }
      if (sql.includes('verification_attempts')) {
        expect(values).toEqual(['invite-1', 5, 5, new Date('2026-08-20T18:00:00.000Z')])
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    await expect(redeemHistorianInvitation(
      'one-time-invite',
      '1960-04-13',
      new Date('2026-08-20T18:00:00.000Z'),
    )).resolves.toEqual({ ok: false, reason: 'identity_verification_failed' })
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('grant_token_hash ='))).toBe(false)
  })
})
