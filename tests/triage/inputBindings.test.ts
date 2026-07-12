import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPoolMock, queryMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { validateTriageInputBindings } from '@/lib/triage/inputBindings'

describe('validateTriageInputBindings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ query: queryMock })
  })

  it('rejects a patient outside the authoritative tenant', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })

    await expect(
      validateTriageInputBindings({
        tenantId: 'tenant-1',
        patientId: 'other-patient',
      }),
    ).resolves.toEqual({ allowed: false, reason: 'patient_not_found' })

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      ['other-patient', 'tenant-1'],
    )
  })

  it('rejects a consult outside the authoritative tenant', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })

    await expect(
      validateTriageInputBindings({
        tenantId: 'tenant-1',
        consultId: 'other-consult',
      }),
    ).resolves.toEqual({ allowed: false, reason: 'consult_not_found' })
  })

  it('rejects inconsistent patient and consult bindings', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'patient-1' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'consult-1', patient_id: 'patient-2' }],
      })

    await expect(
      validateTriageInputBindings({
        tenantId: 'tenant-1',
        patientId: 'patient-1',
        consultId: 'consult-1',
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: 'patient_consult_mismatch',
    })
  })
})
