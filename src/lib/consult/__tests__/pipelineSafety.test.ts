import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPoolMock, queryMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  queryMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

import { linkTriageToConsult } from '@/lib/consult/pipeline'

const update = {
  triage_session_id: 'triage-1',
  triage_urgency: 'urgent' as const,
  triage_tier_display: 'Urgent',
  triage_summary: 'Synthetic triage summary.',
  triage_chief_complaint: 'Synthetic complaint.',
  triage_red_flags: [],
  triage_subspecialty: 'General Neurology',
}

describe('linkTriageToConsult safety binding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ query: queryMock })
  })

  it('atomically requires tenant, expected patient, and null-or-same triage session', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 'consult-1' }],
      rowCount: 1,
    })

    await expect(
      linkTriageToConsult(
        'consult-1',
        update,
        'tenant-1',
        'patient-a',
        4,
      ),
    ).resolves.toBe(true)

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringMatching(/patient_id IS NOT DISTINCT FROM \$4/),
      expect.arrayContaining([
        'consult-1',
        'tenant-1',
        'triage-1',
        'patient-a',
      ]),
    )
    expect(String(queryMock.mock.calls[0][0])).toMatch(
      /triage_session_id IS NULL OR triage_session_id = \$3/,
    )
    expect(String(queryMock.mock.calls[0][0])).toMatch(
      /processing_status = 'pending'/,
    )
    expect(String(queryMock.mock.calls[0][0])).toMatch(
      /processing_attempt_count = \$12/,
    )
    expect(String(queryMock.mock.calls[0][0])).toMatch(
      /session\.patient_id IS NOT DISTINCT FROM \$4/,
    )
    expect(String(queryMock.mock.calls[0][0])).toMatch(
      /session\.consult_id IS NULL[\s\S]+session\.consult_id = \$1/,
    )
    expect(queryMock.mock.calls[0][1]).toContain(4)
  })

  it('rejects linkage after the consult is reassigned to another patient', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 })

    await expect(
      linkTriageToConsult(
        'consult-1',
        update,
        'tenant-1',
        'patient-a',
        4,
      ),
    ).resolves.toBe(false)
  })
})
