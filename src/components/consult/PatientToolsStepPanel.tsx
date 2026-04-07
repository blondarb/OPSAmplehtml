'use client'

import { useState } from 'react'
import type { NeurologyConsult } from '@/lib/consult/types'
import PatientToolsPanel from '@/components/PatientToolsPanel'
import IntakeReviewSection from './IntakeReviewSection'

interface PatientToolsStepPanelProps {
  consultId: string
  consult: NeurologyConsult | null
  onComplete: () => void
  onSkip: () => void
  onError: (msg: string) => void
}

export default function PatientToolsStepPanel({ consultId, consult, onComplete, onSkip }: PatientToolsStepPanelProps) {
  const [showTools, setShowTools] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Intake Review Section */}
      <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 12, padding: 24 }}>
        <h3 style={{ color: '#E2E8F0', fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
          Step 3: Review &amp; Patient Tools
        </h3>
        <p style={{ color: '#94A3B8', fontSize: 13, margin: '0 0 16px' }}>
          Review the information gathered from your interview. You can add notes or corrections
          to any section. Then complete optional assessment tools below.
        </p>

        <IntakeReviewSection consult={consult} />
      </div>

      {/* Patient Tools Section (body map, motor tests) */}
      <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 12, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h4 style={{ color: '#E2E8F0', fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>
              Assessment Tools
            </h4>
            <p style={{ color: '#94A3B8', fontSize: 12, margin: 0 }}>
              Optional: mark symptom locations on the body map, complete finger tapping tests, and record tremor measurements.
            </p>
          </div>
          <button
            onClick={() => setShowTools(!showTools)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #475569',
              background: showTools ? 'rgba(13, 148, 136, 0.1)' : 'transparent',
              color: showTools ? '#0D9488' : '#94A3B8',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {showTools ? 'Hide Tools' : 'Show Tools'}
          </button>
        </div>

        {showTools && (
          <PatientToolsPanel consultId={consultId} />
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
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
          }}
        >
          Skip → Generate Report
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
          Confirm &amp; Continue → Report
        </button>
      </div>
    </div>
  )
}
