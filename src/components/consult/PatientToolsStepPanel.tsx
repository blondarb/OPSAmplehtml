'use client'

import { useState } from 'react'
import PatientToolsPanel from '@/components/PatientToolsPanel'

interface PatientToolsStepPanelProps {
  consultId: string
  onComplete: () => void
  onSkip: () => void
  onError: (msg: string) => void
}

export default function PatientToolsStepPanel({ consultId, onComplete, onSkip, onError }: PatientToolsStepPanelProps) {
  const [showTools, setShowTools] = useState(false)

  return (
    <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 12, padding: 24 }}>
      <h3 style={{ color: '#E2E8F0', fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
        Step 3: Patient Self-Assessment Tools
      </h3>
      <p style={{ color: '#94A3B8', fontSize: 13, margin: '0 0 16px' }}>
        The patient can mark symptom locations on a body map, complete a finger tapping test, and
        record tremor measurements using their phone. These are optional but provide valuable objective data.
      </p>

      {!showTools ? (
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => setShowTools(true)}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: 'none',
              background: '#EC4899',
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Open Patient Tools
          </button>
          <a
            href={`/patient/tools?consult_id=${consultId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: '1px solid #475569',
              background: 'transparent',
              color: '#94A3B8',
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Open in New Tab ↗
          </a>
          <button
            onClick={onSkip}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: '1px solid #475569',
              background: 'transparent',
              color: '#94A3B8',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              marginLeft: 'auto',
            }}
          >
            Skip → Generate Report
          </button>
        </div>
      ) : (
        <div>
          <PatientToolsPanel consultId={consultId} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, gap: 12 }}>
            <button
              onClick={() => setShowTools(false)}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                border: '1px solid #475569',
                background: 'transparent',
                color: '#94A3B8',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Collapse
            </button>
            <button
              onClick={onComplete}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                border: 'none',
                background: '#0D9488',
                color: '#FFFFFF',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Continue → Generate Report
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
