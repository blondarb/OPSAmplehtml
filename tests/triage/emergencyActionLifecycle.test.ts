import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPoolMock, connectMock, queryMock, releaseMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import {
  claimEmergencyAction,
  closeEmergencyAction,
  recordEmergencyContactAttempt,
} from '@/lib/triage/emergencyActionLifecycle'

const base = {
  triageSessionId: 'triage-1',
  actionId: 'action-1',
  tenantId: 'tenant-1',
  actorUserId: 'clinician-1',
  actorRole: 'clinician' as const,
  idempotencyKey: 'request-0001',
}

const contact = {
  ...base,
  channel: 'patient_phone' as const,
  instructionGiven: 'Proceed for immediate emergency evaluation.',
  deliveryStatus: 'failed' as const,
  understandingStatus: 'not_confirmed' as const,
  outcomeCode: 'no_answer' as const,
  outcomeSummary: 'No answer after synthetic contact attempt.',
}

const completeContactRow = {
  id: 'action-1',
  triage_session_id: 'triage-1',
  status: 'handed_off',
  owner_user_id: 'clinician-1',
  owner_team: 'neurology_triage',
  contact_attempted_at: new Date('2026-07-11T12:00:00Z'),
  contact_channel: 'emergency_services',
  instruction_given: 'Proceed for immediate emergency evaluation.',
  delivery_status: 'not_applicable',
  understanding_status: 'not_applicable',
  outcome: 'Emergency services activated.',
  closure_code: null,
  closed_at: null,
  actor_role: 'clinician',
}

function actionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'action-1',
    triage_session_id: 'triage-1',
    status: 'open',
    owner_user_id: null,
    owner_team: 'neurology_triage',
    contact_attempted_at: null,
    contact_channel: null,
    instruction_given: null,
    delivery_status: 'unknown',
    understanding_status: 'unknown',
    outcome: null,
    closure_code: null,
    closed_at: null,
    actor_role: 'clinician',
    ...overrides,
  }
}

function installDefaultDb(row = actionRow()) {
  queryMock.mockImplementation(async (sql: string) => {
    if (
      sql.includes('FROM triage_emergency_actions action') &&
      sql.includes('FOR UPDATE')
    ) {
      return { rows: [row], rowCount: 1 }
    }
    if (sql.includes('FROM triage_workflow_events')) {
      return { rows: [], rowCount: 0 }
    }
    return { rows: [], rowCount: 1 }
  })
}

describe('emergency action lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ connect: connectMock })
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock })
    installDefaultDb()
  })

  it('claims an action under a tenant and active-membership row lock, then appends an audit event', async () => {
    await expect(claimEmergencyAction(base)).resolves.toMatchObject({
      ok: true,
      replayed: false,
      action: { id: 'action-1', ownerUserId: 'clinician-1' },
    })

    const lockSql = String(
      queryMock.mock.calls.find(([sql]) =>
        String(sql).includes('FOR UPDATE'),
      )?.[0],
    )
    expect(lockSql).toContain('JOIN triage_sessions session')
    expect(lockSql).toContain('session.tenant_id = $3')
    expect(lockSql).toContain('JOIN clinical_access_memberships membership')
    expect(lockSql).toContain("membership.role IN ('clinician', 'admin')")
    expect(lockSql).toContain('FOR UPDATE OF action')
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE triage_emergency_actions'),
      ),
    ).toBe(true)
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO triage_workflow_events'),
      ),
    ).toBe(true)
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE triage_workflow_events'),
      ),
    ).toBe(false)
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
    expect(releaseMock).toHaveBeenCalledOnce()
  })

  it('does not reveal or mutate an action outside the authoritative tenant', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [], rowCount: 0 }
      return { rows: [], rowCount: 1 }
    })

    await expect(claimEmergencyAction(base)).resolves.toEqual({
      ok: false,
      reason: 'action_not_found',
    })

    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE triage_emergency_actions'),
      ),
    ).toBe(false)
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
  })

  it('does not let a second clinician silently take ownership', async () => {
    installDefaultDb(actionRow({ owner_user_id: 'clinician-2' }))

    await expect(claimEmergencyAction(base)).resolves.toEqual({
      ok: false,
      reason: 'action_owned_by_another',
    })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
  })

  it('replays an identical claim idempotently without a second update or event', async () => {
    installDefaultDb(actionRow({ owner_user_id: 'clinician-1' }))
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) {
        return {
          rows: [actionRow({ owner_user_id: 'clinician-1' })],
          rowCount: 1,
        }
      }
      if (sql.includes('FROM triage_workflow_events')) {
        return {
          rows: [
            {
              event_type: 'emergency_action_claimed',
              reason: JSON.stringify({
                operation: 'claim',
                actor_user_id: 'clinician-1',
              }),
              new_state: 'open',
            },
          ],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(claimEmergencyAction(base)).resolves.toMatchObject({
      ok: true,
      replayed: true,
    })
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE triage_emergency_actions'),
      ),
    ).toBe(false)
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO triage_workflow_events'),
      ),
    ).toBe(false)
  })

  it('rejects reuse of an idempotency key with a different payload', async () => {
    installDefaultDb(actionRow({ owner_user_id: 'clinician-1' }))
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) {
        return {
          rows: [actionRow({ owner_user_id: 'clinician-1' })],
          rowCount: 1,
        }
      }
      if (sql.includes('FROM triage_workflow_events')) {
        return {
          rows: [
            {
              event_type: 'emergency_contact_attempt_recorded',
              reason: '{"different":"payload"}',
              new_state: 'failed',
            },
          ],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(recordEmergencyContactAttempt(contact)).resolves.toEqual({
      ok: false,
      reason: 'idempotency_conflict',
    })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
  })

  it('requires a valid cross-field contact outcome before opening a transaction', async () => {
    const result = await recordEmergencyContactAttempt({
      ...contact,
      outcomeCode: 'handoff_initiated',
      deliveryStatus: 'failed',
      understandingStatus: 'not_confirmed',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'invalid_contact_evidence',
    })
    expect(getPoolMock).not.toHaveBeenCalled()
  })

  it('requires the actor to own the action before recording contact', async () => {
    installDefaultDb(actionRow({ owner_user_id: null }))

    await expect(recordEmergencyContactAttempt(contact)).resolves.toEqual({
      ok: false,
      reason: 'action_must_be_claimed',
    })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
  })

  it('records a failed contact attempt, preserves evidence in an append-only event, and escalates immediately', async () => {
    installDefaultDb(actionRow({ owner_user_id: 'clinician-1' }))

    await expect(recordEmergencyContactAttempt(contact)).resolves.toMatchObject({
      ok: true,
      replayed: false,
      action: { status: 'failed' },
    })

    const updateCall = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE triage_emergency_actions'),
    )
    expect(String(updateCall?.[0])).toContain('contact_attempted_at = now()')
    expect(String(updateCall?.[0])).toContain('next_escalation_at = now()')
    expect(updateCall?.[1]).toEqual(
      expect.arrayContaining([
        'failed',
        'patient_phone',
        'Proceed for immediate emergency evaluation.',
        'failed',
        'not_confirmed',
        'No answer after synthetic contact attempt.',
      ]),
    )
    const eventCall = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO triage_workflow_events'),
    )
    expect(JSON.stringify(eventCall?.[1])).toContain(
      'emergency_contact_attempt_recorded',
    )
    expect(JSON.stringify(eventCall?.[1])).toContain('no_answer')
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
  })

  it('refuses closure when required contact and disposition evidence is absent', async () => {
    installDefaultDb(
      actionRow({
        owner_user_id: 'clinician-1',
        status: 'attempting_contact',
      }),
    )

    await expect(
      closeEmergencyAction({
        ...base,
        dispositionCode: 'emergency_evaluation_handoff_confirmed',
        dispositionEvidence: 'Synthetic emergency evaluation handoff confirmed.',
        recipientOrAgency: 'Emergency department charge clinician',
        destination: 'Synthetic emergency department',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'disposition_evidence_incomplete',
    })
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes("SET status = 'closed'"),
      ),
    ).toBe(false)
  })

  it('does not accept patient contact as evidence of a referring-clinician handoff', async () => {
    installDefaultDb({
      ...completeContactRow,
      contact_channel: 'patient_phone',
      delivery_status: 'delivered',
      understanding_status: 'confirmed',
    })

    await expect(
      closeEmergencyAction({
        ...base,
        dispositionCode: 'referring_clinician_handoff_confirmed',
        dispositionEvidence:
          'Synthetic referring-clinician handoff was asserted.',
        recipientOrAgency: 'Synthetic referring clinician',
        destination: 'Synthetic referring practice',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'disposition_evidence_incomplete',
    })
  })

  it('closes only with complete disposition evidence and appends clinician sign-off', async () => {
    installDefaultDb(completeContactRow)

    const input = {
      ...base,
      dispositionCode: 'emergency_services_handoff_confirmed' as const,
      dispositionEvidence: 'Synthetic EMS handoff was confirmed by the responding team.',
      recipientOrAgency: 'Responding emergency services unit',
      destination: 'Synthetic emergency department',
    }
    await expect(closeEmergencyAction(input)).resolves.toMatchObject({
      ok: true,
      replayed: false,
      action: { status: 'closed' },
    })

    const updateCall = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes("SET status = 'closed'"),
    )
    expect(String(updateCall?.[0])).toContain('reviewed_by = $')
    expect(String(updateCall?.[0])).toContain('reviewed_at = now()')
    expect(String(updateCall?.[0])).toContain('closed_at = now()')
    expect(updateCall?.[1]).toEqual(
      expect.arrayContaining([
        'emergency_services_handoff_confirmed',
        'clinician-1',
      ]),
    )
    const eventCall = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO triage_workflow_events'),
    )
    expect(JSON.stringify(eventCall?.[1])).toContain('emergency_action_closed')
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE triage_sessions'),
      ),
    ).toBe(false)
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
  })

  it('replays an identical close after closure without rewriting immutable evidence', async () => {
    const closeReason = JSON.stringify({
      operation: 'close',
      disposition_code: 'emergency_services_handoff_confirmed',
      disposition_evidence:
        'Synthetic EMS handoff was confirmed by the responding team.',
      recipient_or_agency: 'Responding emergency services unit',
      destination: 'Synthetic emergency department',
    })
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) {
        return {
          rows: [
            {
              ...completeContactRow,
              status: 'closed',
              closure_code: 'emergency_services_handoff_confirmed',
              closed_at: new Date('2026-07-11T12:05:00Z'),
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('FROM triage_workflow_events')) {
        return {
          rows: [
            {
              event_type: 'emergency_action_closed',
              reason: closeReason,
              new_state: 'closed',
            },
          ],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      closeEmergencyAction({
        ...base,
        dispositionCode: 'emergency_services_handoff_confirmed',
        dispositionEvidence:
          'Synthetic EMS handoff was confirmed by the responding team.',
        recipientOrAgency: 'Responding emergency services unit',
        destination: 'Synthetic emergency department',
      }),
    ).resolves.toMatchObject({ ok: true, replayed: true })
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE triage_emergency_actions'),
      ),
    ).toBe(false)
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO triage_workflow_events'),
      ),
    ).toBe(false)
  })

  it('rolls back atomically and returns a sanitized failure on persistence error', async () => {
    installDefaultDb(actionRow())
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('FOR UPDATE')) return { rows: [actionRow()], rowCount: 1 }
      if (sql.includes('FROM triage_workflow_events')) {
        return { rows: [], rowCount: 0 }
      }
      throw new Error('synthetic database detail must not escape')
    })

    await expect(claimEmergencyAction(base)).resolves.toEqual({
      ok: false,
      reason: 'persistence_failed',
    })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
    expect(releaseMock).toHaveBeenCalledOnce()
  })

  it('returns a sanitized failure when the database pool is unavailable', async () => {
    getPoolMock.mockRejectedValueOnce(
      new Error('synthetic credential detail must not escape'),
    )

    await expect(claimEmergencyAction(base)).resolves.toEqual({
      ok: false,
      reason: 'persistence_failed',
    })
  })
})
