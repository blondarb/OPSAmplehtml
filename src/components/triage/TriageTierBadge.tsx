'use client'

import { TriageTier, TIER_DISPLAY } from '@/lib/triage/types'
import { TIER_COUNT, TIER_PRESENTATION } from '@/lib/triage/tierPresentation'

interface Props {
  tier: TriageTier
  weightedScore?: number | null
  isRedFlagOverride?: boolean
  compact?: boolean
  timeframeOverride?: string
}

/**
 * Tier rendering. Tier is clinical information, so color is never its only
 * carrier: the card always shows the tier number ("Tier N of 7"), the tier
 * name, and the timeframe as text. Colors come from the lightness-ordered
 * nn tokens so tiers separate in grayscale and under color-vision deficiency.
 *
 * The `compact` variant keeps the legacy TIER_DISPLAY styling — it renders on
 * the dark validate/batch surfaces outside the nn design system.
 */
export default function TriageTierBadge({
  tier,
  weightedScore,
  isRedFlagOverride,
  compact,
  timeframeOverride,
}: Props) {
  const config = TIER_DISPLAY[tier]

  if (compact) {
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '10px',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.03em',
        backgroundColor: config.bgColor,
        color: config.textColor,
        border: `1px solid ${config.borderColor}`,
        whiteSpace: 'nowrap',
      }}>
        {config.label}
      </span>
    )
  }

  const presentation = TIER_PRESENTATION[tier]
  const isEmergent = tier === 'emergent'

  return (
    <div
      className={isEmergent ? 'nn-emerg' : 'nn-tier'}
      style={{
        ['--nn-tier-color' as string]: presentation.colorVar,
        ['--nn-tier-bg' as string]: presentation.bgVar,
        margin: 0,
        textAlign: 'left',
      }}
    >
      <span className="nn-tier-num nn-num">Tier {presentation.num} of {TIER_COUNT}</span>
      <p className="nn-tier-name">
        {isEmergent ? 'Emergent — do not schedule' : presentation.name}
      </p>
      <p className="nn-tier-time nn-num">
        {timeframeOverride ?? config.timeframe}
        {isRedFlagOverride && ' · Red-flag override'}
      </p>
      {!isEmergent && typeof weightedScore === 'number' && Number.isFinite(weightedScore) && (
        <p style={{ color: 'var(--nn-ink-3)', fontSize: 'var(--nn-fs-xs)', margin: '6px 0 0' }} className="nn-num">
          Weighted score {weightedScore.toFixed(2)} / 5
        </p>
      )}
    </div>
  )
}
