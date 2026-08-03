'use client'

import { TIER_COUNT, TIER_PRESENTATION } from '@/lib/triage/tierPresentation'

export default function InsufficientDataPanel({
  missingInformation,
}: {
  missingInformation: string[] | null
}) {
  const tier = TIER_PRESENTATION.insufficient_data

  return (
    <div
      className="nn-tier"
      style={{ ['--nn-tier-color' as string]: tier.colorVar, ['--nn-tier-bg' as string]: tier.bgVar, margin: 0 }}
    >
      <span className="nn-tier-num nn-num">Tier {tier.num} of {TIER_COUNT}</span>
      <p className="nn-tier-name" style={{ fontSize: 'var(--nn-fs-lg)' }}>Insufficient Data</p>
      <p className="nn-tier-time">Return to referring provider for clarification</p>

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
    </div>
  )
}
