export type ReferralSafetyNoticeKind =
  | 'none'
  | 'governed'
  | 'cancel_fallback'

export interface ReferralSafetyNoticeScope {
  sourceIdentity: string | null
  kind: ReferralSafetyNoticeKind
}

export const CANCELED_SAFETY_SCREEN_UNCONFIRMED_REASON =
  'safety_screen_canceled_before_confirmation'

export function initialReferralSafetyNoticeScope(): ReferralSafetyNoticeScope {
  return { sourceIdentity: null, kind: 'none' }
}

export function preserveSafetyNoticeOnSourceReplacement(
  scope: ReferralSafetyNoticeScope,
): ReferralSafetyNoticeScope {
  return scope
}

export function acceptSafetyHold(
  scope: ReferralSafetyNoticeScope,
  sourceIdentity: string,
): {
  scope: ReferralSafetyNoticeScope
  replaceExisting: boolean
} {
  if (!sourceIdentity) throw new Error('Safety notice source is required.')
  return {
    scope: { sourceIdentity, kind: 'governed' },
    replaceExisting:
      scope.kind !== 'none' && scope.sourceIdentity !== sourceIdentity,
  }
}

export function acceptTrustedRoutineSafetyScreen(
  scope: ReferralSafetyNoticeScope,
  sourceIdentity: string,
): {
  scope: ReferralSafetyNoticeScope
  clearExisting: boolean
} {
  if (!sourceIdentity) throw new Error('Safety screen source is required.')
  const clearExisting =
    scope.kind !== 'none' &&
    (scope.sourceIdentity !== sourceIdentity ||
      scope.kind === 'cancel_fallback')
  return {
    scope: clearExisting ? initialReferralSafetyNoticeScope() : scope,
    clearExisting,
  }
}

export function preserveSafetyNoticeOnCancel(
  scope: ReferralSafetyNoticeScope,
  activeSourceIdentity: string | null,
): {
  scope: ReferralSafetyNoticeScope
  createManualFallback: boolean
} {
  if (scope.kind !== 'none' || !activeSourceIdentity) {
    return { scope, createManualFallback: false }
  }
  return {
    scope: {
      sourceIdentity: activeSourceIdentity,
      kind: 'cancel_fallback',
    },
    createManualFallback: true,
  }
}
