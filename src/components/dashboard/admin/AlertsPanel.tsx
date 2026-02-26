'use client'

import { DEMO_OPERATIONAL_ALERTS } from '@/lib/dashboard/demoMetrics'
import type { OperationalAlert } from '@/lib/dashboard/types'

const SEVERITY_STYLES: Record<
  OperationalAlert['severity'],
  { bg: string; text: string; border: string }
> = {
  critical: { bg: '#FEE2E2', text: '#DC2626', border: '#DC2626' },
  warning: { bg: '#FEF3C7', text: '#D97706', border: '#D97706' },
  info: { bg: '#DBEAFE', text: '#2563EB', border: '#2563EB' },
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  const mm = m.toString().padStart(2, '0')
  return `${h12}:${mm} ${suffix}`
}

export default function AlertsPanel() {
  const alerts = DEMO_OPERATIONAL_ALERTS

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            color: '#FFFFFF',
          }}
        >
          Alerts
        </h3>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#FFFFFF',
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 9999,
            padding: '2px 8px',
          }}
        >
          {alerts.length}
        </span>
      </div>

      {/* Alert list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {alerts.map((alert) => {
          const s = SEVERITY_STYLES[alert.severity]

          return (
            <div
              key={alert.id}
              style={{
                borderLeft: `4px solid ${s.border}`,
                background: 'rgba(15, 23, 42, 0.5)',
                borderRadius: 8,
                padding: '12px 14px',
              }}
            >
              {/* Top row: severity badge + timestamp */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: s.text,
                    background: s.bg,
                    borderRadius: 9999,
                    padding: '2px 8px',
                  }}
                >
                  {alert.severity}
                </span>
                <span style={{ fontSize: 12, color: '#64748B' }}>
                  {formatTime(alert.timestamp)}
                </span>
              </div>

              {/* Title */}
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#FFFFFF',
                  marginBottom: 4,
                }}
              >
                {alert.title}
              </div>

              {/* Description */}
              <div style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.45 }}>
                {alert.description}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
