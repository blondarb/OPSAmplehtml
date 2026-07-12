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
})
