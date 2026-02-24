'use client'

import { WEARABLE_DEVICES } from '@/lib/wearable/types'

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  live: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10B981', border: '#10B981' },
  planned: { bg: 'rgba(245, 158, 11, 0.15)', text: '#F59E0B', border: '#F59E0B' },
  future: { bg: 'rgba(107, 114, 128, 0.15)', text: '#6B7280', border: '#6B7280' },
}

const statusLabels: Record<string, string> = {
  live: 'Live Integration',
  planned: 'Planned',
  future: 'Future',
}

export default function DataSourceCards() {
  return (
    <div>
      {/* Section Header */}
      <h2 style={{
        color: '#fff',
        fontSize: '1.15rem',
        fontWeight: 700,
        margin: '0 0 6px',
      }}>
        Data Sources
      </h2>
      <p style={{
        color: '#94a3b8',
        fontSize: '0.85rem',
        margin: '0 0 20px',
      }}>
        Wearable devices and their integration status
      </p>

      {/* Device Cards Row */}
      <div style={{
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
      }}>
        {WEARABLE_DEVICES.map((device) => {
          const isActive = device.integration_status === 'live'
          const colors = statusColors[device.integration_status] || statusColors.future

          return (
            <div
              key={device.name}
              style={{
                flex: '1 1 280px',
                minWidth: '260px',
                background: '#1e293b',
                border: isActive ? '2px solid #0EA5E9' : '1px solid #334155',
                borderRadius: '12px',
                padding: '24px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Active highlight strip */}
              {isActive && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '3px',
                  background: '#0EA5E9',
                }} />
              )}

              {/* Device Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}>
                  {/* Device icon */}
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: isActive ? 'rgba(14, 165, 233, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={isActive ? '#0EA5E9' : '#64748b'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M8 12h1.5l1.5-3 1.5 5 1.5-2H16" />
                    </svg>
                  </div>
                  <h3 style={{
                    color: '#fff',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    margin: 0,
                  }}>
                    {device.name}
                  </h3>
                </div>

                {/* Status Badge */}
                <span style={{
                  padding: '3px 10px',
                  borderRadius: '10px',
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  color: colors.text,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.3px',
                }}>
                  {statusLabels[device.integration_status]}
                </span>
              </div>

              {/* Data Types */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
              }}>
                {device.data_types.map((dt) => (
                  <span
                    key={dt}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      color: '#94a3b8',
                      fontSize: '0.73rem',
                      fontWeight: 500,
                    }}
                  >
                    {dt}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
