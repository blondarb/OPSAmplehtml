import {
  buildHistorianReferralContext,
  type HistorianReferralContext,
  type HistorianReferralInput,
} from '@/lib/historian/referralContext'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate and build the referral context from a request body. Returns null for
 * an absent or malformed payload — a bad referral must degrade to the ordinary
 * interview, never fail the session.
 */
export function resolveReferralPayload(
  body: Record<string, unknown>,
): HistorianReferralContext | null {
  const referral = body.referral
  if (!isRecord(referral)) return null
  const steer = referral.steer
  if (steer !== 'directive' && steer !== 'additive') return null
  return buildHistorianReferralContext(referral as unknown as HistorianReferralInput)
}
