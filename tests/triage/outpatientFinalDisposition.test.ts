import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPoolMock, connectMock, queryMock, releaseMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { finalizeOutpatientDisposition } from '@/lib/triage/outpatientFinalDisposition'

const input = {
  triageSessionId: 'triage-1',
  tenantId: 'tenant-1',
  actorUserId: 'clinician-1',
  actorRole: 'clinician' as const,
  idempotencyKey: 'request-0001',
  finalCarePathway: 'routine_outpatient' as const,
  finalTriageTier: 'routine' as const,
  reviewNote: 'Reviewed the complete synthetic referral and confirmed disposition.',
}

function safeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'triage-1',
    processing_status: 'complete',
    completed_at: new Date('2026-07-11T12:00:00Z'),
    care_pathway: 'routine_outpatient',
    triage_tier: 'routine',
    physician_override_tier: null,
    data_quality: 'sufficient',
    coverage_status: 'complete',
    review_requirement: 'clinician_confirmation',
    workflow_status: 'clinician_review',
    scheduling_locked: true,
    reviewed_by: null,
    reviewed_at: null,
    final_care_pathway: null,
    final_triage_tier: null,
    open_critical_clarifications: 0,
    open_emergency_actions: 0,
    actor_role: 'clinician',
    ...overrides,
  }
}

function installDb(row = safeRow()) {
  queryMock.mockImplementation(async (sql: string) => {
    if (
      sql.includes('FROM triage_sessions session') &&
      sql.includes('FOR UPDATE')
    ) {
      return { rows: [row], rowCount: 1 }
    }
    if (sql.includes('FROM triage_workflow_events')) {
      return { rows: [], rowCount: 0 }
    }
    if (sql.includes('UPDATE triage_sessions')) {
      return { rows: [{ id: 'triage-1' }], rowCount: 1 }
    }
    return { rows: [], rowCount: 1 }
  })
}

describe('finalizeOutpatientDisposition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ connect: connectMock })
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock })
    installDb()
  })

  it('atomically confirms an exact safe outpatient disposition and appends a clinician event', async () => {
    await expect(finalizeOutpatientDisposition(input)).resolves.toEqual({
      ok: true,
      replayed: false,
      disposition: {
        triageSessionId: 'triage-1',
        carePathway: 'routine_outpatient',
        triageTier: 'routine',
        reviewedBy: 'clinician-1',
      },
    })

    const lockCall = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('FOR UPDATE'),
    )
    const lockSql = String(lockCall?.[0])
    expect(lockSql).toContain('session.tenant_id = $2')
    expect(lockSql).toContain('JOIN clinical_access_memberships membership')
    expect(lockSql).toContain("membership.role IN ('clinician', 'admin')")
    expect(lockSql).toContain('FOR UPDATE OF session')
    expect(lockCall?.[1]).toEqual([
      'triage-1',
      'tenant-1',
      'clinician-1',
      'clinician',
    ])

    const updateCall = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE triage_sessions'),
    )
    const updateSql = String(updateCall?.[0])
    expect(updateSql).toContain("review_requirement = 'none'")
    expect(updateSql).toContain("workflow_status = 'decision_ready'")
    expect(updateSql).toContain('scheduling_locked = false')
    expect(updateSql).toContain("processing_status = 'complete'")
    expect(updateSql).toContain("coverage_status = 'complete'")
    expect(updateSql).toContain("data_quality = 'sufficient'")
    expect(updateSql).toContain('NOT EXISTS')
    expect(updateCall?.[1]).toEqual(
      expect.arrayContaining([
        'triage-1',
        'tenant-1',
        'clinician-1',
        'routine_outpatient',
        'routine',
      ]),
    )
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

  it('tenant-locks the triage row and active clinician role without revealing another tenant', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [], rowCount: 0 }
      return { rows: [], rowCount: 1 }
    })

    await expect(finalizeOutpatientDisposition(input)).resolves.toEqual({
      ok: false,
      reason: 'triage_not_found',
    })
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE triage_sessions'),
      ),
    ).toBe(false)
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
  })

  it.each([
    ['pending processing', { processing_status: 'pending' }, 'processing_incomplete'],
    ['missing completion timestamp', { completed_at: null }, 'processing_incomplete'],
    ['partial coverage', { coverage_status: 'partial' }, 'coverage_incomplete'],
    ['failed coverage', { coverage_status: 'failed' }, 'coverage_incomplete'],
    ['partial data', { data_quality: 'partial' }, 'data_quality_not_sufficient'],
    ['insufficient data', { data_quality: 'insufficient' }, 'data_quality_not_sufficient'],
    ['conflicting data', { data_quality: 'conflicting' }, 'data_quality_not_sufficient'],
    ['open critical clarification', { open_critical_clarifications: 1 }, 'critical_clarification_open'],
    ['open emergency action', { open_emergency_actions: 1 }, 'emergency_action_open'],
    ['emergency pathway', { care_pathway: 'emergency_now', triage_tier: 'emergent' }, 'care_pathway_not_outpatient'],
    ['same-day pathway', { care_pathway: 'same_day_clinician_review', triage_tier: 'urgent' }, 'care_pathway_not_outpatient'],
    ['undetermined pathway', { care_pathway: 'undetermined' }, 'care_pathway_not_outpatient'],
    ['redirect pathway', { care_pathway: 'redirect' }, 'care_pathway_not_outpatient'],
    ['immediate review', { review_requirement: 'immediate_clinician_review' }, 'review_state_not_finalizable'],
    ['already unlocked', { scheduling_locked: false }, 'review_state_not_finalizable'],
    ['wrong workflow', { workflow_status: 'patient_clarification' }, 'review_state_not_finalizable'],
  ])('rejects %s', async (_label, overrides, reason) => {
    installDb(safeRow(overrides))

    await expect(finalizeOutpatientDisposition(input)).resolves.toEqual({
      ok: false,
      reason,
    })
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE triage_sessions'),
      ),
    ).toBe(false)
  })

  it('rejects a pathway mismatch instead of rewriting the current pathway', async () => {
    await expect(
      finalizeOutpatientDisposition({
        ...input,
        finalCarePathway: 'expedited_outpatient',
        finalTriageTier: 'urgent',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'final_pathway_mismatch',
    })
  })

  it.each([
    ['urgent to semi-urgent', 'urgent', 'semi_urgent'],
    ['routine to non-urgent', 'routine', 'non_urgent'],
  ] as const)('rejects a downgrade from %s', async (_label, current, requested) => {
    const expedited = current === 'urgent'
    installDb(
      safeRow({
        care_pathway: expedited
          ? 'expedited_outpatient'
          : 'routine_outpatient',
        triage_tier: current,
      }),
    )

    await expect(
      finalizeOutpatientDisposition({
        ...input,
        finalCarePathway: expedited
          ? 'expedited_outpatient'
          : 'routine_outpatient',
        finalTriageTier: requested,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'final_tier_mismatch',
    })
  })

  it('uses an existing escalation override as the effective tier', async () => {
    installDb(
      safeRow({
        care_pathway: 'expedited_outpatient',
        triage_tier: 'routine',
        physician_override_tier: 'urgent',
      }),
    )

    await expect(
      finalizeOutpatientDisposition({
        ...input,
        finalCarePathway: 'expedited_outpatient',
        finalTriageTier: 'urgent',
      }),
    ).resolves.toMatchObject({ ok: true })
  })

  it('does not let a stale less-urgent override lower the original tier', async () => {
    installDb(
      safeRow({
        care_pathway: 'expedited_outpatient',
        triage_tier: 'urgent',
        physician_override_tier: 'semi_urgent',
      }),
    )

    await expect(
      finalizeOutpatientDisposition({
        ...input,
        finalCarePathway: 'expedited_outpatient',
        finalTriageTier: 'semi_urgent',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'final_tier_mismatch',
    })
  })

  it('rejects an internally inconsistent current pathway and effective tier', async () => {
    installDb(
      safeRow({
        care_pathway: 'expedited_outpatient',
        triage_tier: 'routine',
      }),
    )

    await expect(
      finalizeOutpatientDisposition({
        ...input,
        finalCarePathway: 'expedited_outpatient',
        finalTriageTier: 'urgent',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'current_pathway_tier_mismatch',
    })
  })

  it('replays an identical command without rewriting reviewed fields or audit events', async () => {
    const reason = JSON.stringify({
      operation: 'finalize_outpatient',
      final_care_pathway: 'routine_outpatient',
      final_triage_tier: 'routine',
      review_note:
        'Reviewed the complete synthetic referral and confirmed disposition.',
    })
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) {
        return {
          rows: [
            safeRow({
              review_requirement: 'none',
              workflow_status: 'decision_ready',
              scheduling_locked: false,
              reviewed_by: 'clinician-1',
              reviewed_at: new Date('2026-07-11T12:05:00Z'),
              final_care_pathway: 'routine_outpatient',
              final_triage_tier: 'routine',
            }),
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('FROM triage_workflow_events')) {
        return {
          rows: [
            {
              event_type: 'clinician_outpatient_disposition_finalized',
              reason,
            },
          ],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(finalizeOutpatientDisposition(input)).resolves.toMatchObject({
      ok: true,
      replayed: true,
    })
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE triage_sessions'),
      ),
    ).toBe(false)
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO triage_workflow_events'),
      ),
    ).toBe(false)
  })

  it('rejects an idempotency key replayed with different final evidence', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [safeRow()], rowCount: 1 }
      if (sql.includes('FROM triage_workflow_events')) {
        return {
          rows: [
            {
              event_type: 'clinician_outpatient_disposition_finalized',
              reason: '{"different":"evidence"}',
            },
          ],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(finalizeOutpatientDisposition(input)).resolves.toEqual({
      ok: false,
      reason: 'idempotency_conflict',
    })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
  })

  it('fails closed if the atomic authorization update affects no row', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [safeRow()], rowCount: 1 }
      if (sql.includes('FROM triage_workflow_events')) {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('UPDATE triage_sessions')) {
        return { rows: [], rowCount: 0 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(finalizeOutpatientDisposition(input)).resolves.toEqual({
      ok: false,
      reason: 'authorization_changed',
    })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
  })

  it('sanitizes database failures and rolls back without an event', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }
      if (sql.includes('FOR UPDATE')) return { rows: [safeRow()], rowCount: 1 }
      if (sql.includes('FROM triage_workflow_events')) {
        return { rows: [], rowCount: 0 }
      }
      throw new Error('synthetic database detail must not escape')
    })

    await expect(finalizeOutpatientDisposition(input)).resolves.toEqual({
      ok: false,
      reason: 'persistence_failed',
    })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
    expect(releaseMock).toHaveBeenCalledOnce()
  })

  it('sanitizes pool acquisition failure', async () => {
    getPoolMock.mockRejectedValueOnce(
      new Error('synthetic credential detail must not escape'),
    )

    await expect(finalizeOutpatientDisposition(input)).resolves.toEqual({
      ok: false,
      reason: 'persistence_failed',
    })
  })
})
