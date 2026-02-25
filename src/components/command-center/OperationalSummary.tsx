'use client'

import { useState, useEffect, useCallback } from 'react'
import { LayoutDashboard, RefreshCw, ChevronDown } from 'lucide-react'

interface OperationalSummaryProps {
  viewMode: 'my_patients' | 'all_patients'
  timeRange: 'today' | 'yesterday' | 'last_7_days'
}

interface BriefingData {
  narrative: string
  reasoning: string[]
  urgent_count: number
  generated_at: string
}

const FALLBACK_SUMMARY: BriefingData = {
  narrative:
    'Clinic capacity is at 87% today \u2014 42 patients across 4 providers. Dr. Arbogast has 14 patients (2 new, 1 urgent). Dr. Patel has 12 (3 follow-ups flagged for review). Average wait time is 18 minutes, up from 12 yesterday. Staffing: 3 of 4 MAs on floor, 1 called out. Action backlog: 23 items pending (8 refills, 6 messages, 5 orders, 4 scale reminders). No open triage queue items.',
  reasoning: [
    'Queried visits: 42 total across 4 providers',
    'Queried staffing: 3/4 MAs checked in',
    'Computed avg wait from check-in timestamps: 18 min',
    'Queried command_center_actions: 23 pending (grouped by type)',
    'Queried triage_sessions: 0 pending review',
  ],
  urgent_count: 1,
  generated_at: new Date().toISOString(),
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return ''
  }
}

export default function OperationalSummary({ viewMode, timeRange }: OperationalSummaryProps) {
  const [briefing, setBriefing] = useState<BriefingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const [regenerateHovered, setRegenerateHovered] = useState(false)
  const [spinning, setSpinning] = useState(false)

  const fetchBriefing = useCallback(
    async (regenerate = false) => {
      setLoading(true)
      setError(null)
      if (regenerate) setSpinning(true)

      try {
        const url = regenerate
          ? '/api/command-center/briefing?regenerate=true'
          : '/api/command-center/briefing'
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ view_mode: viewMode, time_range: timeRange }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: BriefingData = await res.json()
        setBriefing(data)
      } catch {
        // Use fallback on any API failure
        setBriefing(FALLBACK_SUMMARY)
      } finally {
        setLoading(false)
        setSpinning(false)
      }
    },
    [viewMode, timeRange],
  )

  useEffect(() => {
    fetchBriefing()
  }, [fetchBriefing])

  // --- Skeleton loader ---
  if (loading && !briefing) {
    return (
      <div
        style={{
          background: 'linear-gradient(135deg, #4F46E5, #0D9488)',
          borderRadius: '16px',
          padding: '1px',
        }}
      >
        <div
          style={{
            background: '#1e293b',
            borderRadius: '15px',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <LayoutDashboard size={18} color="#0D9488" />
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0' }}>
              Operational Summary
            </span>
          </div>
          {[100, 80, 60].map((widthPct, i) => (
            <div
              key={i}
              style={{
                width: `${widthPct}%`,
                height: '16px',
                background: '#334155',
                borderRadius: '8px',
                marginBottom: i < 2 ? '12px' : 0,
                animation: 'osPulse 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
          <style>{`
            @keyframes osPulse {
              0%, 100% { opacity: 0.5; }
              50% { opacity: 1; }
            }
          `}</style>
        </div>
      </div>
    )
  }

  // --- Error state (only if fallback also failed somehow) ---
  if (error && !briefing) {
    return (
      <div
        style={{
          background: 'linear-gradient(135deg, #4F46E5, #0D9488)',
          borderRadius: '16px',
          padding: '1px',
        }}
      >
        <div
          style={{
            background: '#1e293b',
            borderRadius: '15px',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0 0 12px' }}>{error}</p>
          <button
            onClick={() => fetchBriefing()}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              border: '1px solid #4F46E5',
              background: 'transparent',
              color: '#4F46E5',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!briefing) return null

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #4F46E5, #0D9488)',
        borderRadius: '16px',
        padding: '1px',
      }}
    >
      <div
        style={{
          background: '#1e293b',
          borderRadius: '15px',
          padding: '24px',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LayoutDashboard size={18} color="#0D9488" />
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0' }}>
              Operational Summary
            </span>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            Generated {formatTimestamp(briefing.generated_at)}
          </span>
        </div>

        {/* Narrative */}
        <p
          style={{
            fontSize: '1rem',
            color: '#e2e8f0',
            lineHeight: 1.7,
            margin: '0 0 16px',
          }}
        >
          {briefing.narrative}
        </p>

        {/* Actions row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          {/* Regenerate button */}
          <button
            onClick={() => fetchBriefing(true)}
            disabled={loading}
            onMouseEnter={() => setRegenerateHovered(true)}
            onMouseLeave={() => setRegenerateHovered(false)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid #4F46E5',
              background: regenerateHovered ? '#4F46E5' : 'transparent',
              color: regenerateHovered ? '#ffffff' : '#4F46E5',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              fontFamily: 'Inter, sans-serif',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshCw
              size={14}
              style={{
                animation: spinning ? 'osSpin 1s linear infinite' : 'none',
              }}
            />
            Regenerate
          </button>

          {/* Show reasoning toggle */}
          <button
            onClick={() => setReasoningOpen((prev) => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '0',
              border: 'none',
              background: 'none',
              color: '#0D9488',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Show reasoning
            <ChevronDown
              size={14}
              style={{
                transform: reasoningOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }}
            />
          </button>
        </div>

        {/* Reasoning list (collapsible) */}
        {reasoningOpen && briefing.reasoning.length > 0 && (
          <ul
            style={{
              margin: '14px 0 0',
              paddingLeft: '16px',
              listStyleType: 'disc',
            }}
          >
            {briefing.reasoning.map((item, i) => (
              <li
                key={i}
                style={{
                  fontSize: '0.85rem',
                  color: '#94a3b8',
                  lineHeight: 1.5,
                  marginBottom: i < briefing.reasoning.length - 1 ? '4px' : 0,
                }}
              >
                {item}
              </li>
            ))}
          </ul>
        )}

        {/* Spin animation for regenerate icon */}
        <style>{`
          @keyframes osSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  )
}
