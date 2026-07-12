import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock, insertMock, selectMock, singleMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
}))

vi.mock('@/lib/db-query', () => ({ from: fromMock }))

import {
  notifyHistorianSafetyEscalation,
  notifyTriageUrgent,
} from '../notifications'

describe('clinical safety notification tenant binding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    singleMock.mockResolvedValue({
      data: { id: 'notification-1', tenant_id: 'tenant-1' },
      error: null,
    })
    selectMock.mockReturnValue({ single: singleMock })
    insertMock.mockReturnValue({ select: selectMock })
    fromMock.mockReturnValue({ insert: insertMock })
  })

  it('uses the authoritative triage tenant for an urgent alert', async () => {
    await notifyTriageUrgent(
      'triage-1',
      'emergent',
      'Emergent',
      'Synthetic current focal deficit',
      'patient-1',
      'tenant-1',
    )

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        patient_id: 'patient-1',
        source_id: 'triage-1',
      }),
    )
  })

  it('uses the authoritative Historian tenant for a safety escalation', async () => {
    await notifyHistorianSafetyEscalation(
      'historian-1',
      'Synthetic Patient',
      [{ flag: 'Synthetic red flag', severity: 'critical', context: 'current' }],
      'patient-1',
      'tenant-1',
    )

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        patient_id: 'patient-1',
        source_id: 'historian-1',
      }),
    )
  })
})
