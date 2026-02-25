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
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(8px, 2vw, 24px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: 'clamp(14px, 2vw, 20px) clamp(16px, 3vw, 24px)',
          borderBottom: '1px solid #334155',
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
            <h2 style={{ color: '#e2e8f0', fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
              {scenario.patientName}
            </h2>
            <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              {scenario.age}{scenario.sex} &middot; {scenario.referringSpecialty}
            </span>
          </div>

          <p style={{ color: '#cbd5e1', fontSize: '0.85rem', margin: '0 0 10px', lineHeight: 1.5 }}>
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
                  background: 'rgba(13, 148, 136, 0.15)',
                  color: '#5eead4',
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  border: '1px solid rgba(13, 148, 136, 0.3)',
                }}
              >
                {point}
              </span>
            ))}
            {scenario.files.length > 1 && (
              <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'rgba(234, 88, 12, 0.15)',
                color: '#fdba74',
                fontSize: '0.7rem',
                fontWeight: 500,
                border: '1px solid rgba(234, 88, 12, 0.3)',
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
                  borderBottom: '1px solid #1e293b',
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
                  <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 500 }}>
                    {file.docType}
                  </span>
                  <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                    {file.filename}
                  </span>
                </div>
              )}

              {/* Pre-extracted text */}
              <pre style={{
                color: '#cbd5e1',
                fontSize: '0.8rem',
                lineHeight: 1.65,
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
                background: '#1e293b',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #334155',
              }}>
                {file.previewText}
              </pre>
            </div>
          ))}
        </div>

        {/* Sticky footer */}
        <div style={{
          padding: 'clamp(12px, 2vw, 16px) clamp(16px, 3vw, 24px)',
          borderTop: '1px solid #334155',
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end',
          flexShrink: 0,
          background: '#0f172a',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              background: 'transparent',
              color: '#94a3b8',
              border: '1px solid #475569',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
          <button
            onClick={() => onLoad(scenario)}
            disabled={loading}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              background: loading ? '#78350f' : '#EA580C',
              color: '#fff',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {loading ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'demo-spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Loading PDFs...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
