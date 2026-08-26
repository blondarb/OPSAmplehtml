import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { getUserMock, poolQueryMock, getPoolMock, fromMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  poolQueryMock: vi.fn(),
  getPoolMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('@/lib/cognito/server', () => ({ getUser: getUserMock }))
vi.mock('@/lib/db', () => ({ getPool: getPoolMock }))
vi.mock('@/lib/db-query', () => ({ from: fromMock }))

import { POST } from '../route'

describe('historian note import safety boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUserMock.mockResolvedValue({ sub: 'synthetic-qa-user' })
    getPoolMock.mockResolvedValue({ query: poolQueryMock })
  })

  it.each(['comprehensive-v3', 'comprehensive-v4'])(
    'fails closed before note access for %s sessions',
    async (interviewPromptVersion) => {
      poolQueryMock.mockResolvedValue({
        rows: [{
          id: 'session-synthetic',
          structured_output: { interview_prompt_version: interviewPromptVersion },
          interview_prompt_version: interviewPromptVersion,
          imported_to_note: false,
        }],
      })
      const request = new Request('http://localhost/api/visits/visit-other/import-historian', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historian_session_id: 'session-synthetic' }),
      })

      const response = await POST(request as NextRequest, {
        params: Promise.resolve({ id: 'visit-other' }),
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({
        error: 'Import is not available for this historian report version.',
      })
      expect(fromMock).not.toHaveBeenCalled()
      expect(String(poolQueryMock.mock.calls[0]?.[0])).toContain('interview_prompt_version')
    },
  )
})
