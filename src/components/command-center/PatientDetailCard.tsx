'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  FileText,
  Watch,
  CalendarCheck,
  MessageCircle,
  RefreshCw,
  Mail,
  Pill,
  Image,
  Phone,
  Brain,
  Activity,
  Inbox,
} from 'lucide-react'
import type { PatientSummaryResponse, PatientUrgency } from '@/lib/command-center/types'
import SourceBadge from './SourceBadge'

interface PatientDetailCardProps {
  patientId: string
  patientName: string
  urgency?: PatientUrgency
}

const URGENCY_COLORS: Record<PatientUrgency, string> = {
  urgent: '#EF4444',
  attention: '#F59E0B',
  watch: '#EAB308',
  stable: '#22C55E',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CATEGORY_ICONS: Record<string, React.ComponentType<any>> = {
  messages: Mail,
  refills: Pill,
  results: Image,
  wearables: Watch,
  followups: Phone,
  triage: Brain,
  scales: Activity,
  ehr: Inbox,
}

const QUICK_ACTIONS = [
  {
    label: 'View Chart',
    icon: FileText,
    color: '#0D9488',
    bg: 'rgba(13, 148, 136, 0.12)',
    border: '#115e59',
    hrefKey: 'chart' as const,
  },
  {
    label: 'View Wearable Data',
    icon: Watch,
    color: '#0EA5E9',
    bg: 'rgba(14, 165, 233, 0.12)',
    border: '#0c4a6e',
    hrefKey: 'wearable' as const,
  },
  {
    label: 'View Follow-Up',
    icon: CalendarCheck,
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: '#78350f',
    hrefKey: 'followup' as const,
  },
  {
    label: 'Send Message',
    icon: MessageCircle,
    color: '#8B5CF6',
    bg: 'rgba(139, 92, 246, 0.12)',
    border: '#4c1d95',
    hrefKey: null,
  },
]

function SkeletonBar({ width }: { width: string }) {
  return (
    <div
      style={{
        height: '14px',
        width,
        borderRadius: '4px',
        background: 'linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
      }}
    />
  )
}

function Divider() {
  return (
    <hr
      style={{
        border: 'none',
        borderTop: '1px solid #334155',
        margin: '14px 0',
      }}
    />
  )
}

export default function PatientDetailCard({
  patientId,
  patientName,
  urgency = 'stable',
}: PatientDetailCardProps) {
  const [data, setData] = useState<PatientSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [retryHovered, setRetryHovered] = useState(false)
  const [hoveredAction, setHoveredAction] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    fetch(`/api/command-center/patients/${patientId}/summary`)
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed')
        return res.json()
      })
      .then((json) => {
        if (!cancelled) {
          setData(json)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [patientId, retryKey])

  const borderColor = URGENCY_COLORS[urgency]

  return (
    <div
      style={{
        background: '#0f172a',
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: '0 0 8px 8px',
        padding: '16px 16px 16px 24px',
        margin: '0 0 4px 0',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Shimmer animation */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* Loading state */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <SkeletonBar width="90%" />
          <SkeletonBar width="70%" />
          <SkeletonBar width="80%" />
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: '#94a3b8',
            fontSize: '0.85rem',
          }}
        >
          <span>Unable to load patient details</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setRetryKey((k) => k + 1)
            }}
            onMouseEnter={() => setRetryHovered(true)}
            onMouseLeave={() => setRetryHovered(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #334155',
              background: retryHovered ? 'rgba(100, 116, 139, 0.15)' : 'transparent',
              color: '#94a3b8',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.15s ease',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      )}

      {/* Loaded state */}
      {!loading && !error && data && (
        <>
          {/* AI Summary */}
          <div>
            <h4
              style={{
                margin: '0 0 6px 0',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              AI Summary
            </h4>
            <p
              style={{
                margin: 0,
                fontSize: '0.9rem',
                color: '#cbd5e1',
                lineHeight: 1.6,
              }}
            >
              {data.ai_summary}
            </p>
          </div>

          <Divider />

          {/* Pending Items */}
          <div>
            <h4
              style={{
                margin: '0 0 8px 0',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Pending Items
            </h4>
            {data.pending_items.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>
                No pending items
              </p>
            ) : (
              <ul
                style={{
                  margin: 0,
                  padding: '0 0 0 4px',
                  listStyle: 'none',
                }}
              >
                {data.pending_items.map((item, idx) => {
                  const IconComp = CATEGORY_ICONS[item.category] || Inbox
                  return (
                    <li
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '4px 0',
                        fontSize: '0.85rem',
                        color: '#cbd5e1',
                      }}
                    >
                      <IconComp size={14} color="#64748b" />
                      <span style={{ flex: 1 }}>{item.description}</span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          color: '#475569',
                          background: '#1e293b',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.age}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <Divider />

          {/* Recent Events Timeline */}
          <div>
            <h4
              style={{
                margin: '0 0 8px 0',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Recent Events
            </h4>
            {data.recent_events.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>
                No recent events
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  paddingLeft: '4px',
                }}
              >
                {data.recent_events.map((evt, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '0.85rem',
                    }}
                  >
                    {/* Timeline dot */}
                    <div
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: '#475569',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: '#64748b', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                      {evt.date}
                    </span>
                    <span style={{ color: '#cbd5e1', flex: 1 }}>
                      {evt.event}
                    </span>
                    <SourceBadge source={evt.source} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <Divider />

          {/* Quick Action Buttons */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            {QUICK_ACTIONS.map((action) => {
              const IconComp = action.icon
              const isHovered = hoveredAction === action.label
              const href = action.hrefKey
                ? data.quick_links[action.hrefKey]
                : '#'

              return (
                <Link
                  key={action.label}
                  href={href}
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={() => setHoveredAction(action.label)}
                  onMouseLeave={() => setHoveredAction(null)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 12px',
                    borderRadius: '20px',
                    border: `1px solid ${action.border}`,
                    background: isHovered ? action.bg : 'transparent',
                    color: action.color,
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                    fontFamily: 'Inter, sans-serif',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <IconComp size={13} />
                  {action.label}
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
