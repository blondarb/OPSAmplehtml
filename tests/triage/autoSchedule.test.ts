import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { autoScheduleFromTriage } from '@/lib/triage/autoSchedule'
import type { SchedulingAuthorization } from '@/lib/triage/workflowPolicy'

const { fromMock, insertMock, selectMock, singleMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
}))

vi.mock('@/lib/db-query', () => ({
  from: fromMock,
}))

const authorized: SchedulingAuthorization = {
  carePathway: 'expedited_outpatient',
  workflowStatus: 'decision_ready',
  schedulingLocked: false,
  reviewedAt: '2026-07-10T11:00:00.000Z',
  reviewedBy: 'clinician-1',
  finalCarePathway: 'expedited_outpatient',
  finalTriageTier: 'urgent',
  openCriticalClarifications: 0,
  openEmergencyActions: 0,
  coverageStatus: 'complete',
  dataQuality: 'sufficient',
  reviewRequirement: 'none',
}

describe('autoScheduleFromTriage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-10T12:00:00.000Z'))
    vi.clearAllMocks()

    singleMock.mockResolvedValue({
      data: {
        id: 'appointment-123',
        appointment_date: '2026-07-17',
        appointment_type: 'new-consult',
      },
      error: null,
    })
    selectMock.mockReturnValue({ single: singleMock })
    insertMock.mockReturnValue({ select: selectMock })
    fromMock.mockReturnValue({ insert: insertMock })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each([
    [{ ...authorized, carePathway: 'emergency_now' as const }, 'care_pathway_not_outpatient'],
    [{ ...authorized, carePathway: 'undetermined' as const }, 'care_pathway_not_outpatient'],
    [{ ...authorized, schedulingLocked: true }, 'scheduling_locked'],
    [{ ...authorized, reviewedAt: null }, 'clinician_review_incomplete'],
    [{ ...authorized, coverageStatus: 'partial' as const }, 'coverage_incomplete'],
    [{ ...authorized, openCriticalClarifications: 1 }, 'critical_clarification_open'],
    [{ ...authorized, openEmergencyActions: 1 }, 'emergency_action_open'],
  ] as const)(
    'performs no database operation when policy denies the state: %#',
    async (authorization, expectedReason) => {
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      const result = await autoScheduleFromTriage(
        'session-sensitive-id',
        'urgent',
        'patient-sensitive-id',
        ['clinical detail that must not enter a log'],
        'Stroke',
        authorization,
      )

      expect(result).toBeNull()
      expect(fromMock).not.toHaveBeenCalled()
      expect(insertMock).not.toHaveBeenCalled()
      expect(warning).toHaveBeenCalledTimes(1)
      expect(warning).toHaveBeenCalledWith(
        '[autoSchedule] blocked by workflow policy',
        { reason: expectedReason },
      )
      expect(JSON.stringify(warning.mock.calls)).not.toContain('sensitive-id')
      expect(JSON.stringify(warning.mock.calls)).not.toContain('clinical detail')
    },
  )

  it.each(['emergent', 'critical', 'semi_urgent', 'routine'])(
    'does not create an appointment from the legacy %s tier',
    async (tier) => {
      const result = await autoScheduleFromTriage(
        'session-123',
        tier,
        'patient-123',
        [],
        '',
        authorized,
      )

      expect(result).toBeNull()
      expect(fromMock).not.toHaveBeenCalled()
    },
  )

  it('creates one pending-review suggestion only for an authorized urgent outpatient case', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)

    const result = await autoScheduleFromTriage(
      'session-123',
      'urgent',
      'patient-123',
      ['rapid progression'],
      'Neuromuscular',
      authorized,
    )

    expect(result).toEqual({
      id: 'appointment-123',
      appointment_date: '2026-07-17',
      appointment_type: 'new-consult',
    })
    expect(fromMock).toHaveBeenCalledOnce()
    expect(fromMock).toHaveBeenCalledWith('appointments')
    expect(insertMock).toHaveBeenCalledOnce()
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        triage_session_id: 'session-123',
        patient_id: 'patient-123',
        appointment_date: '2026-07-17',
        appointment_type: 'new-consult',
        status: 'pending-review',
        reason_for_visit: 'Neuromuscular',
      }),
    )
  })
})
