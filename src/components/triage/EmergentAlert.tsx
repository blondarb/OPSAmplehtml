'use client'

import { useState } from 'react'

interface Props {
  reason: string | null
  onAcknowledge: () => void
}

/**
 * Emergent takeover — the one place a full-takeover treatment is correct
 * (brief Part 3). Strong, unmissable, and text-first: the instruction to
 * redirect to the ED never relies on color alone.
 */
export default function EmergentAlert({ reason, onAcknowledge }: Props) {
  const [visible, setVisible] = useState(true)

  if (!visible) return null

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="nn-emergent-title"
      aria-describedby="nn-emergent-body"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'rgba(20, 24, 26, 0.7)',
      }}
    >
      <div className="nn-emerg" style={{ maxWidth: '620px', width: '100%', background: 'var(--nn-t1-bg)' }}>
        <span className="nn-tier-num nn-num" style={{ color: 'var(--nn-t1)', background: 'var(--nn-surface)' }}>
          Tier 1 of 7
        </span>
        <p id="nn-emergent-title" className="nn-tier-name" style={{ color: 'var(--nn-t1)' }}>
          Emergent — do not schedule
        </p>
        <p id="nn-emergent-body">
          Redirect to the emergency department now. This patient requires
          immediate emergency evaluation — do <strong>not</strong> schedule an
          outpatient visit. Contact the referring provider and/or patient to
          redirect to the nearest ED.
        </p>
        {reason && (
          <p style={{ fontWeight: 500 }}>
            Reason: {reason}
          </p>
        )}
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => { setVisible(false); onAcknowledge() }}
            className="nn-btn nn-btn--danger"
            autoFocus
          >
            Acknowledge &amp; View Full Triage
          </button>
        </div>
      </div>
    </div>
  )
}
