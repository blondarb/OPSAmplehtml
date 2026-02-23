'use client'

import { useState } from 'react'
import { BatchItem, TIER_DISPLAY } from '@/lib/triage/types'
import TriageTierBadge from './TriageTierBadge'
import DisclaimerBanner from './DisclaimerBanner'

interface Props {
  items: BatchItem[]
  onTryAnother: () => void
}

export default function BatchResultsPanel({ items, onTryAnother }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const completed = items.filter(i => i.status === 'completed')
  const failed = items.filter(i => i.status === 'error')

  return (
    <div style={{
      background: '#0f172a',
      borderRadius: '12px',
      border: '1px solid #334155',
      padding: '24px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div>
          <h2 style={{ color: '#e2e8f0', fontSize: '1rem', fontWeight: 600, margin: '0 0 4px' }}>
            Batch Triage Results
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0 }}>
            {completed.length} of {items.length} processed
            {failed.length > 0 && ` · ${failed.length} failed`}
          </p>
        </div>
        <button
          onClick={onTryAnother}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            background: '#334155',
            color: '#e2e8f0',
            border: '1px solid #475569',
            fontSize: '0.8rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          New Batch
        </button>
      </div>

      {/* Results list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map((item) => {
          const isExpanded = expandedId === item.id
          const result = item.triageResult
          const tierConfig = result ? TIER_DISPLAY[result.triage_tier] : null

          return (
            <div
              key={item.id}
              style={{
                background: '#1e293b',
                borderRadius: '8px',
                border: `1px solid ${item.status === 'error' ? '#DC2626' : tierConfig ? tierConfig.borderColor : '#334155'}`,
                overflow: 'hidden',
              }}
            >
              {/* Summary row — always visible */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {/* File icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>

                {/* Filename */}
                <span style={{
                  color: '#e2e8f0',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.filename || 'Unknown file'}
                </span>

                {/* Status / Tier badge */}
                {item.status === 'error' ? (
                  <span style={{
                    color: '#fca5a5',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    padding: '2px 10px',
                    background: 'rgba(220, 38, 38, 0.15)',
                    borderRadius: '10px',
                    whiteSpace: 'nowrap',
                  }}>
                    Failed
                  </span>
                ) : item.status === 'extracting' || item.status === 'triaging' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : result ? (
                  <TriageTierBadge tier={result.triage_tier} compact />
                ) : null}

                {/* Subspecialty */}
                {result && result.triage_tier !== 'insufficient_data' && (
                  <span style={{
                    color: '#94a3b8',
                    fontSize: '0.75rem',
                    whiteSpace: 'nowrap',
                    display: 'none',
                  }}
                    className="batch-subspecialty"
                  >
                    {result.subspecialty_recommendation}
                  </span>
                )}

                {/* Expand arrow */}
                {result && (
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"
                    style={{
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                      flexShrink: 0,
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                )}
              </button>

              {/* Expanded details */}
              {isExpanded && result && (
                <div style={{
                  padding: '0 16px 16px',
                  borderTop: '1px solid #334155',
                }}>
                  {/* Tier + confidence */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 0',
                    flexWrap: 'wrap',
                  }}>
                    <TriageTierBadge
                      tier={result.triage_tier}
                      weightedScore={result.weighted_score}
                      isRedFlagOverride={result.red_flag_override}
                    />
                    <div>
                      <span style={{
                        color: result.confidence === 'high' ? '#16A34A' : result.confidence === 'moderate' ? '#CA8A04' : '#DC2626',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                      }}>
                        {result.confidence.charAt(0).toUpperCase() + result.confidence.slice(1)} Confidence
                      </span>
                      {result.subspecialty_recommendation && (
                        <p style={{ color: '#94a3b8', fontSize: '0.78rem', margin: '4px 0 0' }}>
                          Route to: {result.subspecialty_recommendation}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Red flags */}
                  {result.red_flags.length > 0 && (
                    <div style={{
                      padding: '10px 12px',
                      background: 'rgba(220, 38, 38, 0.08)',
                      border: '1px solid #991B1B',
                      borderRadius: '6px',
                      marginBottom: '10px',
                    }}>
                      <p style={{ color: '#fca5a5', fontSize: '0.78rem', fontWeight: 600, margin: '0 0 4px' }}>
                        Red Flags
                      </p>
                      <ul style={{ margin: 0, paddingLeft: '16px' }}>
                        {result.red_flags.map((flag, i) => (
                          <li key={i} style={{ color: '#fca5a5', fontSize: '0.75rem', lineHeight: 1.5 }}>
                            {flag}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Clinical reasons */}
                  {result.clinical_reasons.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <p style={{ color: '#cbd5e1', fontSize: '0.78rem', fontWeight: 600, margin: '0 0 4px' }}>
                        Clinical Reasoning
                      </p>
                      <ul style={{ margin: 0, paddingLeft: '16px' }}>
                        {result.clinical_reasons.map((reason, i) => (
                          <li key={i} style={{ color: '#94a3b8', fontSize: '0.75rem', lineHeight: 1.5 }}>
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Dimension scores */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '6px',
                  }}>
                    {Object.entries(result.dimension_scores).map(([key, dim]) => (
                      <div key={key} style={{
                        padding: '6px 8px',
                        background: '#0f172a',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                      }}>
                        <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{dim.score}/5</span>
                        <span style={{ color: '#94a3b8', marginLeft: '4px' }}>
                          {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error details */}
              {item.status === 'error' && item.error && (
                <div style={{
                  padding: '8px 16px 12px',
                  borderTop: '1px solid rgba(220, 38, 38, 0.3)',
                }}>
                  <p style={{ color: '#fca5a5', fontSize: '0.78rem', margin: 0 }}>
                    {item.error}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (min-width: 640px) {
          .batch-subspecialty { display: inline !important; }
        }
      `}</style>

      <DisclaimerBanner />
    </div>
  )
}
