'use client'

import { useEffect, useCallback } from 'react'
import { DemoScenario, TIER_DISPLAY } from '@/lib/triage/types'

interface Props {
  scenario: DemoScenario
  onClose: () => void
  onLoad: (scenario: DemoScenario) => void
  loading?: boolean
}

export default function DemoPreviewModal({ scenario, onClose, onLoad, loading }: Props) {
  const tierConfig = TIER_DISPLAY[scenario.expectedTier]

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  return (
    <div
      onClick={onClose}
      className="nn-modal-backdrop"
      style={{ padding: 'clamp(8px, 2vw, 24px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nn-demo-preview-title"
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--nn-surface)',
          border: '1px solid var(--nn-line)',
          borderRadius: '12px',
          overflow: 'hidden',
          color: 'var(--nn-ink)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: 'clamp(14px, 2vw, 20px) clamp(16px, 3vw, 24px)',
          borderBottom: '1px solid var(--nn-line)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <span style={{
              padding: '3px 10px',
              borderRadius: '4px',
              background: tierConfig.bgColor,
              color: tierConfig.textColor,
              fontSize: '0.65rem',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}>
              {tierConfig.label}
            </span>
            <h2 id="nn-demo-preview-title" style={{ color: 'var(--nn-ink)', fontSize: 'var(--nn-fs-lg)', fontWeight: 600, margin: 0 }}>
              {scenario.patientName}
            </h2>
            <span style={{ color: 'var(--nn-ink-3)', fontSize: 'var(--nn-fs-sm)' }}>
              {scenario.age}{scenario.sex} &middot; {scenario.referringSpecialty}
            </span>
          </div>

          <p style={{ color: 'var(--nn-ink-2)', fontSize: 'var(--nn-fs-sm)', margin: '0 0 10px', lineHeight: 1.5 }}>
            {scenario.briefDescription}
          </p>

          {/* Demo points */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {scenario.demoPoints.map((point) => (
              <span
                key={point}
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'var(--nn-line-2)',
                  color: 'var(--nn-ink-2)',
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  border: '1px solid var(--nn-line)',
                }}
              >
                {point}
              </span>
            ))}
            {scenario.files.length > 1 && (
              <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'var(--nn-line-2)',
                color: 'var(--nn-ink-2)',
                fontSize: '0.7rem',
                fontWeight: 500,
                border: '1px solid var(--nn-line)',
              }}>
                {scenario.files.length} files
              </span>
            )}
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'clamp(14px, 2vw, 20px) clamp(16px, 3vw, 24px)',
        }}>
          {scenario.files.map((file, idx) => (
            <div key={file.filename} style={{ marginBottom: idx < scenario.files.length - 1 ? '24px' : 0 }}>
              {/* File header (for multi-file scenarios) */}
              {scenario.files.length > 1 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '10px',
                  paddingBottom: '8px',
                  borderBottom: '1px solid var(--nn-line-2)',
                }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: '#DC2626',
                    color: '#fff',
                    fontSize: '0.6rem',
                    fontWeight: 700,
                  }}>
                    PDF
                  </span>
                  <span style={{ color: 'var(--nn-ink)', fontSize: 'var(--nn-fs-sm)', fontWeight: 500 }}>
                    {file.docType}
                  </span>
                  <span style={{ color: 'var(--nn-ink-3)', fontSize: 'var(--nn-fs-xs)' }}>
                    {file.filename}
                  </span>
                </div>
              )}

              {/* Pre-extracted text */}
              <pre style={{
                color: 'var(--nn-ink)',
                fontSize: 'var(--nn-fs-sm)',
                lineHeight: 1.65,
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
                background: 'var(--nn-surface-2)',
                padding: '16px',
                borderRadius: 'var(--nn-radius)',
                border: '1px solid var(--nn-line)',
              }}>
                {file.previewText}
              </pre>
            </div>
          ))}
        </div>

        {/* Sticky footer */}
        <div style={{
          padding: 'clamp(12px, 2vw, 16px) clamp(16px, 3vw, 24px)',
          borderTop: '1px solid var(--nn-line)',
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end',
          flexShrink: 0,
          background: 'var(--nn-surface)',
        }}>
          <button
            onClick={onClose}
            className="nn-btn nn-btn--sec"
          >
            Close
          </button>
          <button
            onClick={() => onLoad(scenario)}
            disabled={loading}
            className="nn-btn"
          >
            {loading ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ animation: 'demo-spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Loading PDFs...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Load into Triage
              </>
            )}
          </button>
        </div>

        {loading && (
          <style>{`
            @keyframes demo-spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        )}
      </div>
    </div>
  )
}
