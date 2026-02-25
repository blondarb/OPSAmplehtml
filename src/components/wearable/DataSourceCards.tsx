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

      {/* Live Data Pipeline */}
      <div style={{ marginTop: '32px' }}>
        <h3 style={{
          color: '#fff',
          fontSize: '1rem',
          fontWeight: 700,
          margin: '0 0 4px',
        }}>
          Live Data Pipeline
        </h3>
        <p style={{
          color: '#64748b',
          fontSize: '0.8rem',
          margin: '0 0 20px',
        }}>
          via Sevaro Monitor iOS app
        </p>
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '28px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0',
          flexWrap: 'wrap',
        }}>
          {/* Node 1: Apple Watch */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', minWidth: '90px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: 'rgba(14, 165, 233, 0.15)', border: '2px solid #0EA5E9',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="3" />
                <path d="M9 12h1.5l1.5-3 1.5 6 1.5-3H17" />
              </svg>
            </div>
            <span style={{ color: '#e2e8f0', fontSize: '0.72rem', fontWeight: 600, textAlign: 'center' }}>Apple Watch</span>
            <span style={{ color: '#64748b', fontSize: '0.65rem', textAlign: 'center', lineHeight: 1.3 }}>HR, HRV, Sleep,<br/>Steps, SpO2</span>
          </div>

          {/* Arrow 1 */}
          <div style={{ padding: '0 8px', marginBottom: '36px' }}>
            <svg width="32" height="12" viewBox="0 0 32 12" fill="none">
              <path d="M0 6h24" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 2" />
              <path d="M22 2l6 4-6 4" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Node 2: HealthKit */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', minWidth: '90px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: 'rgba(255, 45, 85, 0.15)', border: '2px solid #FF2D55',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF2D55" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
            <span style={{ color: '#e2e8f0', fontSize: '0.72rem', fontWeight: 600, textAlign: 'center' }}>HealthKit</span>
            <span style={{ color: '#64748b', fontSize: '0.65rem', textAlign: 'center', lineHeight: 1.3 }}>iOS health<br/>data store</span>
          </div>

          {/* Arrow 2 */}
          <div style={{ padding: '0 8px', marginBottom: '36px' }}>
            <svg width="32" height="12" viewBox="0 0 32 12" fill="none">
              <path d="M0 6h24" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 2" />
              <path d="M22 2l6 4-6 4" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Node 3: Sevaro Monitor */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', minWidth: '90px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.15)', border: '2px solid #10B981',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="7" y="2" width="10" height="20" rx="2" />
                <line x1="12" y1="18" x2="12" y2="18.01" />
              </svg>
            </div>
            <span style={{ color: '#e2e8f0', fontSize: '0.72rem', fontWeight: 600, textAlign: 'center' }}>Sevaro Monitor</span>
            <span style={{ color: '#64748b', fontSize: '0.65rem', textAlign: 'center', lineHeight: 1.3 }}>Collects &amp;<br/>syncs daily</span>
          </div>

          {/* Arrow 3 */}
          <div style={{ padding: '0 8px', marginBottom: '36px' }}>
            <svg width="32" height="12" viewBox="0 0 32 12" fill="none">
              <path d="M0 6h24" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 2" />
              <path d="M22 2l6 4-6 4" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Node 4: Supabase */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', minWidth: '90px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: 'rgba(62, 207, 142, 0.15)', border: '2px solid #3ECF8E',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3ECF8E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
            </div>
            <span style={{ color: '#e2e8f0', fontSize: '0.72rem', fontWeight: 600, textAlign: 'center' }}>Supabase Cloud</span>
            <span style={{ color: '#64748b', fontSize: '0.65rem', textAlign: 'center', lineHeight: 1.3 }}>Stores summaries<br/>&amp; baselines</span>
          </div>

          {/* Arrow 4 */}
          <div style={{ padding: '0 8px', marginBottom: '36px' }}>
            <svg width="32" height="12" viewBox="0 0 32 12" fill="none">
              <path d="M0 6h24" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 2" />
              <path d="M22 2l6 4-6 4" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Node 5: AI Analysis */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', minWidth: '90px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: 'rgba(139, 92, 246, 0.15)', border: '2px solid #8B5CF6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.5V11h-4V9.5C8.8 8.8 8 7.5 8 6a4 4 0 0 1 4-4z" />
                <rect x="8" y="13" width="8" height="4" rx="1" />
                <path d="M10 17v3" />
                <path d="M14 17v3" />
                <path d="M8 20h8" />
              </svg>
            </div>
            <span style={{ color: '#e2e8f0', fontSize: '0.72rem', fontWeight: 600, textAlign: 'center' }}>AI Analysis</span>
            <span style={{ color: '#64748b', fontSize: '0.65rem', textAlign: 'center', lineHeight: 1.3 }}>Pattern detection<br/>&amp; alerts</span>
          </div>
        </div>
      </div>
    </div>
  )
}
