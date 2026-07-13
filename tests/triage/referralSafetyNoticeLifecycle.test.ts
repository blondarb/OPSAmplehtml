import { describe, expect, it } from 'vitest'

import {
  acceptSafetyHold,
  acceptTrustedRoutineSafetyScreen,
  initialReferralSafetyNoticeScope,
  preserveSafetyNoticeOnCancel,
  preserveSafetyNoticeOnSourceReplacement,
} from '@/lib/triage/referralSafetyNoticeLifecycle'

describe('referral safety notice lifecycle', () => {
  it('preserves a governed hold across ordinary source and metadata edits', () => {
    const governed = acceptSafetyHold(
      initialReferralSafetyNoticeScope(),
      'source-a',
    ).scope

    expect(preserveSafetyNoticeOnSourceReplacement(governed)).toBe(governed)
  })

  it('replaces rather than conflicts with a hold accepted for the replacement source', () => {
    const governed = acceptSafetyHold(
      initialReferralSafetyNoticeScope(),
      'source-a',
    ).scope

    expect(acceptSafetyHold(governed, 'source-b')).toStrictEqual({
      scope: { sourceIdentity: 'source-b', kind: 'governed' },
      replaceExisting: true,
    })
    expect(acceptSafetyHold(governed, 'source-a').replaceExisting).toBe(false)
  })

  it('clears an older-source hold only after a trusted routine screen for the replacement', () => {
    const governed = acceptSafetyHold(
      initialReferralSafetyNoticeScope(),
      'source-a',
    ).scope

    expect(
      acceptTrustedRoutineSafetyScreen(governed, 'source-b'),
    ).toStrictEqual({
      scope: initialReferralSafetyNoticeScope(),
      clearExisting: true,
    })
    expect(
      acceptTrustedRoutineSafetyScreen(governed, 'source-a').clearExisting,
    ).toBe(false)
  })

  it('retains a known hold on cancel and creates a pathless fallback when none arrived', () => {
    const governed = acceptSafetyHold(
      initialReferralSafetyNoticeScope(),
      'source-a',
    ).scope
    expect(preserveSafetyNoticeOnCancel(governed, 'source-a')).toStrictEqual({
      scope: governed,
      createManualFallback: false,
    })

    expect(
      preserveSafetyNoticeOnCancel(
        initialReferralSafetyNoticeScope(),
        'source-a',
      ),
    ).toStrictEqual({
      scope: { sourceIdentity: 'source-a', kind: 'cancel_fallback' },
      createManualFallback: true,
    })
  })

  it('allows a trusted routine retry to clear only the cancel fallback for the same source', () => {
    const fallback = preserveSafetyNoticeOnCancel(
      initialReferralSafetyNoticeScope(),
      'source-a',
    ).scope

    expect(
      acceptTrustedRoutineSafetyScreen(fallback, 'source-a'),
    ).toStrictEqual({
      scope: initialReferralSafetyNoticeScope(),
      clearExisting: true,
    })
  })
})
