'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sunrise, Sun, Sunset, RefreshCw, ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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

// --- Time-phase logic ---
type Phase = 'morning' | 'midday' | 'end_of_day'

interface PhaseConfig {
  label: string
  icon: LucideIcon
  accentFrom: string
  accentTo: string
}

const PHASE_CONFIG: Record<Phase, PhaseConfig> = {
  morning: {
    label: 'Morning Briefing',
    icon: Sunrise,
    accentFrom: '#F59E0B',
    accentTo: '#0D9488',
  },
  midday: {
    label: 'Midday Update',
    icon: Sun,
    accentFrom: '#0D9488',
    accentTo: '#3B82F6',
  },
  end_of_day: {
    label: 'End of Day Summary',
    icon: Sunset,
    accentFrom: '#6366F1',
    accentTo: '#8B5CF6',
  },
}

const FALLBACK_BRIEFINGS: Record<Phase, BriefingData> = {
  morning: {
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
  },
  midday: {
    narrative:
      "Midday check-in, Dr. Arbogast. You\u2019ve seen 5 of 8 patients so far. Robert Chen\u2019s headache evaluation flagged possible papilledema \u2014 Sarah ordered the MRI stat and results should be back by 3 PM. James Wilson\u2019s seizure workup is in progress; EEG is scheduled for tomorrow. Two new messages came in since this morning: Maria Garcia is asking about her Topiramate side effects (AI draft ready), and Helen Park\u2019s pharmacy sent a refill request for Keppra. One unsigned note from Robert Chen\u2019s visit needs your Assessment and Plan.",
    reasoning: [
      'Queried visits: 5 of 8 completed (3 remaining this afternoon)',
      'Queried imaging_orders: 1 stat MRI ordered for Robert Chen (pending)',
      'Queried patient_messages: 2 new since 8 AM (1 with AI draft ready)',
      'Queried refill_requests: 1 new (Helen Park \u2014 Keppra)',
      'Queried incomplete_docs: 1 unsigned note (Robert Chen \u2014 missing A&P)',
      'Queried wearable_alerts: Maria Santos fall alert acknowledged at 9:15 AM',
    ],
    urgent_count: 1,
    generated_at: new Date().toISOString(),
  },
  end_of_day: {
    narrative:
      "End of day wrap-up, Dr. Arbogast. All 8 patients have been seen. Two items need attention before you sign off: Robert Chen\u2019s note is still unsigned (Assessment and Plan sections missing \u2014 2 days overdue now). Helen Park\u2019s Keppra refill request is pending your approval. On the positive side, Robert Chen\u2019s MRI came back normal (no papilledema confirmed), Maria Santos\u2019 PT referral was placed, and James Wilson\u2019s EEG is confirmed for tomorrow at 9 AM. Three follow-up calls are queued for tonight \u2014 no manual action needed.",
    reasoning: [
      'Queried visits: 8 of 8 completed (100% for today)',
      'Queried incomplete_docs: 2 unsigned notes (Robert Chen 2d overdue, Helen Park)',
      'Queried refill_requests: 1 pending approval (Helen Park \u2014 Keppra)',
      'Queried imaging_results: 1 new (Robert Chen MRI Brain \u2014 normal)',
      'Queried referrals: Maria Santos PT referral placed at 2:30 PM',
      'Queried followup_sessions: 3 queued for tonight, 0 require manual review',
    ],
    urgent_count: 2,
    generated_at: new Date().toISOString(),
  },
}

function getCurrentPhase(): Phase {
  const hour = new Date().getHours()
  if (hour < 11) return 'morning'
  if (hour <= 15) return 'midday'
  return 'end_of_day'
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

export default function MorningBriefing(_props: MorningBriefingProps) {
  const [phase, setPhase] = useState<Phase>(getCurrentPhase)
  const [briefing, setBriefing] = useState<BriefingData>(() => ({
    ...FALLBACK_BRIEFINGS[getCurrentPhase()],
    generated_at: new Date().toISOString(),
  }))
  const [loading, setLoading] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const [regenerateHovered, setRegenerateHovered] = useState(false)
  const [spinning, setSpinning] = useState(false)

  const config = PHASE_CONFIG[phase]
  const PhaseIcon = config.icon
  const gradient = `linear-gradient(135deg, ${config.accentFrom}, ${config.accentTo})`

  // Check phase every 5 minutes; update briefing when phase changes
  useEffect(() => {
    const interval = setInterval(() => {
      const newPhase = getCurrentPhase()
      setPhase((prev) => {
        if (prev !== newPhase) {
          setBriefing({
            ...FALLBACK_BRIEFINGS[newPhase],
            generated_at: new Date().toISOString(),
          })
        }
        return newPhase
      })
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Regenerate simulates a brief loading state then refreshes the timestamp
  const handleRegenerate = useCallback(() => {
    setLoading(true)
    setSpinning(true)
    setTimeout(() => {
      setBriefing({
        ...FALLBACK_BRIEFINGS[phase],
        generated_at: new Date().toISOString(),
      })
      setLoading(false)
      setSpinning(false)
    }, 800)
  }, [phase])

  return (
    <div
      style={{
        background: gradient,
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
            <PhaseIcon size={18} color="#0D9488" />
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0' }}>
              {config.label}
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
            onClick={handleRegenerate}
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
