'use client'

import { useState } from 'react'
import type { ClinicalNarrative, SeverityFlag } from '@/lib/wearable/types'

function flagColor(level: SeverityFlag['level']): string {
  switch (level) {
    case 'green': return '#22c55e'
    case 'yellow': return '#eab308'
    case 'orange': return '#f97316'
    case 'red': return '#ef4444'
  }
}

function trajectoryColor(trajectory?: string): string {
  switch (trajectory) {
    case 'improving': return '#22c55e'
    case 'stable': return '#3b82f6'
    case 'declining': return '#ef4444'
    case 'mixed': return '#eab308'
    default: return '#94a3b8'
  }
}

function trajectoryLabel(trajectory?: string): string {
  switch (trajectory) {
    case 'improving': return '↑ Improving'
    case 'stable': return '→ Stable'
    case 'declining': return '↓ Declining'
    case 'mixed': return '↔ Mixed'
    default: return 'Unknown'
  }
}

interface Props {
  narrative: ClinicalNarrative
  onRegenerate?: () => Promise<void>
}

export default function LongitudinalSummaryBanner({ narrative, onRegenerate }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [regenerating, setRegenerate] = useState(false)
  const summary = narrative.structured_summary
  const trendData = summary?.trend_data as Record<string, unknown> | undefined
  const trajectory = trendData?.trajectory_classification as string | undefined

  return (
    <div style={{
      padding: '14px 16px',
      background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.06))',
      border: '1px solid rgba(99,102,241,0.2)',
      borderRadius: '10px',
      marginBottom: '12px',
    }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '14px' }}>📊</span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#a78bfa' }}>
            30-Day Longitudinal Summary
          </span>
          {trajectory && (
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              color: trajectoryColor(trajectory),
              background: `${trajectoryColor(trajectory)}15`,
              padding: '2px 8px',
              borderRadius: '4px',
              border: `1px solid ${trajectoryColor(trajectory)}30`,
            }}>
              {trajectoryLabel(trajectory)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {onRegenerate && (
            <button
              onClick={async (e) => {
                e.stopPropagation()
                if (regenerating) return
                setRegenerate(true)
                try {
                  await onRegenerate()
                } finally {
                  setRegenerate(false)
                }
              }}
              disabled={regenerating}
              title="Regenerate summary"
              style={{
                background: 'none',
                border: 'none',
                padding: '2px',
                cursor: regenerating ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'color 0.15s',
                color: '#64748b',
              }}
              onMouseEnter={(e) => { if (!regenerating) e.currentTarget.style.color = '#a78bfa' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b' }}
            >
              {regenerating ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
                  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13.5 2.5v4h-4" />
                  <path d="M2.5 8a5.5 5.5 0 0 1 9.37-3.87L13.5 6.5" />
                  <path d="M2.5 13.5v-4h4" />
                  <path d="M13.5 8a5.5 5.5 0 0 1-9.37 3.87L2.5 9.5" />
                </svg>
              )}
            </button>
          )}
          <span style={{ fontSize: '12px', color: '#64748b', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>
            ▼
          </span>
        </div>
      </div>

      {/* Key findings (always visible) */}
      {(summary?.key_findings?.length ?? 0) > 0 && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {summary!.key_findings.map((finding, i) => (
            <div key={i} style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', gap: '6px' }}>
              <span style={{ color: '#a78bfa' }}>•</span>
              <span>{finding}</span>
            </div>
          ))}
        </div>
      )}

      {/* Severity flags */}
      {(summary?.severity_flags?.length ?? 0) > 0 && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {summary!.severity_flags.map((flag, i) => (
            <span key={i} style={{
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '4px',
              background: `${flagColor(flag.level)}15`,
              color: flagColor(flag.level),
              border: `1px solid ${flagColor(flag.level)}30`,
            }}>
              {flag.metric}: {flag.note}
            </span>
          ))}
        </div>
      )}

      {/* Expanded: full narrative */}
      {expanded && (
        <div style={{ marginTop: '12px', borderTop: '1px solid rgba(100,116,139,0.15)', paddingTop: '10px' }}>
          {summary?.pattern_analysis && (
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Cross-Metric Patterns</span>
              <p style={{ fontSize: '12px', color: '#cbd5e1', margin: '4px 0 0', lineHeight: '1.5' }}>{summary.pattern_analysis}</p>
            </div>
          )}
          {summary?.clinical_considerations && (
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Clinical Considerations</span>
              <p style={{ fontSize: '12px', color: '#cbd5e1', margin: '4px 0 0', lineHeight: '1.5' }}>{summary.clinical_considerations}</p>
            </div>
          )}
          {narrative.clinical_narrative && (
            <div>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Full Longitudinal Narrative</span>
              <p style={{ fontSize: '12px', color: '#cbd5e1', margin: '4px 0 0', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                {narrative.clinical_narrative}
              </p>
            </div>
          )}
          <div style={{ fontSize: '10px', color: '#475569', marginTop: '8px' }}>
            Generated {new Date(narrative.created_at).toLocaleString()} · Models: {narrative.model_versions.stage1} → {narrative.model_versions.stage2}
          </div>
        </div>
      )}
    </div>
  )
}
