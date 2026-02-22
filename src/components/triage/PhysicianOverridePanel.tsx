'use client'

import { useState } from 'react'
import { TriageTier, TIER_DISPLAY, OVERRIDE_CATEGORIES, OverrideCategory } from '@/lib/triage/types'

interface Props {
  sessionId: string
}

const ALL_TIERS: TriageTier[] = [
  'emergent', 'urgent', 'semi_urgent', 'routine_priority', 'routine', 'non_urgent',
]

export default function PhysicianOverridePanel({ sessionId }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [selectedTier, setSelectedTier] = useState<TriageTier | ''>('')
  const [selectedReason, setSelectedReason] = useState<OverrideCategory | ''>('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

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
        background: 'rgba(22, 163, 74, 0.1)',
        border: '1px solid #16A34A',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span style={{ color: '#16A34A', fontSize: '0.85rem', fontWeight: 500 }}>
          Override submitted: {selectedTier && TIER_DISPLAY[selectedTier].label}
        </span>
      </div>
    )
  }

  return (
    <div style={{
      border: '1px solid #334155',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: '#1e293b',
          border: 'none',
          color: '#94a3b8',
          fontSize: '0.8rem',
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        Physician Override
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div style={{ padding: '16px', background: '#0f172a' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>
                New Tier
              </label>
              <select
                value={selectedTier}
                onChange={(e) => setSelectedTier(e.target.value as TriageTier)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: '#1e293b',
                  color: '#e2e8f0',
                  border: '1px solid #475569',
                  fontSize: '0.85rem',
                }}
              >
                <option value="">Select tier...</option>
                {ALL_TIERS.map(t => (
                  <option key={t} value={t}>{TIER_DISPLAY[t].label} — {TIER_DISPLAY[t].timeframe}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>
                Reason for Override
              </label>
              <select
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value as OverrideCategory)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: '#1e293b',
                  color: '#e2e8f0',
                  border: '1px solid #475569',
                  fontSize: '0.85rem',
                }}
              >
                <option value="">Select reason...</option>
                {OVERRIDE_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {error && (
              <p style={{ color: '#DC2626', fontSize: '0.8rem', margin: 0 }}>{error}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={!selectedTier || !selectedReason || submitting}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                background: (!selectedTier || !selectedReason) ? '#334155' : '#EA580C',
                color: '#fff',
                border: 'none',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: (!selectedTier || !selectedReason) ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Override'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
