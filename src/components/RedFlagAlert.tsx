'use client'

import type { DetectedFlag, RedFlagSeverity } from '@/lib/consult/red-flags/red-flag-types'

interface Props {
  flags: DetectedFlag[]
  onAcknowledge?: (flagId: string) => void
}

const SEVERITY_STYLES: Record<
  RedFlagSeverity,
  { border: string; bg: string; text: string; badge: string; pulse: boolean }
> = {
  critical: {
    border: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.08)',
    text: '#EF4444',
    badge: '#DC2626',
    pulse: true,
  },
  high: {
    border: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.08)',
    text: '#F59E0B',
    badge: '#D97706',
    pulse: false,
  },
  moderate: {
    border: '#3B82F6',
    bg: 'rgba(59, 130, 246, 0.08)',
    text: '#3B82F6',
    badge: '#2563EB',
    pulse: false,
  },
}

function SeverityIcon({ severity }: { severity: RedFlagSeverity }) {
  const color = SEVERITY_STYLES[severity].text
  if (severity === 'critical') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

export default function RedFlagAlert({ flags, onAcknowledge }: Props) {
  if (flags.length === 0) {
    return (
      <div style={{
        padding: '12px 16px',
        background: 'rgba(22, 163, 74, 0.1)',
        border: '1px solid #16A34A',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <span style={{ color: '#16A34A', fontSize: '0.85rem', fontWeight: 500 }}>
          No neurological red flags detected
        </span>
      </div>
    )
  }

  // Show the most severe flag first
  const sorted = [...flags].sort((a, b) => {
    const rank: Record<RedFlagSeverity, number> = { critical: 3, high: 2, moderate: 1 }
    return rank[b.flag.severity] - rank[a.flag.severity]
  })

  const topSeverity = sorted[0].flag.severity
  const styles = SEVERITY_STYLES[topSeverity]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {sorted.map((detected) => {
        const s = SEVERITY_STYLES[detected.flag.severity]
        return (
          <div
            key={detected.flag.id}
            style={{
              padding: '14px 16px',
              background: s.bg,
              border: `2px solid ${s.border}`,
              borderRadius: '8px',
              position: 'relative',
            }}
          >
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <SeverityIcon severity={detected.flag.severity} />
              <span style={{ color: s.text, fontWeight: 700, fontSize: '0.9rem', flex: 1 }}>
                {detected.flag.name}
              </span>
              <span style={{
                background: s.badge,
                color: '#fff',
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '999px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {detected.flag.severity}
              </span>
              {detected.flag.escalation_tier === 'immediate' && (
                <span style={{
                  background: '#7F1D1D',
                  color: '#FCA5A5',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  IMMEDIATE
                </span>
              )}
            </div>

            {/* Clinical significance */}
            <p style={{ color: '#CBD5E1', fontSize: '0.8rem', margin: '0 0 6px', lineHeight: 1.5 }}>
              {detected.flag.clinical_significance}
            </p>

            {/* Recommended action */}
            <p style={{ color: s.text, fontSize: '0.8rem', margin: '0 0 8px', lineHeight: 1.5, fontWeight: 500 }}>
              Action: {detected.flag.recommended_action}
            </p>

            {/* Matched pattern */}
            <p style={{ color: '#64748B', fontSize: '0.75rem', margin: 0 }}>
              Triggered by: &ldquo;{detected.matched_pattern}&rdquo; &mdash; confidence {Math.round(detected.confidence * 100)}%
            </p>

            {/* Acknowledge button */}
            {onAcknowledge && (
              <button
                onClick={() => onAcknowledge(detected.flag.id)}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'transparent',
                  border: `1px solid ${s.border}`,
                  borderRadius: '4px',
                  color: s.text,
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  cursor: 'pointer',
                }}
              >
                Acknowledge
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
