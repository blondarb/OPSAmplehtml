'use client'

import { DEMO_PROVIDER_PERFORMANCE } from '@/lib/dashboard/demoMetrics'

function getBarColor(pct: number): string {
  if (pct >= 80) return '#22C55E'
  if (pct >= 60) return '#F59E0B'
  return '#EF4444'
}

export default function ProviderPerformancePanel() {
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
      <h3
        style={{
          margin: 0,
          marginBottom: 16,
          fontSize: 16,
          fontWeight: 700,
          color: '#FFFFFF',
        }}
      >
        Provider Performance
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {DEMO_PROVIDER_PERFORMANCE.map((p) => {
          const barColor = getBarColor(p.utilization_pct)
          const isBehind = p.running_behind_minutes > 0

          return (
            <div key={p.provider_id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Row 1: Name + seen/total */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: '#F1F5F9' }}>
                  {p.name}, {p.credentials}
                </span>
                <span style={{ fontSize: 13, color: '#94A3B8' }}>
                  {p.seen} seen / {p.total} total
                </span>
              </div>

              {/* Row 2: Utilization bar */}
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
                    width: `${p.utilization_pct}%`,
                    height: '100%',
                    borderRadius: 4,
                    background: barColor,
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>

              {/* Row 3: Utilization % + status note */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 12, color: barColor, fontWeight: 600 }}>
                  {p.utilization_pct}%
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: isBehind ? '#EF4444' : '#94A3B8',
                    fontWeight: isBehind ? 600 : 400,
                  }}
                >
                  {p.status_note}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
