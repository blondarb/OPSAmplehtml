import { beforeEach, describe, expect, it, vi } from 'vitest'

import { startOrReuseTriageSession } from '@/lib/triage/sessionStart'

const { getPoolMock, connectMock, queryMock, releaseMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

const baseInput = {
  tenantId: 'tenant-1',
  referralText: 'Synthetic referral text with sufficient length for triage.',
  sourceType: 'pdf' as const,
  modelProfile: 'test-model',
  coverageStatus: 'complete' as const,
}

function mockExistingSourceSession(input: {
  processingStatus: 'pending' | 'complete' | 'error'
  leaseActive: boolean
  processingAttemptCount?: number
  patientId?: string | null
  consultId?: string | null
  consultPatientId?: string | null
}) {
  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM triage_extractions')) {
      return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
    }
    if (sql.includes('FROM triage_sessions')) {
      return {
        rows: [
          {
            id: 'triage-bound',
            processing_status: input.processingStatus,
            lease_active: input.leaseActive,
            processing_attempt_count: input.processingAttemptCount ?? 1,
            patient_id: input.patientId ?? null,
            consult_id: input.consultId ?? null,
          },
        ],
        rowCount: 1,
      }
    }
    if (sql.includes('FROM patients')) {
      return { rows: [{ id: 'patient-validated' }], rowCount: 1 }
    }
    if (sql.includes('FROM neurology_consults')) {
      return {
        rows: [{
          id: 'consult-validated',
          patient_id: input.consultPatientId ?? input.patientId ?? null,
        }],
        rowCount: 1,
      }
    }
    if (sql.includes('UPDATE triage_sessions')) {
      return { rows: [{ id: 'triage-bound' }], rowCount: 1 }
    }
    return { rows: [], rowCount: 1 }
  })
}

describe('startOrReuseTriageSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ connect: connectMock })
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock })
    queryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes('FROM triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM triage_sessions')) {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('FROM patients')) {
        return { rows: [{ id: 'patient-validated' }], rowCount: 1 }
      }
      if (sql.includes('FROM neurology_consults')) {
        const consultId = String(values?.[0] ?? '')
        return {
          rows: [{
            id: consultId,
            patient_id:
              consultId === 'consult-established'
                ? 'patient-established'
                : 'patient-validated',
          }],
          rowCount: 1,
        }
      }
      if (sql.includes('INSERT INTO triage_sessions')) {
        return { rows: [{ id: 'triage-new' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })
  })

  it('creates and leases a new session for background processing', async () => {
    await expect(startOrReuseTriageSession(baseInput)).resolves.toEqual({
      ok: true,
      triageSessionId: 'triage-new',
      launchProcessing: true,
      reused: false,
      processingStatus: 'pending',
      processingAttemptCount: 1,
    })

    const insert = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO triage_sessions'),
    )
    expect(String(insert?.[0])).toContain('processing_lease_expires_at')
    expect(
      String(insert?.[0]).match(/processing_claimed_at/g),
    ).toHaveLength(1)
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
  })

  it('establishes patient and explicit consult bindings on a new source session', async () => {
    await startOrReuseTriageSession({
      ...baseInput,
      sourceExtractionId: 'extraction-1',
      patientId: 'patient-established',
      consultId: 'consult-established',
    })

    const insert = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO triage_sessions'),
    )
    expect(String(insert?.[0])).toMatch(/patient_id,[\s\S]+consult_id,/)
    expect(insert?.[1]).toEqual(
      expect.arrayContaining(['patient-established', 'consult-established']),
    )
  })

  it.each([
    ['active pending', 'patient', 'pending', true],
    ['complete', 'patient', 'complete', false],
    ['expired pending retry', 'patient', 'pending', false],
    ['error retry', 'patient', 'error', false],
    ['active pending', 'consult', 'pending', true],
    ['complete', 'consult', 'complete', false],
    ['expired pending retry', 'consult', 'pending', false],
    ['error retry', 'consult', 'error', false],
  ] as const)(
    'rejects a %s source session when the supplied %s binding differs',
    async (_label, binding, processingStatus, leaseActive) => {
      mockExistingSourceSession({
        processingStatus,
        leaseActive,
        patientId: 'patient-established',
        consultId: 'consult-established',
      })

      const result = await startOrReuseTriageSession({
        ...baseInput,
        sourceExtractionId: 'extraction-1',
        patientId:
          binding === 'patient' ? 'patient-different' : 'patient-established',
        consultId:
          binding === 'consult' ? 'consult-different' : 'consult-established',
      })

      expect(result).toEqual({
        ok: false,
        reason: 'source_session_binding_mismatch',
      })
      expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
      expect(
        queryMock.mock.calls.some(([sql]) =>
          String(sql).includes('UPDATE triage_sessions'),
        ),
      ).toBe(false)
    },
  )

  it('rejects an explicit patient bound to an unassigned consult', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM triage_sessions')) {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('FROM neurology_consults')) {
        return {
          rows: [{ id: 'consult-unassigned', patient_id: null }],
          rowCount: 1,
        }
      }
      return { rows: [{ id: 'patient-a' }], rowCount: 1 }
    })

    await expect(
      startOrReuseTriageSession({
        ...baseInput,
        sourceExtractionId: 'extraction-1',
        patientId: 'patient-a',
        consultId: 'consult-unassigned',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'patient_consult_mismatch',
    })
  })

  it('derives and persists the patient from a consult-only first binding', async () => {
    queryMock.mockImplementation(
      async (sql: string) => {
        if (sql.includes('FROM triage_extractions')) {
          return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
        }
        if (sql.includes('FROM triage_sessions')) {
          return { rows: [], rowCount: 0 }
        }
        if (sql.includes('FROM neurology_consults')) {
          return {
            rows: [{ id: 'consult-a', patient_id: 'patient-derived' }],
            rowCount: 1,
          }
        }
        if (sql.includes('FROM patients')) {
          return { rows: [{ id: 'patient-derived' }], rowCount: 1 }
        }
        if (sql.includes('INSERT INTO triage_sessions')) {
          return { rows: [{ id: 'triage-new' }], rowCount: 1 }
        }
        return { rows: [], rowCount: 1 }
      },
    )

    await expect(
      startOrReuseTriageSession({
        ...baseInput,
        sourceExtractionId: 'extraction-1',
        consultId: 'consult-a',
      }),
    ).resolves.toMatchObject({
      ok: true,
      patientId: 'patient-derived',
      consultId: 'consult-a',
    })
    const insert = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO triage_sessions'),
    )
    expect(insert?.[1]).toEqual(
      expect.arrayContaining(['patient-derived', 'consult-a']),
    )
  })

  it('rejects an explicitly supplied consult when the source session has no consult binding', async () => {
    mockExistingSourceSession({
      processingStatus: 'pending',
      processingAttemptCount: 1,
      leaseActive: true,
      patientId: 'patient-established',
      consultId: null,
    })

    await expect(
      startOrReuseTriageSession({
        ...baseInput,
        sourceExtractionId: 'extraction-1',
        patientId: 'patient-established',
        consultId: 'consult-new',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'source_session_binding_mismatch',
    })
  })

  it('atomically establishes supplied bindings on the first unleased ingress claim', async () => {
    mockExistingSourceSession({
      processingStatus: 'pending',
      leaseActive: false,
      processingAttemptCount: 0,
      patientId: null,
      consultId: null,
      consultPatientId: 'patient-first-claim',
    })

    await expect(
      startOrReuseTriageSession({
        ...baseInput,
        sourceExtractionId: 'extraction-1',
        patientId: 'patient-first-claim',
        consultId: 'consult-first-claim',
      }),
    ).resolves.toMatchObject({
      ok: true,
      triageSessionId: 'triage-bound',
      launchProcessing: true,
      reused: true,
      processingStatus: 'pending',
      processingAttemptCount: 1,
    })

    const bindingUpdate = queryMock.mock.calls.find(([sql]) =>
      /UPDATE triage_sessions[\s\S]+SET patient_id/.test(String(sql)),
    )
    expect(String(bindingUpdate?.[0])).toContain('processing_attempt_count = 0')
    expect(String(bindingUpdate?.[0])).toMatch(/consult_id\s*=/)
    expect(bindingUpdate?.[1]).toEqual(
      expect.arrayContaining([
        'patient-first-claim',
        'consult-first-claim',
      ]),
    )
  })

  it('serializes competing first claims so the second patient and consult cannot replace the winner', async () => {
    const existing = {
      id: 'triage-bound',
      processing_status: 'pending' as const,
      lease_active: false,
      processing_attempt_count: 0,
      patient_id: null as string | null,
      consult_id: null as string | null,
    }
    let bindingUpdates = 0
    queryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes('FROM triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM triage_sessions')) {
        return { rows: [{ ...existing }], rowCount: 1 }
      }
      if (sql.includes('FROM patients')) {
        return { rows: [{ id: values?.[0] }], rowCount: 1 }
      }
      if (sql.includes('FROM neurology_consults')) {
        return {
          rows: [{
            id: values?.[0],
            patient_id:
              values?.[0] === 'consult-a' ? 'patient-a' : 'patient-b',
          }],
          rowCount: 1,
        }
      }
      if (/UPDATE triage_sessions[\s\S]+SET patient_id/.test(sql)) {
        bindingUpdates += 1
        existing.patient_id = String(values?.[2])
        existing.consult_id = String(values?.[3])
        return { rows: [{ id: existing.id }], rowCount: 1 }
      }
      if (sql.includes('UPDATE triage_sessions')) {
        existing.processing_attempt_count = 1
        existing.lease_active = true
        return { rows: [{ id: existing.id }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      startOrReuseTriageSession({
        ...baseInput,
        sourceExtractionId: 'extraction-1',
        patientId: 'patient-a',
        consultId: 'consult-a',
      }),
    ).resolves.toMatchObject({ ok: true, launchProcessing: true })
    await expect(
      startOrReuseTriageSession({
        ...baseInput,
        sourceExtractionId: 'extraction-1',
        patientId: 'patient-b',
        consultId: 'consult-b',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'source_session_binding_mismatch',
    })

    expect(bindingUpdates).toBe(1)
    expect(existing).toMatchObject({
      patient_id: 'patient-a',
      consult_id: 'consult-a',
      processing_attempt_count: 1,
    })
  })

  it.each([
    ['leased pending', 'pending', true],
    ['complete', 'complete', false],
    ['errored', 'error', false],
  ] as const)(
    'does not treat an attempt-zero %s row as an eligible first bind',
    async (_label, processingStatus, leaseActive) => {
      mockExistingSourceSession({
        processingStatus,
        leaseActive,
        processingAttemptCount: 0,
        patientId: null,
        consultId: null,
      })

      await expect(
        startOrReuseTriageSession({
          ...baseInput,
          sourceExtractionId: 'extraction-1',
          patientId: 'patient-late',
          consultId: 'consult-late',
        }),
      ).resolves.toEqual({
        ok: false,
        reason: 'source_session_binding_mismatch',
      })
    },
  )

  it.each([
    ['missing patient', 'patient_not_found'],
    ['missing consult', 'consult_not_found'],
    ['patient-consult mismatch', 'patient_consult_mismatch'],
  ] as const)(
    'revalidates a supplied %s binding inside the session transaction',
    async (scenario, expectedReason) => {
      queryMock.mockImplementation(
        async (sql: string, values?: unknown[]) => {
          if (sql.includes('FROM triage_extractions')) {
            return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
          }
          if (sql.includes('FROM triage_sessions')) {
            return { rows: [], rowCount: 0 }
          }
          if (sql.includes('FROM patients')) {
            return scenario === 'missing patient'
              ? { rows: [], rowCount: 0 }
              : { rows: [{ id: values?.[0] }], rowCount: 1 }
          }
          if (sql.includes('FROM neurology_consults')) {
            if (scenario === 'missing consult') {
              return { rows: [], rowCount: 0 }
            }
            return {
              rows: [
                {
                  id: values?.[0],
                  patient_id:
                    scenario === 'patient-consult mismatch'
                      ? 'patient-other'
                      : 'patient-validated',
                },
              ],
              rowCount: 1,
            }
          }
          return { rows: [], rowCount: 1 }
        },
      )

      await expect(
        startOrReuseTriageSession({
          ...baseInput,
          sourceExtractionId: 'extraction-1',
          patientId: 'patient-validated',
          consultId: 'consult-validated',
        }),
      ).resolves.toEqual({ ok: false, reason: expectedReason })

      const validationSql = queryMock.mock.calls
        .map(([sql]) => String(sql))
        .filter(
          (sql) =>
            sql.includes('FROM patients') ||
            sql.includes('FROM neurology_consults'),
        )
      expect(validationSql.length).toBeGreaterThan(0)
      expect(
        validationSql.every((sql) =>
          sql.includes('FROM neurology_consults')
            ? sql.includes('FOR UPDATE')
            : sql.includes('FOR KEY SHARE'),
        ),
      ).toBe(true)
      expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
      expect(
        queryMock.mock.calls.some(([sql]) =>
          String(sql).includes('INSERT INTO triage_sessions'),
        ),
      ).toBe(false)
    },
  )

  it('returns stored patient and consult bindings for a retry whose caller omits them', async () => {
    mockExistingSourceSession({
      processingStatus: 'error',
      leaseActive: false,
      processingAttemptCount: 2,
      patientId: 'patient-stored',
      consultId: 'consult-stored',
    })

    await expect(
      startOrReuseTriageSession({
        ...baseInput,
        sourceExtractionId: 'extraction-1',
      }),
    ).resolves.toMatchObject({
      ok: true,
      launchProcessing: true,
      patientId: 'patient-stored',
      consultId: 'consult-stored',
      processingAttemptCount: 3,
    })
    expect(
      queryMock.mock.calls.some(([sql, values]) =>
        String(sql).includes('FROM patients') &&
        values?.[0] === 'patient-stored',
      ),
    ).toBe(true)
    const consultValidation = queryMock.mock.calls.find(
      ([sql, values]) =>
        String(sql).includes('FROM neurology_consults') &&
        values?.[0] === 'consult-stored',
    )
    expect(String(consultValidation?.[0])).toContain('FOR UPDATE')
  })

  it('rejects an omitted-ID retry after its consult is reassigned', async () => {
    mockExistingSourceSession({
      processingStatus: 'error',
      leaseActive: false,
      processingAttemptCount: 2,
      patientId: 'patient-a',
      consultId: 'consult-a',
      consultPatientId: 'patient-b',
    })

    await expect(
      startOrReuseTriageSession({
        ...baseInput,
        sourceExtractionId: 'extraction-1',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'patient_consult_mismatch',
    })
  })

  it.each([
    ['active pending', 'pending', true, false, 'pending'],
    ['complete', 'complete', false, false, 'complete'],
    ['expired pending retry', 'pending', false, true, 'pending'],
    ['error retry', 'error', false, true, 'pending'],
  ] as const)(
    'reuses a %s source session only with matching patient and consult bindings',
    async (
      _label,
      processingStatus,
      leaseActive,
      launchProcessing,
      returnedStatus,
    ) => {
      mockExistingSourceSession({
        processingStatus,
        leaseActive,
        patientId: 'patient-established',
        consultId: 'consult-established',
      })

      await expect(
        startOrReuseTriageSession({
          ...baseInput,
          sourceExtractionId: 'extraction-1',
          patientId: 'patient-established',
          consultId: 'consult-established',
        }),
      ).resolves.toMatchObject({
        ok: true,
        triageSessionId: 'triage-bound',
        launchProcessing,
        reused: true,
        processingStatus: returnedStatus,
      })

      const selectSql = String(
        queryMock.mock.calls.find(([sql]) =>
          String(sql).includes('FROM triage_sessions'),
        )?.[0],
      )
      expect(selectSql).toContain('patient_id')
      expect(selectSql).toContain('consult_id')
      const reclaimSql = String(
        queryMock.mock.calls.find(([sql]) =>
          String(sql).includes('UPDATE triage_sessions'),
        )?.[0] ?? '',
      )
      expect(reclaimSql).not.toMatch(/\bpatient_id\s*=/)
      expect(reclaimSql).not.toMatch(/\bconsult_id\s*=/)
    },
  )

  it('allows an omitted consult request to reuse a later system-created consult binding', async () => {
    mockExistingSourceSession({
      processingStatus: 'complete',
      leaseActive: false,
      patientId: 'patient-established',
      consultId: 'consult-system-created',
    })

    await expect(
      startOrReuseTriageSession({
        ...baseInput,
        sourceExtractionId: 'extraction-1',
        patientId: 'patient-established',
      }),
    ).resolves.toMatchObject({
      ok: true,
      triageSessionId: 'triage-bound',
      processingStatus: 'complete',
      reused: true,
    })
  })

  it('claims and enriches an existing early safety session without resetting its hold', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM triage_sessions')) {
        return {
          rows: [
            {
              id: 'triage-ingress',
              processing_status: 'pending',
              lease_active: false,
              processing_attempt_count: 0,
              patient_id: null,
              consult_id: null,
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_sessions')) {
        return { rows: [{ id: 'triage-ingress' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      startOrReuseTriageSession({
        ...baseInput,
        sourceExtractionId: 'extraction-1',
        extractedSummary: 'Complete verified packet summary.',
      }),
    ).resolves.toEqual({
      ok: true,
      triageSessionId: 'triage-ingress',
      launchProcessing: true,
      reused: true,
      processingStatus: 'pending',
      processingAttemptCount: 1,
    })

    const updateSql = String(
      queryMock.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE triage_sessions'),
      )?.[0],
    )
    expect(updateSql).not.toContain('care_pathway =')
    expect(updateSql).not.toContain('workflow_status =')
    expect(updateSql).not.toContain('scheduling_locked =')
  })

  it('does not launch a duplicate model run while an active lease exists', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM triage_sessions')) {
        return {
          rows: [
            {
              id: 'triage-ingress',
              processing_status: 'pending',
              lease_active: true,
            },
          ],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 1 }
    })

    const result = await startOrReuseTriageSession({
      ...baseInput,
      sourceExtractionId: 'extraction-1',
    })

    expect(result).toMatchObject({
      ok: true,
      triageSessionId: 'triage-ingress',
      launchProcessing: false,
      reused: true,
    })
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE triage_sessions'),
      ),
    ).toBe(false)
  })

  it('returns the canonical completed session without rerunning models', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM triage_sessions')) {
        return {
          rows: [
            {
              id: 'triage-complete',
              processing_status: 'complete',
              lease_active: false,
            },
          ],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      startOrReuseTriageSession({
        ...baseInput,
        sourceExtractionId: 'extraction-1',
      }),
    ).resolves.toMatchObject({
      triageSessionId: 'triage-complete',
      launchProcessing: false,
      processingStatus: 'complete',
    })
  })

  it('reclaims an errored session for an explicit retry while preserving safety state', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM triage_extractions')) {
        return { rows: [{ id: 'extraction-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM triage_sessions')) {
        return {
          rows: [
            {
              id: 'triage-error',
              processing_status: 'error',
              lease_active: false,
            },
          ],
          rowCount: 1,
        }
      }
      if (sql.includes('UPDATE triage_sessions')) {
        return { rows: [{ id: 'triage-error' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    await expect(
      startOrReuseTriageSession({
        ...baseInput,
        sourceExtractionId: 'extraction-1',
      }),
    ).resolves.toMatchObject({
      triageSessionId: 'triage-error',
      launchProcessing: true,
      reused: true,
    })
  })

  it('fails closed when the tenant-bound source does not exist', async () => {
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes('FROM triage_extractions')
        ? { rows: [], rowCount: 0 }
        : { rows: [], rowCount: 1 },
    )

    await expect(
      startOrReuseTriageSession({
        ...baseInput,
        sourceExtractionId: 'other-tenant-extraction',
      }),
    ).resolves.toEqual({ ok: false, reason: 'source_extraction_not_found' })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
    expect(releaseMock).toHaveBeenCalled()
  })
})
