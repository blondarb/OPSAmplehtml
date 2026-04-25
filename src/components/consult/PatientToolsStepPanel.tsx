'use client'

import { useCallback, useState } from 'react'
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

const SECTION_LABELS: Record<string, string> = {
  chief_complaint: 'Chief Complaint',
  hpi: 'History of Present Illness',
  onset: 'Onset',
  location: 'Location',
  duration: 'Duration',
  character: 'Character',
  severity: 'Severity',
  aggravating_factors: 'Aggravating Factors',
  relieving_factors: 'Relieving Factors',
  timing: 'Timing',
  associated_symptoms: 'Associated Symptoms',
  current_medications: 'Current Medications',
  allergies: 'Allergies',
  past_medical_history: 'Past Medical History',
  past_surgical_history: 'Past Surgical History',
  family_history: 'Family History',
  social_history: 'Social History',
  review_of_systems: 'Review of Systems',
  functional_status: 'Functional Status',
  interval_changes: 'Interval Changes',
  treatment_response: 'Treatment Response',
  new_symptoms: 'New Symptoms',
  medication_changes: 'Medication Changes',
  side_effects: 'Side Effects',
}

function formatCorrectionsAsNotes(corrections: Record<string, string>): string {
  const entries = Object.entries(corrections).filter(([, v]) => v.trim().length > 0)
  if (entries.length === 0) return ''
  const lines = [
    'Physician corrections to AI-captured intake:',
    ...entries.map(([key, val]) => `- ${SECTION_LABELS[key] ?? key}: ${val.trim()}`),
  ]
  return lines.join('\n')
}

export default function PatientToolsStepPanel({ consultId, consult, onComplete, onSkip, onError }: PatientToolsStepPanelProps) {
  const [showTools, setShowTools] = useState(false)
  const [corrections, setCorrections] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const handleCorrectionsChange = useCallback((next: Record<string, string>) => {
    setCorrections(next)
  }, [])

  const persistCorrectionsAndContinue = useCallback(async () => {
    const noteText = formatCorrectionsAsNotes(corrections)
    if (!noteText) {
      onComplete()
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/neuro-consults/${consultId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: noteText }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Save failed (${res.status}): ${body.slice(0, 200)}`)
      }
      onComplete()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save corrections'
      onError(msg)
    } finally {
      setSaving(false)
    }
  }, [consultId, corrections, onComplete, onError])

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

        <IntakeReviewSection consult={consult} onCorrectionsChange={handleCorrectionsChange} />
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
          onClick={persistCorrectionsAndContinue}
          disabled={saving}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: 'none',
            background: saving ? '#475569' : '#0D9488',
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Confirm & Continue → Report'}
        </button>
      </div>
    </div>
  )
}
