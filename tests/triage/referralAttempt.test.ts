import { describe, expect, it } from 'vitest'

import * as attemptModule from '@/lib/triage/referralAttempt'

interface TestAttemptState {
  sourceIdentity: string | null
  generation: number
  caseNonce: string
}

interface TestAttemptToken {
  sourceIdentity: string
  generation: number
}

const beginReferralAttempt = (
  attemptModule as unknown as {
    beginReferralAttempt?: (
      state: TestAttemptState,
      sourceIdentity: string,
    ) => {
      state: TestAttemptState & { sourceIdentity: string }
      token: TestAttemptToken
      shouldClearSafety: boolean
    }
  }
).beginReferralAttempt
const invalidateReferralAttempts = (
  attemptModule as unknown as {
    invalidateReferralAttempts?: (
      state: TestAttemptState,
      nextCaseNonce?: string,
    ) => TestAttemptState & { sourceIdentity: null }
  }
).invalidateReferralAttempts
const cancelReferralAttempt = (
  attemptModule as unknown as {
    cancelReferralAttempt?: (state: TestAttemptState) => TestAttemptState
  }
).cancelReferralAttempt
const retryReferralAttempt = (
  attemptModule as unknown as {
    retryReferralAttempt?: (state: TestAttemptState) => {
      state: TestAttemptState & { sourceIdentity: string }
      token: TestAttemptToken
    }
  }
).retryReferralAttempt
const createReferralCaseNonce = (
  attemptModule as unknown as {
    createReferralCaseNonce?: () => string
  }
).createReferralCaseNonce
const isCurrentReferralAttempt = (
  attemptModule as unknown as {
    isCurrentReferralAttempt?: (
      state: TestAttemptState,
      token: TestAttemptToken,
    ) => boolean
  }
).isCurrentReferralAttempt

describe('referral attempt generations', () => {
  it('creates opaque unique case nonces', () => {
    expect(typeof createReferralCaseNonce).toBe('function')
    if (!createReferralCaseNonce) return

    const first = createReferralCaseNonce()
    const second = createReferralCaseNonce()
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(second).not.toBe(first)
  })

  it('retains safety for a same-source retry while invalidating the prior generation', () => {
    expect(typeof beginReferralAttempt).toBe('function')
    expect(typeof isCurrentReferralAttempt).toBe('function')
    if (!beginReferralAttempt || !isCurrentReferralAttempt) return

    const first = beginReferralAttempt(
      { sourceIdentity: null, generation: 0, caseNonce: 'case-a' },
      'paste:source-a',
    )
    const retry = beginReferralAttempt(first.state, 'paste:source-a')

    expect(retry.shouldClearSafety).toBe(false)
    expect(retry.token.sourceIdentity).toBe(first.token.sourceIdentity)
    expect(isCurrentReferralAttempt(retry.state, first.token)).toBe(false)
    expect(isCurrentReferralAttempt(retry.state, retry.token)).toBe(true)
  })

  it('clears safety at a different-source boundary and rejects stale completion', () => {
    expect(typeof beginReferralAttempt).toBe('function')
    expect(typeof isCurrentReferralAttempt).toBe('function')
    if (!beginReferralAttempt || !isCurrentReferralAttempt) return

    const first = beginReferralAttempt(
      { sourceIdentity: null, generation: 3, caseNonce: 'case-a' },
      'file:source-a.pdf:100:1',
    )
    const next = beginReferralAttempt(
      first.state,
      'file:source-b.pdf:100:2',
    )

    expect(next.shouldClearSafety).toBe(true)
    expect(isCurrentReferralAttempt(next.state, first.token)).toBe(false)
    expect(isCurrentReferralAttempt(next.state, next.token)).toBe(true)
  })

  it('invalidates the active token at an explicit reset boundary', () => {
    expect(typeof beginReferralAttempt).toBe('function')
    expect(typeof invalidateReferralAttempts).toBe('function')
    expect(typeof isCurrentReferralAttempt).toBe('function')
    if (
      !beginReferralAttempt ||
      !invalidateReferralAttempts ||
      !isCurrentReferralAttempt
    ) {
      return
    }

    const active = beginReferralAttempt(
      { sourceIdentity: null, generation: 8, caseNonce: 'case-a' },
      'paste:source-a',
    )
    const reset = invalidateReferralAttempts(active.state, 'case-b')

    expect(reset).toEqual({
      sourceIdentity: null,
      generation: 10,
      caseNonce: 'case-b',
    })
    expect(isCurrentReferralAttempt(reset, active.token)).toBe(false)
  })

  it('invalidates cancelled work while retaining its case for a coherent retry', () => {
    expect(typeof cancelReferralAttempt).toBe('function')
    expect(typeof isCurrentReferralAttempt).toBe('function')
    if (!cancelReferralAttempt || !isCurrentReferralAttempt) return

    const state = {
      sourceIdentity: 'paste:source-a',
      generation: 4,
      caseNonce: 'case-a',
    }
    const token = { sourceIdentity: state.sourceIdentity, generation: 4 }
    const cancelled = cancelReferralAttempt(state)

    expect(cancelled).toEqual({
      sourceIdentity: 'paste:source-a',
      generation: 5,
      caseNonce: 'case-a',
    })
    expect(isCurrentReferralAttempt(cancelled, token)).toBe(false)
  })

  it.each([
    ['identical pasted text after Clear', 'paste:identical-source'],
    ['identical file after reselection', 'file:identical-referral.pdf:100:1'],
  ] as const)(
    'treats %s as a new referral case',
    (_label, sourceIdentity) => {
      expect(typeof beginReferralAttempt).toBe('function')
      expect(typeof invalidateReferralAttempts).toBe('function')
      expect(typeof isCurrentReferralAttempt).toBe('function')
      if (
        !beginReferralAttempt ||
        !invalidateReferralAttempts ||
        !isCurrentReferralAttempt
      ) {
        return
      }

      const first = beginReferralAttempt(
        { sourceIdentity: null, generation: 0, caseNonce: 'case-a' },
        sourceIdentity,
      )
      const cleared = invalidateReferralAttempts(first.state, 'case-b')
      const next = beginReferralAttempt(cleared, sourceIdentity)

      expect(next.token.sourceIdentity).not.toBe(first.token.sourceIdentity)
      expect(isCurrentReferralAttempt(next.state, first.token)).toBe(false)
      expect(isCurrentReferralAttempt(next.state, next.token)).toBe(true)
    },
  )

  it('starts a new referral case on source edit while a same-source retry stays in the case', () => {
    expect(typeof beginReferralAttempt).toBe('function')
    expect(typeof invalidateReferralAttempts).toBe('function')
    if (!beginReferralAttempt || !invalidateReferralAttempts) return

    const first = beginReferralAttempt(
      { sourceIdentity: null, generation: 2, caseNonce: 'case-a' },
      'paste:original',
    )
    const retry = beginReferralAttempt(first.state, 'paste:original')
    const replaced = beginReferralAttempt(
      invalidateReferralAttempts(retry.state, 'case-b'),
      'paste:edited',
    )

    expect(retry.token.sourceIdentity).toBe(first.token.sourceIdentity)
    expect(retry.shouldClearSafety).toBe(false)
    expect(replaced.token.sourceIdentity).not.toBe(first.token.sourceIdentity)
  })

  it('continues an extraction review with the exact same scoped source identity', () => {
    expect(typeof beginReferralAttempt).toBe('function')
    expect(typeof retryReferralAttempt).toBe('function')
    if (!beginReferralAttempt || !retryReferralAttempt) return

    const extraction = beginReferralAttempt(
      { sourceIdentity: null, generation: 4, caseNonce: 'case-a' },
      'file:reviewed-referral.pdf',
    )
    const continuation = retryReferralAttempt(extraction.state)

    expect(continuation.token.sourceIdentity).toBe(
      extraction.token.sourceIdentity,
    )
    expect(continuation.state.generation).toBe(
      extraction.state.generation + 1,
    )
  })
})
