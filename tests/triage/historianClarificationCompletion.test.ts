import { beforeEach, describe, expect, it, vi } from 'vitest'

import { recordReferralClarificationCompletion } from '@/lib/triage/historianClarificationCompletion'

const { getPoolMock, connectMock, queryMock, releaseMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))

const baseInput = {
  consultId: 'consult-1',
  tenantId: 'tenant-1',
  historianSessionId: 'historian-1',
  summary: 'Clarification complete.',
  structuredOutput: {},
  redFlags: [] as Array<{ flag: string; severity: string; context: string }>,
  completionStatus: 'complete' as const,
  answers: [
    { questionId: 'question-1', answer: 'Yesterday morning.' },
    { questionId: 'question-2', answer: 'It has been intermittent.' },
  ],
}

describe('recordReferralClarificationCompletion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPoolMock.mockResolvedValue({ connect: connectMock })
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock })
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT triage_session_id')) {
        return { rows: [{ triage_session_id: 'triage-1' }], rowCount: 1 }
      }
      if (sql.includes('FROM triage_clarification_questions')) {
        return {
          rows: [{ id: 'question-1' }, { id: 'question-2' }],
          rowCount: 2,
        }
      }
      return { rows: [], rowCount: 1 }
    })
  })

  it('records approved question answers as unverified and returns the case to clinician review', async () => {
    await expect(
      recordReferralClarificationCompletion(baseInput),
    ).resolves.toEqual({ ok: true })

    const sql = queryMock.mock.calls.map(([statement]) => statement).join('\n')
    expect(sql).toContain('UPDATE triage_clarification_questions')
    expect(sql).toContain("status = 'answered'")
    expect(sql).toContain("responder_kind = 'patient'")
    expect(sql).toContain("workflow_status = 'clinician_review'")
    expect(sql).toContain('scheduling_locked = true')
    expect(sql).toContain("status = 'triage_complete'")
    expect(sql).toContain('INSERT INTO triage_workflow_events')
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
  })

  it('rejects an answer whose question ID was not clinician-approved', async () => {
    const result = await recordReferralClarificationCompletion({
      ...baseInput,
      answers: [{ questionId: 'invented-question', answer: 'Invented scope.' }],
    })

    expect(result).toEqual({
      ok: false,
      reason: 'unapproved_question_answer',
    })
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
  })
})
