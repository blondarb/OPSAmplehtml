export interface ReferralAttemptState {
  sourceIdentity: string | null
  generation: number
  caseNonce: string
}

export interface ReferralAttemptToken {
  sourceIdentity: string
  generation: number
}

export function createReferralCaseNonce(): string {
  return globalThis.crypto.randomUUID()
}

export function beginReferralAttempt(
  state: ReferralAttemptState,
  sourceIdentity: string,
): {
  state: ReferralAttemptState
  token: ReferralAttemptToken
  shouldClearSafety: boolean
} {
  if (!sourceIdentity) throw new Error('Referral source identity is required.')
  const scopedSourceIdentity = JSON.stringify([
    state.caseNonce,
    sourceIdentity,
  ])
  const generation = state.generation + 1
  const next = {
    sourceIdentity: scopedSourceIdentity,
    generation,
    caseNonce: state.caseNonce,
  }
  return {
    state: next,
    token: {
      sourceIdentity: scopedSourceIdentity,
      generation,
    },
    shouldClearSafety:
      state.sourceIdentity !== null &&
      state.sourceIdentity !== scopedSourceIdentity,
  }
}

export function invalidateReferralAttempts(
  state: ReferralAttemptState,
  nextCaseNonce: string = createReferralCaseNonce(),
): ReferralAttemptState {
  if (!nextCaseNonce) throw new Error('Referral case nonce is required.')
  return {
    sourceIdentity: null,
    generation: state.generation + 1,
    caseNonce: nextCaseNonce,
  }
}

export function cancelReferralAttempt(
  state: ReferralAttemptState,
): ReferralAttemptState {
  return { ...state, generation: state.generation + 1 }
}

export function retryReferralAttempt(
  state: ReferralAttemptState,
): {
  state: ReferralAttemptState & { sourceIdentity: string }
  token: ReferralAttemptToken
} {
  if (!state.sourceIdentity) {
    throw new Error('Cannot retry without an active referral source.')
  }
  const generation = state.generation + 1
  const next = {
    ...state,
    sourceIdentity: state.sourceIdentity,
    generation,
  }
  return {
    state: next,
    token: { sourceIdentity: next.sourceIdentity, generation },
  }
}

export function isCurrentReferralAttempt(
  state: ReferralAttemptState,
  token: ReferralAttemptToken,
): boolean {
  return (
    state.generation === token.generation &&
    state.sourceIdentity === token.sourceIdentity
  )
}
