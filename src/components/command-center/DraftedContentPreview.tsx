'use client'

import { useState, useRef, useEffect } from 'react'

interface DraftedContentPreviewProps {
  content: string
  isExpanded: boolean
  onToggle: () => void
}

export default function DraftedContentPreview({
  content,
  isExpanded,
  onToggle,
}: DraftedContentPreviewProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight)
    }
  }, [content])

  return (
    <div style={{ marginTop: '8px' }}>
      <button
        onClick={onToggle}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          fontSize: '0.8rem',
          color: '#0D9488',
          cursor: 'pointer',
          fontFamily: 'Inter, sans-serif',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        {isExpanded ? 'Hide draft' : 'Show draft'}
        <span
          style={{
            display: 'inline-block',
            transition: 'transform 0.2s ease',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            fontSize: '0.75rem',
          }}
        >
          ▼
        </span>
      </button>

      <div
        style={{
          maxHeight: isExpanded ? `${contentHeight + 24}px` : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.25s ease',
        }}
      >
        <div
          ref={contentRef}
          style={{
            marginTop: '8px',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '12px',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '0.85rem',
              color: '#cbd5e1',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {content}
          </p>
        </div>
      </div>
    </div>
  )
}
