'use client'

import { useState } from 'react'

interface AiSuggestionPanelProps {
  /** The AI-generated suggestion text */
  suggestion: string
  /** Source of the suggestion */
  source: 'chart-prep' | 'visit-ai'
  /** Called when user accepts the suggestion */
  onAccept: () => void
  /** Called when user rejects the suggestion */
  onReject: () => void
  /** Whether the suggestion has been acted upon */
  status?: 'pending' | 'accepted' | 'rejected'
}

export default function AiSuggestionPanel({
  suggestion,
  source,
  onAccept,
  onReject,
  status = 'pending',
}: AiSuggestionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Don't show if already rejected
  if (status === 'rejected') return null

  const sourceLabel = source === 'chart-prep' ? 'Chart Prep' : 'Visit AI'
  const sourceColor = '#F59E0B'

  return (
    <div style={{
      marginTop: '8px',
      borderRadius: '6px',
      border: '1px solid',
      borderColor: isExpanded ? sourceColor : 'var(--border)',
      overflow: 'hidden',
      transition: 'all 0.2s',
    }}>
      {/* Toggle header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: isExpanded ? `${sourceColor}10` : 'var(--bg-gray)',
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* AI sparkle icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={sourceColor}
          >
            <path d="M12 1L13.5 9.5L22 12L13.5 14.5L12 23L10.5 14.5L2 12L10.5 9.5L12 1Z"/>
          </svg>
          <span style={{
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--text-secondary)',
          }}>
            {isExpanded ? 'AI Suggestion' : 'View AI suggestion'}
          </span>
          <span style={{
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '10px',
            background: `${sourceColor}20`,
            color: sourceColor,
            fontWeight: 500,
          }}>
            {sourceLabel}
          </span>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-secondary)"
          strokeWidth="2"
          style={{
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{
          padding: '12px',
          background: 'var(--bg-white)',
          borderTop: '1px solid var(--border)',
        }}>
          {/* Suggestion text */}
          <p style={{
            fontSize: '13px',
            color: 'var(--text-primary)',
            lineHeight: 1.5,
            marginBottom: '12px',
            whiteSpace: 'pre-wrap',
          }}>
            {suggestion}
          </p>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                onAccept()
                setIsExpanded(false)
              }}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                background: sourceColor,
                color: 'white',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Use this
            </button>
            <button
              onClick={() => {
                onReject()
                setIsExpanded(false)
              }}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg-white)',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
