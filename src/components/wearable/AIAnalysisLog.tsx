'use client'

import { useState, useEffect, useRef } from 'react'
import type { WearableAnomaly, AIAnalysisResponse } from '@/lib/wearable/types'
import { SEVERITY_DISPLAY, ANOMALY_TYPE_DISPLAY, STATUS_DISPLAY } from '@/lib/wearable/types'

const LOADING_MESSAGES = [
  'Analyzing 7 days of wearable data...',
  'Detecting anomalous patterns...',
  'Comparing against personal baselines...',
  'Generating clinical assessment...',
  'Building reasoning chains...',
]

export default function AIAnalysisLog({
  patientId,
  anomalies,
}: {
  patientId: string
  anomalies: WearableAnomaly[]
}) {
  const [expandedAnomalies, setExpandedAnomalies] = useState<Set<string>>(new Set())
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResponse | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [expandedResults, setExpandedResults] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Rotate loading messages every 3 seconds during analysis
  useEffect(() => {
    if (analyzing) {
      let idx = 0
      setLoadingMessage(LOADING_MESSAGES[0])
      intervalRef.current = setInterval(() => {
        idx = (idx + 1) % LOADING_MESSAGES.length
        setLoadingMessage(LOADING_MESSAGES[idx])
      }, 3000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [analyzing])

  const toggleAnomaly = (id: string) => {
    setExpandedAnomalies((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runAnalysis = async () => {
    setAnalyzing(true)
    setAnalyzeError(null)
    setAnalysisResult(null)
    try {
      const res = await fetch('/api/wearable/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId, analysis_window_days: 7 }),
      })
      if (!res.ok) throw new Error(`Analysis failed (${res.status})`)
      const data: AIAnalysisResponse = await res.json()
      setAnalysisResult(data)
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  const trendArrow = (direction: string) => {
    if (direction === 'up' || direction === 'increasing') return '\u2191'
    if (direction === 'down' || direction === 'decreasing') return '\u2193'
    return '\u2192'
  }

  if (!anomalies || anomalies.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <h3 style={{ color: '#F1F5F9', fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
            AI Analysis Log
          </h3>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
            Every alert decision is explainable and auditable
          </p>
        </div>
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '48px 24px',
          textAlign: 'center',
        }}>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
            No data yet — sync from the Sevaro Monitor app to see results here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h3 style={{ color: '#F1F5F9', fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
          AI Analysis Log
        </h3>
        <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
          Every alert decision is explainable and auditable
        </p>
      </div>

      {/* Part A: Pre-loaded anomaly analysis cards */}
      {anomalies.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {anomalies.map((anomaly) => {
            const sev = SEVERITY_DISPLAY[anomaly.severity]
            const aType = ANOMALY_TYPE_DISPLAY[anomaly.anomaly_type]
            const isExpanded = expandedAnomalies.has(anomaly.id)

            return (
              <div
                key={anomaly.id}
                style={{
                  background: '#1E293B',
                  border: `1px solid ${sev.borderColor}`,
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
              >
                {/* Anomaly header */}
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    {/* Severity badge */}
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: sev.color,
                        background: sev.bgColor,
                        border: `1px solid ${sev.borderColor}`,
                      }}
                    >
                      {sev.label}
                    </span>
                    {/* Type badge */}
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '0.7rem',
                        fontWeight: 500,
                        color: '#94A3B8',
                        background: '#334155',
                      }}
                    >
                      {aType.label}
                    </span>
                    {/* Timestamp */}
                    <span style={{ fontSize: '0.7rem', color: '#64748B', marginLeft: 'auto' }}>
                      {new Date(anomaly.detected_at).toLocaleString()}
                    </span>
                  </div>

                  {/* AI Assessment */}
                  <p style={{ color: '#CBD5E1', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
                    {anomaly.ai_assessment}
                  </p>

                  {/* Expand/collapse reasoning chain */}
                  <button
                    onClick={() => toggleAnomaly(anomaly.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#3B82F6',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      padding: '6px 0 0 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                      }}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    Reasoning Chain
                  </button>
                </div>

                {/* Expanded reasoning chain */}
                {isExpanded && (
                  <div
                    style={{
                      borderTop: '1px solid #334155',
                      padding: '14px 16px',
                      background: 'rgba(15, 23, 42, 0.5)',
                    }}
                  >
                    {/* AI reasoning text */}
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        AI Reasoning
                      </div>
                      <p style={{ color: '#CBD5E1', fontSize: '0.8rem', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                        {anomaly.ai_reasoning}
                      </p>
                    </div>

                    {/* Clinical significance */}
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Clinical Significance
                      </div>
                      <p style={{ color: '#CBD5E1', fontSize: '0.8rem', lineHeight: 1.6, margin: 0 }}>
                        {anomaly.clinical_significance}
                      </p>
                    </div>

                    {/* Recommended action */}
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Recommended Action
                      </div>
                      <p style={{ color: '#CBD5E1', fontSize: '0.8rem', lineHeight: 1.6, margin: 0 }}>
                        {anomaly.recommended_action}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {anomalies.length === 0 && !analysisResult && !analyzing && (
        <p style={{ color: '#64748B', fontSize: '0.85rem', fontStyle: 'italic' }}>
          No anomalies detected in the current data window.
        </p>
      )}

      {/* Part B: Live AI Analysis */}
      <div
        style={{
          background: '#1E293B',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <div style={{ color: '#F1F5F9', fontSize: '0.95rem', fontWeight: 600 }}>
              Live AI Analysis
            </div>
            <div style={{ color: '#64748B', fontSize: '0.75rem', marginTop: '2px' }}>
              Run a fresh analysis across the past 7 days of data
            </div>
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: analyzing ? '#334155' : '#3B82F6',
              color: analyzing ? '#64748B' : '#FFFFFF',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: analyzing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background 0.2s ease',
            }}
          >
            {analyzing ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
            {analyzing ? 'Analyzing...' : 'Run AI Analysis'}
          </button>
        </div>

        {/* Loading state */}
        {analyzing && (
          <div
            style={{
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '6px',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#3B82F6',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
            <span style={{ color: '#93C5FD', fontSize: '0.85rem' }}>{loadingMessage}</span>
          </div>
        )}

        {/* Error state */}
        {analyzeError && (
          <div
            style={{
              background: 'rgba(220, 38, 38, 0.08)',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              borderRadius: '6px',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ color: '#FCA5A5', fontSize: '0.85rem' }}>{analyzeError}</span>
            <button
              onClick={runAnalysis}
              style={{
                padding: '4px 12px',
                borderRadius: '4px',
                border: '1px solid #DC2626',
                background: 'transparent',
                color: '#FCA5A5',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Analysis result */}
        {analysisResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Overall status badge */}
            {(() => {
              const st = STATUS_DISPLAY[analysisResult.overall_status]
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 12px',
                      borderRadius: '9999px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: st.color,
                      background: st.bgColor,
                      border: `1px solid ${st.borderColor}`,
                    }}
                  >
                    <span>{st.icon}</span>
                    {st.label}
                  </span>
                  <span style={{ color: '#64748B', fontSize: '0.75rem' }}>
                    {analysisResult.analysis_period}
                  </span>
                </div>
              )
            })()}

            {/* Narrative summary */}
            <p style={{ color: '#CBD5E1', fontSize: '0.85rem', lineHeight: 1.6, margin: 0 }}>
              {analysisResult.narrative_summary}
            </p>

            {/* Anomalies found (expandable) */}
            {analysisResult.anomalies.length > 0 && (
              <div>
                <button
                  onClick={() => setExpandedResults(!expandedResults)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#3B82F6',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      transform: expandedResults ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                    }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  {analysisResult.anomalies.length} Anomal{analysisResult.anomalies.length === 1 ? 'y' : 'ies'} Found
                </button>

                {expandedResults && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                    {analysisResult.anomalies.map((a, i) => {
                      const sev = SEVERITY_DISPLAY[a.severity]
                      const aType = ANOMALY_TYPE_DISPLAY[a.anomaly_type]
                      return (
                        <div
                          key={i}
                          style={{
                            background: 'rgba(15, 23, 42, 0.5)',
                            border: '1px solid #334155',
                            borderRadius: '6px',
                            padding: '10px 12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                            <span
                              style={{
                                padding: '1px 6px',
                                borderRadius: '9999px',
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                color: sev.color,
                                background: sev.bgColor,
                              }}
                            >
                              {sev.label}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                              {aType?.label || a.anomaly_type}
                            </span>
                          </div>
                          <p style={{ color: '#CBD5E1', fontSize: '0.8rem', lineHeight: 1.5, margin: '0 0 4px 0' }}>
                            {a.description}
                          </p>
                          <p style={{ color: '#94A3B8', fontSize: '0.75rem', lineHeight: 1.4, margin: 0 }}>
                            Action: {a.recommended_action}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Trends observed */}
            {analysisResult.trends_observed.length > 0 && (
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Trends Observed
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {analysisResult.trends_observed.map((trend, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#64748B', fontSize: '0.8rem' }}>{trendArrow('neutral')}</span>
                      <span style={{ color: '#CBD5E1', fontSize: '0.8rem' }}>{trend}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Data quality notes */}
            {analysisResult.data_quality_notes.length > 0 && (
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Data Quality Notes
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {analysisResult.data_quality_notes.map((note, i) => (
                    <span key={i} style={{ color: '#94A3B8', fontSize: '0.75rem', lineHeight: 1.4 }}>
                      {note}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inline keyframe styles */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
