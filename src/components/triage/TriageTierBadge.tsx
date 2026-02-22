'use client'

import { TriageTier, TIER_DISPLAY } from '@/lib/triage/types'

interface Props {
  tier: TriageTier
  weightedScore: number | null
  isRedFlagOverride?: boolean
}

export default function TriageTierBadge({ tier, weightedScore, isRedFlagOverride }: Props) {
  const config = TIER_DISPLAY[tier]

  return (
    <>
      {config.pulsing && (
        <style>{`
          @keyframes triagePulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7); }
            50% { box-shadow: 0 0 0 12px rgba(220, 38, 38, 0); }
          }
        `}</style>
      )}
      <div style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        padding: '16px 32px',
        borderRadius: '12px',
        background: config.bgColor,
        border: `3px solid ${config.borderColor}`,
        color: config.textColor,
        animation: config.pulsing ? 'triagePulse 2s ease-in-out infinite' : undefined,
      }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.05em' }}>
          {config.label}
        </span>
        <span style={{ fontSize: '0.9rem', fontWeight: 500, opacity: 0.9 }}>
          {config.timeframe}
          {isRedFlagOverride && ' (Red Flag Override)'}
        </span>
        {weightedScore !== null && (
          <span style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '2px' }}>
            Weighted Score: {weightedScore.toFixed(2)}
          </span>
        )}
      </div>
    </>
  )
}
