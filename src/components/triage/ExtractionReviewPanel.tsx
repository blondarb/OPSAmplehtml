'use client'

import { useState } from 'react'
import type { ClinicalExtraction, NoteType } from '@/lib/triage/types'
import { buildExtractionSafetyView } from '@/lib/triage/extractionSafetyView'

interface ExtractionReviewPanelProps {
  extraction: ClinicalExtraction
  originalText: string
  onApprove: () => void
  onBack: () => void
  disabled?: boolean
  approvalBlockedReason?: string
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
  approvalBlockedReason,
}: ExtractionReviewPanelProps) {
  const [showFindings, setShowFindings] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)

  const noteType = NOTE_TYPE_LABELS[extraction.note_type_detected] || NOTE_TYPE_LABELS.unknown
  const confidence = CONFIDENCE_DISPLAY[extraction.extraction_confidence] || CONFIDENCE_DISPLAY.moderate
  const safetyView = buildExtractionSafetyView(extraction)
  const sourceTextVerified = Boolean(
    originalText.trim() &&
      Number.isSafeInteger(extraction.original_text_length) &&
      extraction.original_text_length === originalText.length,
  )
  const sourceVerificationBlockedReason = sourceTextVerified
    ? undefined
    : 'Authoritative original source text is unavailable or does not match the persisted source length. Do not approve; return for manual review.'
  const reviewBlockedReason = [
    approvalBlockedReason,
    sourceVerificationBlockedReason,
  ]
    .filter(Boolean)
    .join(' ')
  const approvalDisabled = Boolean(
    disabled ||
      reviewBlockedReason ||
      !extraction.extracted_summary.trim(),
  )

  const kf = extraction.key_findings

  return (
    <div className="nn-card" style={{ margin: 0, padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '8px',
          flexWrap: 'wrap',
        }}>
          <h2 className="nn-card-title" style={{ margin: 0 }}>
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
          <p style={{ fontSize: 'var(--nn-fs-sm)', color: 'var(--nn-ink-3)', margin: 0 }}>
            Source: {extraction.source_filename} ({(extraction.original_text_length / 1000).toFixed(1)}K characters)
          </p>
        )}
        {extraction.extraction_confidence === 'low' && (
          <p className="nn-alert" style={{ marginBottom: 0 }}>
            Low confidence extraction — the source document may not contain sufficient neurological information. Please review carefully.
          </p>
        )}
      </div>

      {safetyView.requiresImmediateAction && (
        <section
          aria-label="Complete-source safety alert"
          className={safetyView.severity === 'emergency' ? 'nn-flag' : 'nn-note'}
          style={{ margin: '0 0 20px' }}
        >
          {safetyView.severity === 'emergency' ? (
            <h4>{safetyView.title}</h4>
          ) : (
            <h3>{safetyView.title}</h3>
          )}
          <p>{safetyView.message}</p>
          {safetyView.evidence.length > 0 && (
            <div style={{ display: 'grid', gap: '8px', maxHeight: '240px', overflowY: 'auto', marginTop: '8px' }}>
              {safetyView.evidence.map((item, index) => (
                <blockquote
                  key={`${item.documentId}-${item.pageNumber}-${item.startOffset}-${index}`}
                  style={{
                    margin: 0,
                    padding: '8px 10px',
                    background: 'var(--nn-surface)',
                    borderLeft: '3px solid var(--nn-t1)',
                    borderRadius: '4px',
                    color: 'var(--nn-ink)',
                    fontSize: 'var(--nn-fs-xs)',
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ color: 'var(--nn-t1)', fontSize: '0.68rem' }}>
                    {item.syndrome.replace(/_/g, ' ')}
                    {item.pageNumber ? ` · page ${item.pageNumber}` : ''}
                  </div>
                  “{item.quote}”
                </blockquote>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Source-bound summary */}
      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="source-bound-extracted-summary" className="nn-label" style={{ marginBottom: '6px' }}>
          Extracted Summary
        </label>
        <textarea
          id="source-bound-extracted-summary"
          value={extraction.extracted_summary}
          readOnly
          disabled={disabled}
          rows={10}
          className="nn-textarea"
          style={{
            minHeight: '160px',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 'var(--nn-fs-base)',
            lineHeight: 1.6,
            opacity: disabled ? 0.5 : 1,
          }}
        />
        <p className="nn-hint" style={{ margin: '4px 0 0' }}>
          Review this source-bound extraction against the original. Do not approve if it is inaccurate; return it for manual review. Versioned clinician corrections are added in the next evidence-revision milestone.
        </p>
      </div>

      {reviewBlockedReason && (
        <div
          role="alert"
          className="nn-alert"
          style={{ marginTop: 0, marginBottom: '16px' }}
        >
          {reviewBlockedReason}
        </div>
      )}

      {/* Key findings (collapsible) */}
      <div style={{
        marginBottom: '12px',
        border: '1px solid var(--nn-line)',
        borderRadius: 'var(--nn-radius)',
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
            backgroundColor: 'var(--nn-surface-2)',
            cursor: 'pointer',
            fontSize: 'var(--nn-fs-sm)',
            fontWeight: 500,
            color: 'var(--nn-ink)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              aria-hidden="true"
              style={{ transform: showFindings ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Key Findings
          </span>
          <span style={{ fontSize: 'var(--nn-fs-xs)', color: 'var(--nn-ink-3)' }}>{showFindings ? 'Hide' : 'Show'}</span>
        </button>
        {showFindings && (
          <div style={{
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            borderTop: '1px solid var(--nn-line)',
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
        border: '1px solid var(--nn-line)',
        borderRadius: 'var(--nn-radius)',
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
            backgroundColor: 'var(--nn-surface-2)',
            cursor: 'pointer',
            fontSize: 'var(--nn-fs-sm)',
            fontWeight: 500,
            color: 'var(--nn-ink)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              aria-hidden="true"
              style={{ transform: showOriginal ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Original Text ({(originalText.length / 1000).toFixed(1)}K chars)
          </span>
          <span style={{ fontSize: 'var(--nn-fs-xs)', color: 'var(--nn-ink-3)' }}>{showOriginal ? 'Hide' : 'Show'}</span>
        </button>
        {showOriginal && (
          <div style={{
            padding: '12px 14px',
            maxHeight: '300px',
            overflowY: 'auto',
            fontSize: 'var(--nn-fs-sm)',
            color: 'var(--nn-ink-3)',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            borderTop: '1px solid var(--nn-line)',
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
          className="nn-btn nn-btn--sec"
        >
          Do Not Approve — Return to Intake
        </button>
        <button
          onClick={onApprove}
          disabled={approvalDisabled}
          className="nn-btn"
        >
          Approve Source-Bound Extraction
        </button>
      </div>
    </div>
  )
}

function FindingRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <span style={{
        fontSize: 'var(--nn-fs-xs)',
        fontWeight: 600,
        color: highlight ? 'var(--nn-t1)' : 'var(--nn-ink-3)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </span>
      <p style={{
        fontSize: 'var(--nn-fs-sm)',
        color: highlight ? 'var(--nn-t1)' : 'var(--nn-ink-2)',
        margin: '2px 0 0',
        lineHeight: 1.4,
        backgroundColor: highlight ? 'var(--nn-t1-bg)' : 'transparent',
        padding: highlight ? '4px 6px' : 0,
        borderRadius: highlight ? '4px' : 0,
      }}>
        {value}
      </p>
    </div>
  )
}
