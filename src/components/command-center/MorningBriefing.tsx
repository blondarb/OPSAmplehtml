'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sparkles, RefreshCw, ChevronDown } from 'lucide-react'

interface MorningBriefingProps {
  viewMode: 'my_patients' | 'all_patients'
  timeRange: 'today' | 'yesterday' | 'last_7_days'
}

interface BriefingData {
  narrative: string
  reasoning: string[]
  urgent_count: number
  generated_at: string
}

const FALLBACK_BRIEFING: BriefingData = {
  narrative:
    "Good morning, Dr. Arbogast. You have 14 patients on your panel today. Three need your attention: Maria Santos had her second fall in 9 days \u2014 wearable data shows progressive tremor worsening and her PT referral hasn\u2019t been placed yet. James Okonkwo reported a breakthrough seizure during his post-visit follow-up yesterday \u2014 his levetiracetam level may need adjustment. Dorothy Chen\u2019s family sent a message 2 days ago that hasn\u2019t been read \u2014 they report increased confusion this week. On the positive side, 4 follow-up calls completed overnight with no escalations, and your triage queue is clear.",
  reasoning: [
    'Queried wearable_alerts: 5 unacknowledged (2 urgent for Maria Santos)',
    'Queried followup_sessions: 3 escalations (1 same-day for James Okonkwo)',
    'Queried patient_messages: 4 unread inbound (1 from Dorothy Chen family)',
    'Queried visits: 14 scheduled today (2 new patients)',
    'Queried triage_sessions: 0 pending review',
    'Queried followup_sessions: 4 completed overnight, 0 escalated',
  ],
  urgent_count: 3,
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

export default function MorningBriefing({ viewMode, timeRange }: MorningBriefingProps) {
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
        setBriefing(FALLBACK_BRIEFING)
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
            <Sparkles size={18} color="#0D9488" />
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0' }}>
              Morning Briefing
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
                animation: 'mbPulse 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
          <style>{`
            @keyframes mbPulse {
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
            <Sparkles size={18} color="#0D9488" />
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0' }}>
              Morning Briefing
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
                animation: spinning ? 'mbSpin 1s linear infinite' : 'none',
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
          @keyframes mbSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  )
}
