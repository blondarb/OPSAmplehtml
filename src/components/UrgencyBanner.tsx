'use client'

import { useState, useEffect } from 'react'

export interface UrgencyBannerProps {
  counts: {
    critical: number
    wearableAlerts: number
    patientMessages: number
    consultRequests: number
    incompleteDocs: number
  }
  onFilterCategory: (category: string) => void
}

const SESSION_KEY = 'sevaro-urgency-banner-dismissed'

interface Segment {
  key: string
  label: (n: number) => string
  color: string
  bgColor: string
  borderColor: string
  hoverBgColor: string
  icon: React.ReactNode
  count: number
}

export default function UrgencyBanner({ counts, onFilterCategory }: UrgencyBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) {
        setDismissed(true)
      }
    } catch {}
    setMounted(true)
  }, [])

  const handleDismiss = () => {
    try { sessionStorage.setItem(SESSION_KEY, 'true') } catch {}
    setDismissed(true)
  }

  const totalCount =
    counts.wearableAlerts +
    counts.patientMessages +
    counts.consultRequests +
    counts.incompleteDocs

  if (!mounted || dismissed || totalCount === 0) return null

  const segments: Segment[] = [
    {
      key: 'wearableAlerts',
      label: (n: number) => `${n} critical alert${n !== 1 ? 's' : ''}`,
      color: '#EF4444',
      bgColor: 'rgba(239, 68, 68, 0.12)',
      borderColor: 'rgba(239, 68, 68, 0.35)',
      hoverBgColor: 'rgba(239, 68, 68, 0.22)',
      count: counts.wearableAlerts + counts.critical,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ),
    },
    {
      key: 'patientMessages',
      label: (n: number) => `${n} urgent message${n !== 1 ? 's' : ''}`,
      color: '#3B82F6',
      bgColor: 'rgba(59, 130, 246, 0.12)',
      borderColor: 'rgba(59, 130, 246, 0.35)',
      hoverBgColor: 'rgba(59, 130, 246, 0.22)',
      count: counts.patientMessages,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
      ),
    },
    {
      key: 'incompleteDocs',
      label: (n: number) => `${n} incomplete doc${n !== 1 ? 's' : ''}`,
      color: '#F59E0B',
      bgColor: 'rgba(245, 158, 11, 0.12)',
      borderColor: 'rgba(245, 158, 11, 0.35)',
      hoverBgColor: 'rgba(245, 158, 11, 0.22)',
      count: counts.incompleteDocs,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="11" x2="12" y2="15"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ),
    },
    {
      key: 'consultRequests',
      label: (n: number) => `${n} consult${n !== 1 ? 's' : ''}`,
      color: '#8B5CF6',
      bgColor: 'rgba(139, 92, 246, 0.12)',
      borderColor: 'rgba(139, 92, 246, 0.35)',
      hoverBgColor: 'rgba(139, 92, 246, 0.22)',
      count: counts.consultRequests,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
        </svg>
      ),
    },
  ].filter((s) => s.count > 0)

  return (
    <>
      <style>{`
        @keyframes urgencyBannerSlideDown {
          from { transform: translateY(-40px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div
        role="region"
        aria-label="Urgent clinical items"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 16px',
          background: 'var(--bg-white)',
          borderBottom: '1px solid var(--border)',
          fontFamily: 'Inter, sans-serif',
          animation: 'urgencyBannerSlideDown 0.3s ease forwards',
          minHeight: '40px',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', flexShrink: 0, boxShadow: '0 0 0 2px rgba(239,68,68,0.25)' }} />
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '4px', flexShrink: 0 }}>
          Needs Attention
        </span>
        <span style={{ width: '1px', height: '20px', background: 'var(--border)', flexShrink: 0, marginRight: '4px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, flexWrap: 'wrap' }}>
          {segments.map((seg) => (
            <button
              key={seg.key}
              onClick={() => onFilterCategory(seg.key)}
              onMouseEnter={() => setHoveredSegment(seg.key)}
              onMouseLeave={() => setHoveredSegment(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '4px 10px', borderRadius: '20px',
                border: `1px solid ${seg.borderColor}`,
                background: hoveredSegment === seg.key ? seg.hoverBgColor : seg.bgColor,
                cursor: 'pointer', transition: 'all 0.2s', outline: 'none',
              }}
            >
              {seg.icon}
              <span style={{ fontSize: '12px', fontWeight: 600, color: seg.color, whiteSpace: 'nowrap' }}>
                {seg.label(seg.count)}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={handleDismiss}
          aria-label="Dismiss urgency banner"
          onMouseEnter={() => setHoveredSegment('__dismiss__')}
          onMouseLeave={() => setHoveredSegment(null)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '24px', height: '24px', borderRadius: '6px', border: 'none',
            background: hoveredSegment === '__dismiss__' ? 'var(--bg-gray)' : 'transparent',
            cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0, transition: 'background 0.2s', padding: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </>
  )
}
