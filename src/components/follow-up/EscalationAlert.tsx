'use client'

import type { EscalationFlag, EscalationTier } from '@/lib/follow-up/types'

interface EscalationAlertProps {
  flag: EscalationFlag | null
  onDismiss: () => void
}

const TIER_CONFIG: Record<EscalationTier, {
  bg: string
  header: string
  textColor: string
  pulse: boolean
}> = {
  urgent: {
    bg: '#DC2626',
    header: 'URGENT ESCALATION',
    textColor: 'white',
    pulse: true,
  },
  same_day: {
    bg: '#EA580C',
    header: 'SAME-DAY CALLBACK REQUIRED',
    textColor: 'white',
    pulse: false,
  },
  next_visit: {
    bg: '#EAB308',
    header: 'FLAG FOR NEXT VISIT',
    textColor: '#1e293b',
    pulse: false,
  },
  informational: {
    bg: '#16A34A',
    header: 'INFORMATIONAL NOTE',
    textColor: 'white',
    pulse: false,
  },
}

export default function EscalationAlert({ flag, onDismiss }: EscalationAlertProps) {
  if (!flag) return null

  const config = TIER_CONFIG[flag.tier]
  const secondaryTextColor = flag.tier === 'next_visit'
    ? 'rgba(30, 41, 59, 0.75)'
    : 'rgba(255, 255, 255, 0.85)'
  const labelColor = flag.tier === 'next_visit'
    ? 'rgba(30, 41, 59, 0.55)'
    : 'rgba(255, 255, 255, 0.6)'

  return (
    <>
      {config.pulse && (
        <style>{`
          @keyframes escalation-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.85; }
          }
        `}</style>
      )}
      <div style={{
        width: '100%',
        background: config.bg,
        borderRadius: '12px',
        padding: '16px 20px',
        animation: config.pulse ? 'escalation-pulse 2s ease-in-out infinite' : undefined,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={config.textColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span style={{
              color: config.textColor,
              fontSize: '15px',
              fontWeight: 700,
              letterSpacing: '0.5px',
            }}>
              {config.header}
            </span>
          </div>
        </div>

        {/* Content */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginBottom: '14px',
        }}>
          <div>
            <span style={{ color: labelColor, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Trigger
            </span>
            <div style={{ color: config.textColor, fontSize: '13px', lineHeight: '1.5', marginTop: '2px' }}>
              &ldquo;{flag.triggerText}&rdquo;
            </div>
          </div>

          <div>
            <span style={{ color: labelColor, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Category
            </span>
            <div style={{ color: secondaryTextColor, fontSize: '13px', marginTop: '2px' }}>
              {flag.category}
            </div>
          </div>

          <div>
            <span style={{ color: labelColor, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              AI Assessment
            </span>
            <div style={{ color: secondaryTextColor, fontSize: '13px', lineHeight: '1.5', marginTop: '2px' }}>
              {flag.aiAssessment}
            </div>
          </div>

          <div>
            <span style={{ color: labelColor, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Recommended Action
            </span>
            <div style={{ color: config.textColor, fontSize: '13px', fontWeight: 500, lineHeight: '1.5', marginTop: '2px' }}>
              {flag.recommendedAction}
            </div>
          </div>
        </div>

        {/* Acknowledge Button */}
        <button
          onClick={onDismiss}
          style={{
            padding: '8px 20px',
            borderRadius: '8px',
            background: 'white',
            color: '#1e293b',
            border: 'none',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.opacity = '0.9' }}
          onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.opacity = '1' }}
        >
          Acknowledge
        </button>
      </div>
    </>
  )
}
