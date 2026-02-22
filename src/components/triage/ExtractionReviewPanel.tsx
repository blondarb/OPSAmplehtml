'use client'

import { useState } from 'react'
import type { ClinicalExtraction, NoteType } from '@/lib/triage/types'

interface ExtractionReviewPanelProps {
  extraction: ClinicalExtraction
  originalText: string
  onApprove: (editedSummary: string) => void
  onBack: () => void
  disabled?: boolean
}

const NOTE_TYPE_LABELS: Record<NoteType, { label: string; color: string }> = {
  ed_note: { label: 'ED Note', color: '#DC2626' },
  pcp_note: { label: 'PCP Note', color: '#2563EB' },
  discharge_summary: { label: 'Discharge Summary', color: '#8B5CF6' },
  specialist_consult: { label: 'Specialist Consult', color: '#EA580C' },
  imaging_report: { label: 'Imaging Report', color: '#0D9488' },
  referral: { label: 'Referral', color: '#16A34A' },
  unknown: { label: 'Unknown Type', color: '#6B7280' },
}

const CONFIDENCE_DISPLAY: Record<string, { color: string; label: string }> = {
  high: { color: '#16A34A', label: 'High Confidence' },
  moderate: { color: '#CA8A04', label: 'Moderate Confidence' },
  low: { color: '#DC2626', label: 'Low Confidence' },
}

export default function ExtractionReviewPanel({
  extraction,
  originalText,
  onApprove,
  onBack,
  disabled,
}: ExtractionReviewPanelProps) {
  const [editedSummary, setEditedSummary] = useState(extraction.extracted_summary)
  const [showFindings, setShowFindings] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)

  const noteType = NOTE_TYPE_LABELS[extraction.note_type_detected] || NOTE_TYPE_LABELS.unknown
  const confidence = CONFIDENCE_DISPLAY[extraction.extraction_confidence] || CONFIDENCE_DISPLAY.moderate

  const kf = extraction.key_findings

  return (
    <div style={{
      background: '#0f172a',
      borderRadius: '12px',
      border: '1px solid #334155',
      padding: '24px',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '8px',
          flexWrap: 'wrap',
        }}>
          <h2 style={{ color: '#e2e8f0', fontSize: '1rem', fontWeight: 600, margin: 0 }}>
            Extraction Review
          </h2>
          {/* Note type badge */}
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: '#FFFFFF',
            backgroundColor: noteType.color,
            padding: '3px 10px',
            borderRadius: '12px',
          }}>
            {noteType.label}
          </span>
          {/* Confidence */}
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '0.8rem',
            color: confidence.color,
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: confidence.color,
              display: 'inline-block',
            }} />
            {confidence.label}
          </span>
        </div>
        {extraction.source_filename && (
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
            Source: {extraction.source_filename} ({(extraction.original_text_length / 1000).toFixed(1)}K characters)
          </p>
        )}
        {extraction.extraction_confidence === 'low' && (
          <p style={{
            fontSize: '0.8rem',
            color: '#FCA5A5',
            marginTop: '8px',
            padding: '8px 12px',
            backgroundColor: 'rgba(220, 38, 38, 0.15)',
            borderRadius: '6px',
            border: '1px solid rgba(220, 38, 38, 0.3)',
          }}>
            Low confidence extraction — the source document may not contain sufficient neurological information. Please review carefully.
          </p>
        )}
      </div>

      {/* Editable summary */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{
          display: 'block',
          fontSize: '0.85rem',
          fontWeight: 500,
          color: '#e2e8f0',
          marginBottom: '6px',
        }}>
          Extracted Summary (editable)
        </label>
        <textarea
          value={editedSummary}
          onChange={(e) => setEditedSummary(e.target.value)}
          disabled={disabled}
          rows={10}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '8px',
            background: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid #475569',
            fontSize: '0.9rem',
            lineHeight: 1.6,
            resize: 'vertical',
            minHeight: '160px',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            boxSizing: 'border-box',
            opacity: disabled ? 0.5 : 1,
          }}
        />
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
          Edit the summary above to correct or add information before triage scoring.
        </p>
      </div>

      {/* Key findings (collapsible) */}
      <div style={{
        marginBottom: '12px',
        border: '1px solid #334155',
        borderRadius: '8px',
        overflow: 'hidden',
      }}>
        <button
          onClick={() => setShowFindings(!showFindings)}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            border: 'none',
            backgroundColor: '#1e293b',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
            color: '#e2e8f0',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: showFindings ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Key Findings
          </span>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{showFindings ? 'Hide' : 'Show'}</span>
        </button>
        {showFindings && (
          <div style={{
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            borderTop: '1px solid #334155',
          }}>
            {kf.chief_complaint && (
              <FindingRow label="Chief Complaint" value={kf.chief_complaint} />
            )}
            {kf.neurological_symptoms.length > 0 && (
              <FindingRow label="Neurological Symptoms" value={kf.neurological_symptoms.join('; ')} />
            )}
            {kf.timeline && (
              <FindingRow label="Timeline" value={kf.timeline} />
            )}
            {kf.relevant_history && (
              <FindingRow label="Relevant History" value={kf.relevant_history} />
            )}
            {kf.medications_and_therapies.length > 0 && (
              <FindingRow label="Medications" value={kf.medications_and_therapies.join('; ')} />
            )}
            {kf.failed_therapies.length > 0 && (
              <FindingRow
                label="Failed Therapies"
                value={kf.failed_therapies.map(t => `${t.therapy}${t.reason_stopped ? ` (${t.reason_stopped})` : ''}`).join('; ')}
              />
            )}
            {kf.imaging_results.length > 0 && (
              <FindingRow label="Imaging Results" value={kf.imaging_results.join('; ')} />
            )}
            {kf.red_flags_noted.length > 0 && (
              <FindingRow label="Red Flags" value={kf.red_flags_noted.join('; ')} highlight />
            )}
            {kf.functional_status && (
              <FindingRow label="Functional Status" value={kf.functional_status} />
            )}
          </div>
        )}
      </div>

      {/* Original text (collapsible) */}
      <div style={{
        marginBottom: '20px',
        border: '1px solid #334155',
        borderRadius: '8px',
        overflow: 'hidden',
      }}>
        <button
          onClick={() => setShowOriginal(!showOriginal)}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            border: 'none',
            backgroundColor: '#1e293b',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
            color: '#e2e8f0',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: showOriginal ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Original Text ({(originalText.length / 1000).toFixed(1)}K chars)
          </span>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{showOriginal ? 'Hide' : 'Show'}</span>
        </button>
        {showOriginal && (
          <div style={{
            padding: '12px 14px',
            maxHeight: '300px',
            overflowY: 'auto',
            fontSize: '0.8rem',
            color: '#94a3b8',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            borderTop: '1px solid #334155',
          }}>
            {originalText}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{
        display: 'flex',
        gap: '12px',
        justifyContent: 'flex-end',
        alignItems: 'center',
      }}>
        <button
          onClick={onBack}
          disabled={disabled}
          style={{
            padding: '12px 20px',
            borderRadius: '8px',
            background: 'transparent',
            color: '#94a3b8',
            border: '1px solid #475569',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          Back
        </button>
        <button
          onClick={() => onApprove(editedSummary)}
          disabled={disabled || !editedSummary.trim()}
          style={{
            padding: '12px 32px',
            borderRadius: '8px',
            border: 'none',
            background: disabled || !editedSummary.trim() ? '#334155' : '#0D9488',
            color: '#FFFFFF',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: disabled || !editedSummary.trim() ? 'not-allowed' : 'pointer',
            opacity: disabled || !editedSummary.trim() ? 0.6 : 1,
          }}
        >
          Approve & Triage
        </button>
      </div>
    </div>
  )
}

function FindingRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <span style={{
        fontSize: '0.7rem',
        fontWeight: 600,
        color: highlight ? '#FCA5A5' : '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </span>
      <p style={{
        fontSize: '0.8rem',
        color: highlight ? '#FCA5A5' : '#cbd5e1',
        margin: '2px 0 0',
        lineHeight: 1.4,
        backgroundColor: highlight ? 'rgba(220, 38, 38, 0.15)' : 'transparent',
        padding: highlight ? '4px 6px' : 0,
        borderRadius: highlight ? '4px' : 0,
      }}>
        {value}
      </p>
    </div>
  )
}
