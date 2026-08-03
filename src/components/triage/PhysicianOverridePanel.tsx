'use client'

import { useState } from 'react'
import { TriageTier, TIER_DISPLAY, OVERRIDE_CATEGORIES, OverrideCategory } from '@/lib/triage/types'

interface Props {
  sessionId: string
  currentTier: TriageTier
}

const ALL_TIERS: TriageTier[] = [
  'emergent', 'urgent', 'semi_urgent', 'routine_priority', 'routine', 'non_urgent',
]

export default function PhysicianOverridePanel({ sessionId, currentTier }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [selectedTier, setSelectedTier] = useState<TriageTier | ''>('')
  const [selectedReason, setSelectedReason] = useState<OverrideCategory | ''>('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const currentRank = ALL_TIERS.indexOf(currentTier)
  const escalationTiers =
    currentTier === 'insufficient_data'
      ? ALL_TIERS.slice(0, 3)
      : currentRank > 0
        ? ALL_TIERS.slice(0, currentRank)
        : []

  if (escalationTiers.length === 0) return null

  async function handleSubmit() {
    if (!selectedTier || !selectedReason) return
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch(`/api/triage/${sessionId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_tier: selectedTier,
          override_reason: selectedReason,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to submit override')
      }

      setSubmitted(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit override')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div style={{
        padding: '12px 16px',
        background: 'var(--nn-accent-wash)',
        border: '1px solid var(--nn-accent)',
        borderRadius: 'var(--nn-radius)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--nn-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span style={{ color: 'var(--nn-accent-ink)', fontSize: 'var(--nn-fs-sm)', fontWeight: 500 }}>
          Escalation recorded: {selectedTier && TIER_DISPLAY[selectedTier].label}
        </span>
      </div>
    )
  }

  return (
    <div style={{
      border: '1px solid var(--nn-line)',
      borderRadius: 'var(--nn-radius)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: 'var(--nn-surface-2)',
          border: 'none',
          color: 'var(--nn-ink-2)',
          fontSize: 'var(--nn-fs-sm)',
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        Clinician Escalation
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          aria-hidden="true"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div style={{ padding: '16px', background: 'var(--nn-surface)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label htmlFor="nn-override-tier" className="nn-label">
                Higher Urgency Tier
              </label>
              <select
                id="nn-override-tier"
                value={selectedTier}
                onChange={(e) => setSelectedTier(e.target.value as TriageTier)}
                className="nn-select"
              >
                <option value="">Select tier...</option>
                {escalationTiers.map(t => (
                  <option key={t} value={t}>{TIER_DISPLAY[t].label} — {TIER_DISPLAY[t].timeframe}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="nn-override-reason" className="nn-label">
                Reason for Override
              </label>
              <select
                id="nn-override-reason"
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value as OverrideCategory)}
                className="nn-select"
              >
                <option value="">Select reason...</option>
                {OVERRIDE_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {error && (
              <p style={{ color: 'var(--nn-t1)', fontSize: 'var(--nn-fs-sm)', margin: 0 }}>{error}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={!selectedTier || !selectedReason || submitting}
              className="nn-btn"
            >
              {submitting ? 'Submitting...' : 'Escalate Priority'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
