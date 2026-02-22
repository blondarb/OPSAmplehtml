'use client'

import { useState, useRef, useEffect } from 'react'
import { SAMPLE_NOTES } from '@/lib/triage/sampleNotes'
import { TIER_DISPLAY, TriageTier } from '@/lib/triage/types'

interface Props {
  onSelect: (text: string) => void
}

const HINT_TO_TIER: Record<string, TriageTier> = {
  'Emergent': 'emergent',
  'Urgent': 'urgent',
  'Semi-urgent': 'semi_urgent',
  'Routine-priority': 'routine_priority',
  'Routine': 'routine',
  'Non-urgent': 'non_urgent',
  'Insufficient Data': 'insufficient_data',
}

export default function SampleNoteLoader({ onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: '8px 16px',
          borderRadius: '8px',
          background: '#334155',
          color: '#e2e8f0',
          border: '1px solid #475569',
          fontSize: '0.8rem',
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        Load Sample
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: '4px',
          width: '380px',
          maxHeight: '400px',
          overflowY: 'auto',
          background: '#1e293b',
          border: '1px solid #475569',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          zIndex: 50,
        }}>
          {SAMPLE_NOTES.map((note) => {
            const tierKey = HINT_TO_TIER[note.tierHint]
            const tierConfig = tierKey ? TIER_DISPLAY[tierKey] : null
            return (
              <button
                key={note.id}
                onClick={() => { onSelect(note.text); setOpen(false) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #334155',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: '#e2e8f0',
                  fontSize: '0.8rem',
                }}
              >
                {tierConfig && (
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: tierConfig.bgColor,
                    color: tierConfig.textColor,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    flexShrink: 0,
                    minWidth: '56px',
                    textAlign: 'center',
                  }}>
                    {note.tierHint}
                  </span>
                )}
                <span style={{ lineHeight: 1.3 }}>{note.title.replace(/^[^—]+— /, '')}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
