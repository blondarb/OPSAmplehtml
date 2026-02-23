'use client'

import { useState } from 'react'

export default function BillingGuide() {
  const [expanded, setExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('billing-guide-seen') !== 'true'
    }
    return true
  })

  function handleToggle() {
    const next = !expanded
    setExpanded(next)
    if (!next && typeof window !== 'undefined') {
      localStorage.setItem('billing-guide-seen', 'true')
    }
  }

  return (
    <div style={{
      background: 'rgba(234,179,8,0.08)',
      border: '1px solid rgba(234,179,8,0.2)',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      <button
        onClick={handleToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#FBBF24',
          fontSize: '0.9rem',
          fontWeight: 600,
        }}
      >
        <span>📋 Billing Guide — What Counts as Billable Time?</span>
        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{expanded ? '▲ Collapse' : '▼ Expand'}</span>
      </button>

      {expanded && (
        <div style={{ padding: '0 20px 18px', color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: '#FBBF24' }}>Billable clinical staff time</strong> includes four phases:
          </p>
          <ul style={{ margin: '0 0 12px', paddingLeft: '20px' }}>
            <li><strong>Prep</strong> — Reviewing chart and prior visit before the call</li>
            <li><strong>Call Oversight</strong> — Clinician time monitoring or reviewing the AI conversation</li>
            <li><strong>Documentation Review</strong> — Reviewing and signing off on the AI-generated summary</li>
            <li><strong>Coordination</strong> — Time spent on follow-up actions (callbacks, prescription changes, referrals)</li>
          </ul>
          <p style={{ margin: '0 0 12px', color: '#f87171' }}>
            <strong>Not billable:</strong> AI processing time, automated message delivery, and system operations are NOT billable. Only human clinical staff time counts.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: '#FBBF24' }}>TCM (Transitional Care Management)</strong> — Per-event billing after hospital/facility discharge. Requires interactive contact within 2 business days and face-to-face visit within 7 or 14 days.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: '#FBBF24' }}>CCM (Chronic Care Management)</strong> — Monthly billing for ongoing care of patients with 2+ chronic conditions. Requires minimum time thresholds per CPT code. Time accumulates across all qualifying activities in the month.
          </p>
        </div>
      )}
    </div>
  )
}
