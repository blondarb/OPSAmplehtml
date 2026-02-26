'use client'

import { DEMO_QUALITY_METRICS } from '@/lib/dashboard/demoMetrics'
import type { QualityMetric } from '@/lib/dashboard/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TREND_ARROWS: Record<QualityMetric['trend'], string> = {
  up: '\u2191',   // ↑
  down: '\u2193', // ↓
  flat: '\u2192', // →
}

/**
 * Determine the bar colour based on how the metric relates to its target.
 *
 * For time-based metrics (unit === 'min') *lower* is better, so being under
 * the target counts as meeting the goal.  For percentage metrics *higher* is
 * better.
 *
 * - Green  (#22C55E) — at or above target (or under target for time)
 * - Amber  (#F59E0B) — within 15 % of target
 * - Red    (#EF4444) — far below target
 */
function getBarColor(m: QualityMetric): string {
  const isTimeBased = m.unit === 'min'

  if (isTimeBased) {
    // Lower is better — at-or-under target is good
    if (m.value <= m.target) return '#22C55E'
    const overshoot = (m.value - m.target) / m.target
    return overshoot <= 0.15 ? '#F59E0B' : '#EF4444'
  }

  // Percentage: higher is better
  if (m.value >= m.target) return '#22C55E'
  const gap = (m.target - m.value) / m.target
  return gap <= 0.15 ? '#F59E0B' : '#EF4444'
}

/**
 * Progress bar fill width (0-100).
 * - Percentage metrics: value / 100 (capped at 100 %)
 * - Time metrics: value / target (capped at 100 %)
 */
function getBarWidth(m: QualityMetric): number {
  if (m.unit === 'min') {
    return Math.min(m.value / m.target, 1) * 100
  }
  return Math.min(m.value / 100, 1) * 100
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function QualitySnapshot() {
  const metrics = Object.values(DEMO_QUALITY_METRICS) as QualityMetric[]

  return (
    <div
      style={{
        background: 'rgba(30, 41, 59, 0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: 20,
      }}
    >
      {/* Header */}
      <h3
        style={{
          margin: 0,
          marginBottom: 16,
          fontSize: 16,
          fontWeight: 700,
          color: '#FFFFFF',
        }}
      >
        Quality Snapshot
      </h3>

      {/* Metric rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {metrics.map((m) => {
          const barColor = getBarColor(m)
          const barWidth = getBarWidth(m)
          const displayValue = m.unit === 'min' ? `${m.value} min` : `${m.value}%`
          const displayTarget =
            m.unit === 'min' ? `Target: ${m.target} min` : `Target: ${m.target}%`

          return (
            <div key={m.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Row 1: Label */}
              <span style={{ fontSize: 13, color: '#CBD5E1' }}>{m.label}</span>

              {/* Row 2: Progress bar */}
              <div
                style={{
                  width: '100%',
                  height: 8,
                  borderRadius: 4,
                  background: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${barWidth}%`,
                    height: '100%',
                    borderRadius: 4,
                    background: barColor,
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>

              {/* Row 3: Value + trend  |  Target */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: barColor }}>
                  {displayValue} {TREND_ARROWS[m.trend]}
                </span>
                <span style={{ fontSize: 12, color: '#64748B' }}>{displayTarget}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
