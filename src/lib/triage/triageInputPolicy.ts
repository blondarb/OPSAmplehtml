import { FILE_CONSTRAINTS } from './types'

export const MIN_REFERRAL_TEXT_LENGTH = 50

export interface ReferralTextInputState {
  submissionText: string
  characterCount: number
  belowMinimum: boolean
  /** Allows only a server-side positive safety screen; never authorizes scoring. */
  canRunSafetyScreen: boolean
  requiresExtraction: boolean
  exceedsVerifiedPacketLimit: boolean
  canSubmit: boolean
}

/**
 * Classify referral text without modifying it. In particular, time-critical
 * evidence after the single-pass boundary must never be silently truncated.
 */
export function assessReferralTextInput(text: string): ReferralTextInputState {
  const characterCount = text.length
  const belowMinimum = text.trim().length < MIN_REFERRAL_TEXT_LENGTH
  const exceedsVerifiedPacketLimit =
    characterCount > FILE_CONSTRAINTS.MAX_PACKET_TEXT_LENGTH
  const canRunSafetyScreen =
    belowMinimum && !exceedsVerifiedPacketLimit && text.trim().length > 0

  return {
    submissionText: text,
    characterCount,
    belowMinimum,
    canRunSafetyScreen,
    requiresExtraction:
      !exceedsVerifiedPacketLimit &&
      characterCount >= FILE_CONSTRAINTS.SHORT_NOTE_THRESHOLD,
    exceedsVerifiedPacketLimit,
    canSubmit: !belowMinimum && !exceedsVerifiedPacketLimit,
  }
}
