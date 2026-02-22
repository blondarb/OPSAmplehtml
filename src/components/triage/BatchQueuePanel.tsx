'use client'

import { useState } from 'react'
import type { BatchItem, TriageTier } from '@/lib/triage/types'
import TriageTierBadge from './TriageTierBadge'

interface BatchQueuePanelProps {
  items: BatchItem[]
  onTryAnother: () => void
}

const TIER_SEVERITY_ORDER: TriageTier[] = [
  'emergent', 'urgent', 'semi_urgent', 'routine_priority', 'routine', 'non_urgent', 'insufficient_data',
]

function sortByTierSeverity(items: BatchItem[]): BatchItem[] {
  return [...items].sort((a, b) => {
    if (!a.triageResult || !b.triageResult) return 0
    const aIdx = TIER_SEVERITY_ORDER.indexOf(a.triageResult.triage_tier)
    const bIdx = TIER_SEVERITY_ORDER.indexOf(b.triageResult.triage_tier)
    return aIdx - bIdx
  })
}

export default function BatchQueuePanel({ items, onTryAnother }: BatchQueuePanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const completed = items.filter(i => i.status === 'completed')
  const processing = items.filter(i => i.status === 'extracting' || i.status === 'triaging')
  const pending = items.filter(i => i.status === 'pending')
  const errors = items.filter(i => i.status === 'error')
  const sorted = sortByTierSeverity(completed)

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Progress header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#e2e8f0', marginBottom: '8px' }}>
          Batch Triage Results
        </h2>
        <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
          <span style={{ color: '#16A34A' }}>{completed.length} completed</span>
          {processing.length > 0 && <span style={{ color: '#CA8A04' }}>{processing.length} processing</span>}
          {pending.length > 0 && <span style={{ color: '#9CA3AF' }}>{pending.length} pending</span>}
          {errors.length > 0 && <span style={{ color: '#DC2626' }}>{errors.length} failed</span>}
        </div>
        {/* Progress bar */}
        <div style={{
          marginTop: '8px', height: '4px', borderRadius: '2px',
          backgroundColor: '#334155', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: '2px', backgroundColor: '#0D9488',
            width: `${items.length > 0 ? (completed.length / items.length) * 100 : 0}%`,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* Results list sorted by severity */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
        {sorted.map(item => (
          <div
            key={item.id}
            style={{
              border: '1px solid #334155', borderRadius: '8px',
              backgroundColor: '#1e293b', overflow: 'hidden',
            }}
          >
            {/* Summary row */}
            <button
              onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', padding: '10px 14px',
                border: 'none', backgroundColor: 'transparent',
                cursor: 'pointer', color: '#e2e8f0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {item.triageResult && (
                  <TriageTierBadge tier={item.triageResult.triage_tier} compact />
                )}
                <span style={{ fontSize: '14px' }}>
                  {item.filename || `Note ${item.id.slice(0, 8)}`}
                </span>
              </div>
              <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
                {expandedId === item.id ? 'Collapse' : 'Expand'}
              </span>
            </button>

            {/* Expanded details */}
            {expandedId === item.id && item.triageResult && (
              <div style={{ padding: '12px 14px', borderTop: '1px solid #334155' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: '#9CA3AF', fontWeight: 500 }}>Tier: </span>
                    <span style={{ color: '#e2e8f0' }}>{item.triageResult.triage_tier_display}</span>
                  </div>
                  <div>
                    <span style={{ color: '#9CA3AF', fontWeight: 500 }}>Confidence: </span>
                    <span style={{ color: '#e2e8f0' }}>{item.triageResult.confidence}</span>
                  </div>
                  {item.triageResult.clinical_reasons.length > 0 && (
                    <div>
                      <span style={{ color: '#9CA3AF', fontWeight: 500 }}>Top Reasons: </span>
                      <ul style={{ margin: '4px 0 0 16px', padding: 0, color: '#e2e8f0' }}>
                        {item.triageResult.clinical_reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {item.triageResult.red_flags.length > 0 && (
                    <div>
                      <span style={{ color: '#DC2626', fontWeight: 500 }}>Red Flags: </span>
                      <span style={{ color: '#FCA5A5' }}>{item.triageResult.red_flags.join('; ')}</span>
                    </div>
                  )}
                  <div>
                    <span style={{ color: '#9CA3AF', fontWeight: 500 }}>Subspecialty: </span>
                    <span style={{ color: '#e2e8f0' }}>{item.triageResult.subspecialty_recommendation}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Processing items */}
        {processing.map(item => (
          <div key={item.id} style={{
            padding: '10px 14px', borderRadius: '8px',
            backgroundColor: '#1e293b', border: '1px solid #334155',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{ color: '#CA8A04', fontSize: '14px' }}>Processing...</span>
            <span style={{ color: '#9CA3AF', fontSize: '13px' }}>{item.filename || `Note ${item.id.slice(0, 8)}`}</span>
          </div>
        ))}

        {/* Error items */}
        {errors.map(item => (
          <div key={item.id} style={{
            padding: '10px 14px', borderRadius: '8px',
            backgroundColor: '#1e293b', border: '1px solid #7F1D1D',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <span style={{ color: '#DC2626', fontSize: '14px' }}>{item.filename || `Note ${item.id.slice(0, 8)}`}</span>
              <p style={{ color: '#FCA5A5', fontSize: '12px', margin: '2px 0 0' }}>{item.error}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Try Another button */}
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={onTryAnother}
          style={{
            padding: '10px 24px', borderRadius: '8px',
            border: '1px solid #475569', backgroundColor: 'transparent',
            color: '#e2e8f0', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
          }}
        >
          Start New Batch
        </button>
      </div>
    </div>
  )
}
