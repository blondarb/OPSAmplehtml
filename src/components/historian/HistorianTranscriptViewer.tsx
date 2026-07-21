'use client'

import { useState } from 'react'
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

interface HistorianTranscriptViewerProps {
  entries: HistorianTranscriptEntry[]
  /**
   * Render already expanded, skipping the initial collapsed state. Use
   * when the viewer already lives inside its own on-demand toggle (e.g. a
   * tab that must be selected first) so the reader isn't forced through
   * two clicks. Default false — collapsed until the reader opts in.
   */
  defaultExpanded?: boolean
}

function formatOffset(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Collapsible physician-facing transcript turn list — role chip, mm:ss
 * offset, text. Renders whatever `entries` it's given; it does not fetch
 * anything itself (the durable transcript-event log has no GET endpoint
 * yet — this task renders from the already-saved `transcript` array).
 */
export default function HistorianTranscriptViewer({
  entries,
  defaultExpanded = false,
}: HistorianTranscriptViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div>
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary, #64748b)',
          fontSize: '0.75rem',
          fontWeight: 600,
          cursor: 'pointer',
          padding: '4px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
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
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {expanded ? 'Hide' : 'Show'} Transcript ({entries.length})
      </button>

      {expanded && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: 320,
            overflowY: 'auto',
            marginTop: 8,
          }}
        >
          {entries.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontStyle: 'italic', margin: 0 }}>
              No transcript available.
            </p>
          ) : (
            entries.map((entry, i) => (
              <div
                key={entry.seq ?? i}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: entry.role === 'assistant' ? 'rgba(13,148,136,0.06)' : 'rgba(139,92,246,0.06)',
                  borderLeft: `2px solid ${entry.role === 'assistant' ? '#0d9488' : '#8B5CF6'}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 2,
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                      color: entry.role === 'assistant' ? '#0d9488' : '#8B5CF6',
                    }}
                  >
                    {entry.role === 'assistant' ? 'AI' : 'Patient'}
                  </span>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontFamily: 'monospace',
                      color: 'var(--text-secondary, #64748b)',
                    }}
                  >
                    {formatOffset(entry.timestamp)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-primary, #1e293b)',
                    lineHeight: 1.4,
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                  }}
                >
                  {entry.text}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
