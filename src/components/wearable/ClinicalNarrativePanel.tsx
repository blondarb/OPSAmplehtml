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

function flagBg(level: SeverityFlag['level']): string {
  switch (level) {
    case 'green': return 'rgba(34,197,94,0.1)'
    case 'yellow': return 'rgba(234,179,8,0.1)'
    case 'orange': return 'rgba(249,115,22,0.1)'
    case 'red': return 'rgba(239,68,68,0.1)'
  }
}

interface Props {
  narrative: ClinicalNarrative
  accentColor?: string
}

export default function ClinicalNarrativePanel({ narrative, accentColor = '#818cf8' }: Props) {
  const [expanded, setExpanded] = useState(false)
  const summary = narrative.structured_summary

  return (
    <div style={{
      marginTop: '10px',
      padding: '12px',
      background: `rgba(129, 140, 248, 0.05)`,
      border: `1px solid rgba(129, 140, 248, 0.15)`,
      borderRadius: '8px',
    }}>
      {/* Header */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px' }}>🧠</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: accentColor }}>
            AI Clinical Narrative
          </span>
          <span style={{
            fontSize: '10px',
            color: '#64748b',
            background: 'rgba(100,116,139,0.1)',
            padding: '1px 6px',
            borderRadius: '4px',
          }}>
            {narrative.model_versions.stage1} → {narrative.model_versions.stage2}
          </span>
        </div>
        <span style={{ fontSize: '12px', color: '#64748b', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>
          ▼
        </span>
      </div>

      {/* Key Findings (always visible) */}
      {(summary?.key_findings?.length ?? 0) > 0 && (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {summary!.key_findings.map((finding, i) => (
            <div key={i} style={{ fontSize: '11px', color: '#cbd5e1', display: 'flex', gap: '6px' }}>
              <span style={{ color: accentColor }}>•</span>
              <span>{finding}</span>
            </div>
          ))}
        </div>
      )}

      {/* Severity Flags */}
      {(summary?.severity_flags?.length ?? 0) > 0 && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {summary!.severity_flags.map((flag, i) => (
            <span key={i} style={{
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '4px',
              background: flagBg(flag.level),
              color: flagColor(flag.level),
              border: `1px solid ${flagColor(flag.level)}30`,
            }}>
              {flag.metric}: {flag.note}
            </span>
          ))}
        </div>
      )}

      {/* Expanded Content */}
      {expanded && (
        <div style={{ marginTop: '12px', borderTop: '1px solid rgba(100,116,139,0.15)', paddingTop: '10px' }}>
          {summary?.pattern_analysis && (
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Pattern Analysis</span>
              <p style={{ fontSize: '11px', color: '#cbd5e1', margin: '4px 0 0', lineHeight: '1.5' }}>{summary.pattern_analysis}</p>
            </div>
          )}
          {summary?.clinical_considerations && (
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Clinical Considerations</span>
              <p style={{ fontSize: '11px', color: '#cbd5e1', margin: '4px 0 0', lineHeight: '1.5' }}>{summary.clinical_considerations}</p>
            </div>
          )}
          {narrative.clinical_narrative && (
            <div style={{ marginBottom: '4px' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Full Narrative</span>
              <p style={{ fontSize: '11px', color: '#cbd5e1', margin: '4px 0 0', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                {narrative.clinical_narrative}
              </p>
            </div>
          )}
          <div style={{ fontSize: '10px', color: '#475569', marginTop: '8px' }}>
            Generated {new Date(narrative.created_at).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  )
}
