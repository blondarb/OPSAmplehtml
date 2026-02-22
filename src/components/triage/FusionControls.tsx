'use client'

import { useState } from 'react'
import type { ClinicalExtraction, NoteType } from '@/lib/triage/types'

interface FusionControlsProps {
  extractions: ClinicalExtraction[]
  onFuse: (selectedExtractions: ClinicalExtraction[]) => void
  onSkip: () => void
  disabled?: boolean
}

const NOTE_TYPE_COLORS: Record<NoteType, string> = {
  ed_note: '#DC2626',
  pcp_note: '#2563EB',
  discharge_summary: '#8B5CF6',
  specialist_consult: '#EA580C',
  imaging_report: '#0D9488',
  referral: '#16A34A',
  unknown: '#6B7280',
}

const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  ed_note: 'ED Note',
  pcp_note: 'PCP Note',
  discharge_summary: 'Discharge Summary',
  specialist_consult: 'Specialist Consult',
  imaging_report: 'Imaging Report',
  referral: 'Referral',
  unknown: 'Unknown',
}

export default function FusionControls({
  extractions,
  onFuse,
  onSkip,
  disabled,
}: FusionControlsProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(extractions.map(e => e.extraction_id))
  )

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedExtractions = extractions.filter(e => selected.has(e.extraction_id))
  const canFuse = selectedExtractions.length >= 2

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>
          Multi-Note Fusion
        </h2>
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
          Select 2 or more notes to combine into a single comprehensive extraction before triage scoring.
        </p>
      </div>

      {/* Note checkboxes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
        {extractions.map(ext => {
          const isSelected = selected.has(ext.extraction_id)
          const color = NOTE_TYPE_COLORS[ext.note_type_detected] || '#6B7280'
          const label = NOTE_TYPE_LABELS[ext.note_type_detected] || 'Unknown'
          return (
            <label
              key={ext.extraction_id}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px', borderRadius: '8px',
                border: `1px solid ${isSelected ? '#0D9488' : '#334155'}`,
                backgroundColor: isSelected ? 'rgba(13, 148, 136, 0.08)' : '#1e293b',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.6 : 1,
                transition: 'border-color 0.15s',
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(ext.extraction_id)}
                disabled={disabled}
                style={{ accentColor: '#0D9488' }}
              />
              <span style={{
                fontSize: '11px', fontWeight: 600, color: '#FFFFFF',
                backgroundColor: color, padding: '2px 8px', borderRadius: '10px',
              }}>
                {label}
              </span>
              <span style={{ fontSize: '14px', color: '#e2e8f0', flex: 1 }}>
                {ext.source_filename || 'Pasted text'}
              </span>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {ext.extraction_confidence} conf.
              </span>
            </label>
          )
        })}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button
          onClick={onSkip}
          disabled={disabled}
          style={{
            padding: '10px 20px', borderRadius: '8px',
            border: '1px solid #475569', backgroundColor: 'transparent',
            color: '#e2e8f0', fontSize: '14px', cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          Triage Separately
        </button>
        <button
          onClick={() => onFuse(selectedExtractions)}
          disabled={disabled || !canFuse}
          style={{
            padding: '10px 20px', borderRadius: '8px',
            border: 'none', backgroundColor: canFuse && !disabled ? '#0D9488' : '#475569',
            color: '#FFFFFF', fontSize: '14px', fontWeight: 500,
            cursor: disabled || !canFuse ? 'not-allowed' : 'pointer',
          }}
        >
          Fuse {selectedExtractions.length} Notes & Triage
        </button>
      </div>
    </div>
  )
}
