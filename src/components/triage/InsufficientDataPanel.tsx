'use client'

import { TIER_COUNT, TIER_PRESENTATION } from '@/lib/triage/tierPresentation'

export default function InsufficientDataPanel({
  missingInformation,
  internalFailure = false,
  hasGenuineMissingItems = false,
}: {
  missingInformation: string[] | null
  /**
   * True when the hold is caused, at least in part, by OUR independent
   * safety-model check failing to complete (see safetyReviewView's
   * `hasModelSafetyFailure`) — not by the referring provider's note being
   * thin. Threaded through from TriageOutputPanel so this panel can tell the
   * physician the true cause. Production incident 2026-08-05: a transient
   * safety-extractor failure on a complete, textbook MS workup produced this
   * exact panel telling the referrer their note lacked information — false,
   * and left uncorrected, an incentive for referring providers to stop
   * referring.
   */
  internalFailure?: boolean
  /**
   * True only when the scoring model itself named concrete missing items —
   * i.e. `missingInformation` reflects a real, model-identified gap rather
   * than the generic insufficient-data fallback bullet. Lets a run that is
   * BOTH genuinely thin AND internally failed report both truthfully,
   * instead of the internal-failure copy silently swallowing a real gap.
   */
  hasGenuineMissingItems?: boolean
}) {
  const tier = TIER_PRESENTATION.insufficient_data
  // A safety-check failure with no model-identified gap means we never
  // actually determined the referral was thin — showing the "return to
  // provider" copy in that case would blame the referral for our failure.
  const onlyInternalFailure = internalFailure && !hasGenuineMissingItems

  return (
    <div
      className="nn-tier"
      style={{ ['--nn-tier-color' as string]: tier.colorVar, ['--nn-tier-bg' as string]: tier.bgVar, margin: 0 }}
    >
      <span className="nn-tier-num nn-num">Tier {tier.num} of {TIER_COUNT}</span>
      <p className="nn-tier-name" style={{ fontSize: 'var(--nn-fs-lg)' }}>Insufficient Data</p>
      <p className="nn-tier-time">
        {onlyInternalFailure
          ? 'Independent safety check incomplete — clinician review required'
          : 'Return to referring provider for clarification'}
      </p>

      {!onlyInternalFailure && (
        <>
          <p style={{ color: 'var(--nn-ink-2)', fontSize: 'var(--nn-fs-sm)', lineHeight: 1.6, margin: '12px 0 10px' }}>
            This referral does not contain enough clinical information to triage safely.
            Consider returning to the referring provider requesting the following:
          </p>

          {missingInformation && missingInformation.length > 0 && (
            <ul className="nn-list" style={{ background: 'var(--nn-surface-2)', border: '1px solid var(--nn-line-2)', borderRadius: 8, padding: '12px 12px 12px 32px' }}>
              {missingInformation.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}
        </>
      )}

      {internalFailure && (
        <p
          style={{
            color: 'var(--nn-t1)',
            fontWeight: 600,
            fontSize: 'var(--nn-fs-sm)',
            lineHeight: 1.6,
            margin: onlyInternalFailure ? '12px 0 0' : '10px 0 0',
          }}
        >
          Our independent safety review could not be completed for this referral — this is an
          internal system issue, not a gap in the information the referring provider supplied.
          Manual clinician review is required before this case can proceed to scheduling.
        </p>
      )}
    </div>
  )
}
