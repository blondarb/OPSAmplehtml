import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@/lib/bedrock', () => ({
  invokeBedrockClinicalJSON: invokeMock,
  copyBedrockTokenUsage: () => ({}),
}))

import {
  AITriageModelOutputError,
  runTriage,
} from '@/lib/triage/runTriage'

describe('runTriage model-output boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('carries a monotonic emergency envelope when strict outpatient validation fails', async () => {
    invokeMock.mockResolvedValueOnce({
      parsed: {
        emergent_override: true,
        emergent_reason: null,
        unreviewed_plan: 'Invented plan',
      },
    })

    let caught: unknown
    try {
      await runTriage({
        referral_text:
          'Synthetic current neurologic emergency with malformed model output.',
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(AITriageModelOutputError)
    expect(caught).toMatchObject({
      emergencyEnvelope: {
        emergentOverride: true,
        emergentReason:
          'The scoring model marked this referral as emergent; immediately review the source evidence and emergency workflow.',
      },
    })
    expect((caught as Error).message).toMatch(
      /emergency_override=true preserved/i,
    )
  })

  it('uses the server decision clock with raw chronology source when prompt scoring uses a summary', async () => {
    invokeMock.mockResolvedValueOnce({ parsed: {} })

    await expect(
      runTriage({
        referral_text: 'Synthetic scorer summary.',
        chronologySourceText: 'Document date: 2025-12-15\nSynthetic raw source.',
        decisionAt: '2026-09-05T12:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(AITriageModelOutputError)

    expect(invokeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining('Decision clock (server supplied): 2026-09-05T12:00:00.000Z'),
          }),
        ],
      }),
    )
    expect(invokeMock.mock.calls[0][0].messages[0].content).toContain(
      'Document date',
    )
    expect(invokeMock.mock.calls[0][0].messages[0].content).toContain(
      'Synthetic scorer summary.',
    )
  })
})
